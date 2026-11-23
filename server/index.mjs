import express from 'express';
import compression from 'compression';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { UA_STRING, fetchText } from './lib/http.mjs';
import { getSource, listSources, DEFAULT_SOURCE } from './sources/registry.mjs';
import * as jikan from './sources/jikan.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(compression());
app.use(express.json());

const ok = (res, data) => res.set('cache-control', 'public, max-age=60').json(data);
const fail = (res, err, code = 502) => res.status(code).json({ error: String(err?.message || err) });

// ---------- metadados ----------
app.get('/api/sources', (_req, res) => res.json({ default: DEFAULT_SOURCE, sources: listSources() }));

// ---------- home / catálogo / busca ----------
app.get(['/api/home', '/api/home/:source'], async (req, res) => {
  const src = getSource(req.params.source);
  try {
    const data = await src.home();
    ok(res, { source: src.meta.id, ...data });
  } catch (e) { fail(res, e); }
});

app.get(['/api/catalog', '/api/catalog/:source'], async (req, res) => {
  const src = getSource(req.params.source);
  try { ok(res, { source: src.meta.id, ...(await src.catalog(Number(req.query.page) || 1)) }); }
  catch (e) { fail(res, e); }
});

app.get(['/api/search', '/api/search/:source'], async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ q, results: [] });
  const one = req.params.source ? [getSource(req.params.source)] : [...new Set([getSource(), ...listSources().map(s => getSource(s.id))])];
  const results = [];
  await Promise.all(one.map(async s => {
    try {
      const items = await s.search(q);
      items.forEach(i => results.push({ ...i, source: s.meta.id, sourceName: s.meta.name }));
    } catch {}
  }));
  ok(res, { q, results });
});

// ---------- detalhe ----------
app.get(['/api/anime/:slug', '/api/anime/:source/:slug'], async (req, res) => {
  const src = getSource(req.params.source);
  try { ok(res, await src.anime(req.params.slug)); }
  catch (e) { fail(res, e); }
});

// ---------- streams ----------
app.get(['/api/streams/:slug/:ep', '/api/streams/:source/:slug/:ep'], async (req, res) => {
  const src = getSource(req.params.source);
  try {
    const data = await src.streams(req.params.slug, decodeURIComponent(req.params.ep), req.query.audio || 'leg');
    res.set('cache-control', 'no-store').json(data);
  } catch (e) { fail(res, e); }
});

// ---------- calendário ----------
app.get('/api/seasons', async (_req, res) => {
  const year = new Date().getFullYear();
  res.json({ year, seasons: jikan.seasons.map(s => ({ id: s, name: s })) });
});

app.get('/api/seasons/:year/:season', async (req, res) => {
  try { ok(res, await jikan.season(Number(req.params.year), req.params.season)); }
  catch (e) { fail(res, e); }
});

app.get('/api/calendar', async (_req, res) => {
  try { ok(res, await jikan.now()); } catch (e) { fail(res, e); }
});

// ---------- proxy de imagem ----------
const IMG_HOSTS = /(^|\.)(animesonline\.blue|animefire\.io|betteranime\.net|animesroll\.com|anitube\.vip|myanimelist\.net|mal-cdn\.com|cdn\.myanimelist\.net|blogger\.googleusercontent\.com|googleusercontent\.com)$/;

app.get('/img', async (req, res) => {
  try {
    const u = new URL(String(req.query.u));
    if (!IMG_HOSTS.test(u.hostname)) return res.status(403).end();
    const r = await fetch(u.toString(), {
      headers: { 'user-agent': UA_STRING, referer: req.query.ref || `${u.protocol}//${u.hostname}/` },
    });
    if (!r.ok) return res.status(r.status).end();
    res.set('cache-control', 'public, max-age=86400');
    res.set('content-type', r.headers.get('content-type') || 'image/jpeg');
    Readable.fromWeb(r.body).pipe(res);
  } catch { res.status(502).end(); }
});

// ---------- proxy de stream ----------
const STREAM_HOSTS = /(^|\.)(googlevideo\.com|blogger\.com|googleusercontent\.com|akamaized\.net|cloudfront\.net)$/;

app.get('/api/proxy-stream', async (req, res) => {
  try {
    const u = new URL(String(req.query.u));
    if (!STREAM_HOSTS.test(u.hostname)) return res.status(403).end();
    const headers = {
      'user-agent': UA_STRING,
      referer: req.query.ref || 'https://www.blogger.com/',
      origin: 'https://www.blogger.com',
    };
    if (req.headers.range) headers.range = req.headers.range;
    const r = await fetch(u.toString(), { headers });
    res.status(r.status);
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const v = r.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    res.setHeader('cache-control', 'no-store');
    Readable.fromWeb(r.body).pipe(res);
  } catch { res.status(502).end(); }
});

// ---------- HLS ----------
app.get('/api/hls', async (req, res) => {
  try {
    const target = new URL(String(req.query.u));
    const r = await fetchText(target.toString(), { referer: req.query.ref || undefined });
    if (!r.ok) return res.status(r.status).end();
    if (/\.m3u8(\?|$)/i.test(target.pathname + target.search)) {
      const base = target.href.replace(/[^/]*$/, '');
      const body = r.body
        .split('\n')
        .map(line => {
          if (!line || line.startsWith('#')) return line;
          const abs = new URL(line.trim(), base).toString();
          return `/api/hls?u=${encodeURIComponent(abs)}${req.query.ref ? `&ref=${encodeURIComponent(req.query.ref)}` : ''}`;
        })
        .join('\n');
      res.set('content-type', 'application/vnd.apple.mpegurl').send(body);
      return;
    }
    res.set('content-type', r.headers.get('content-type') || 'application/octet-stream');
    res.send(r.body);
  } catch { res.status(502).end(); }
});

app.get('/api/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.use(express.static(path.join(__dirname, '..', 'web')));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, '..', 'web', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MEGA on :${PORT}`));