import express from 'express';
import compression from 'compression';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { UA_STRING, fetchText } from './lib/http.mjs';
import { getSource, listSources, DEFAULT_SOURCE } from './sources/registry.mjs';
import { isAnimePageUrl } from './lib/stream.mjs';
import * as jikan from './sources/jikan.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(compression());
app.use(express.json());

app.use((_req, res, next) => {
  res.set('access-control-allow-origin', '*');
  res.set('access-control-allow-headers', '*');
  next();
});

const ok = (res, data, max = 60) => res.set('cache-control', `public, max-age=${max}`).json(data);
const fail = (res, err, code = 502) => res.status(code).json({ error: String(err?.message || err) });
const pick = (req, explicitSource) => getSource(explicitSource || req.query.source || req.params.source);

const cardOf = (a, sourceId) => ({
  slug: a.slug,
  source: sourceId || a.source || DEFAULT_SOURCE,
  title: a.title,
  poster: a.poster || a.cover || a.banner || null,
  cover: a.poster || a.cover || a.banner || null,
  type: a.type || null,
  year: a.year || null,
  score: a.score || null,
  episodes: a.episodes || null,
  synopsis: a.synopsis || null,
  day: a.day || null,
});

const dedupe = (list) => {
  const seen = new Set();
  return list.filter((c) => c.slug && !seen.has(`${c.source || ''}:${c.slug}`) && seen.add(`${c.source || ''}:${c.slug}`));
};

const budget = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

app.get('/api/sources', (_req, res) => res.json({ default: DEFAULT_SOURCE, sources: listSources() }));

app.get(['/api/home', '/api/home/:source'], async (req, res) => {
  const src = pick(req);
  try {
    const raw = await budget(Promise.resolve(src.home()), 12000);
    const sections = (raw.sections || []).map((sec) => ({
      ...sec,
      items: (sec.items || []).map((i) => cardOf(i, src.meta.id)),
    }));
    const hero = (raw.hero || []).map((i) => cardOf(i, src.meta.id));
    ok(res, { source: src.meta.id, hero, sections }, 45);
  } catch (e) {
    fail(res, e);
  }
});

app.get(['/api/catalog', '/api/catalog/:source'], async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const src = pick(req);
  try {
    const { items } = await budget(Promise.resolve(src.catalog(page)), 12000);
    ok(res, { source: src.meta.id, page, items: (items || []).map((i) => cardOf(i, src.meta.id)) }, 60);
  } catch (e) {
    fail(res, e);
  }
});

app.get(['/api/search', '/api/search/:source'], async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ results: [] });

  const explicit = req.query.source || req.params.source;
  const targets = explicit
    ? [getSource(explicit)]
    : [getSource(DEFAULT_SOURCE), ...listSources().map((x) => getSource(x.id))];

  const out = [];
  await Promise.all([...new Set(targets)].map(async (t) => {
    try {
      const items = await budget(Promise.resolve(t.search(q)), 12000);
      (items || []).forEach((i) => out.push(cardOf(i, t.meta.id)));
    } catch {}
  }));

  ok(res, { query: q, results: dedupe(out) }, 30);
});

app.get(['/api/anime/:slug', '/api/anime/:source/:slug'], async (req, res) => {
  const src = pick(req);
  try {
    const a = await budget(Promise.resolve(src.anime(req.params.slug)), 14000);
    ok(res, {
      ...a,
      source: src.meta.id,
      poster: a.poster || a.cover || a.banner || null,
      cover: a.poster || a.cover || a.banner || null,
    });
  } catch (e) {
    fail(res, e);
  }
});

app.get(['/api/streams/:slug/:ep', '/api/streams/:source/:slug/:ep'], async (req, res) => {
  const season = Number(req.query.season) || 1;
  const audio = req.query.audio === 'dub' ? 'dub' : 'leg';
  const src = pick(req);

  try {
    let epId = String(req.params.ep || '');
    const epNum = Number(req.query.n || req.params.ep) || 1;

    try {
      const a = await budget(Promise.resolve(src.anime(req.params.slug)), 10000);
      const se = (a.seasons || []).find((x) => x.number === season) || (a.seasons || [])[0];
      const matchEp = (se?.episodes || []).find((e) => String(e.id) === epId || e.number === epNum);
      if (matchEp) {
        epId = String(matchEp.ids?.[audio] || matchEp.id || epId);
      }
    } catch {}

    const out = await budget(
      Promise.resolve(src.streams(req.params.slug, epId, audio, season)),
      16000
    );

    const sources = (out.sources || [])
      .filter((x) => x.url && !isAnimePageUrl(x.url))
      .map((x, i) => ({
        url: x.url,
        label: x.label || x.quality || `Fonte ${i + 1}`,
        quality: x.quality || 'auto',
        mime: x.mime || (x.hls ? 'application/vnd.apple.mpegurl' : 'video/mp4'),
        hls: Boolean(x.hls),
        referer: x.referer || out.pageUrl || src.meta.base,
        itag: x.itag || 900 + i,
      }));

    const validIframes = (out.iframes || []).filter((u) => u && !isAnimePageUrl(u));
    const blogger = validIframes.find((u) => /blogger\.com\/video\.g/.test(u));
    const iframe = blogger || validIframes[0] || null;

    res.set('cache-control', 'no-store').json({
      source: src.meta.id,
      slug: req.params.slug,
      episode: epNum,
      epId,
      audio,
      season,
      sources,
      streams: sources.map((s) => ({
        ...s,
        proxyUrl: `/api/proxy-stream?u=${encodeURIComponent(s.url)}&ref=${encodeURIComponent(s.referer || '')}`,
      })),
      iframe,
      iframes: validIframes,
    });
  } catch (e) {
    fail(res, e);
  }
});

app.get('/api/seasons', async (_req, res) => {
  try {
    const d = await budget(jikan.now(), 8000);
    ok(res, d, 900);
  } catch {
    ok(res, { items: [] }, 60);
  }
});

app.get('/api/seasons/:year/:season', async (req, res) => {
  const year = Number(req.params.year);
  const season = req.params.season;
  try {
    const d = await budget(jikan.season(year, season), 800);
    ok(res, d, 900);
  } catch {
    ok(res, { year, season, items: [] }, 60);
  }
});

app.get('/img', async (req, res) => {
  try {
    const u = new URL(String(req.query.u));
    if (!/^https?:$/.test(u.protocol)) return res.status(403).end();
    const r = await fetch(u.toString(), {
      headers: { 'user-agent': UA_STRING, referer: req.query.ref || `${u.protocol}//${u.hostname}/` },
    });
    if (!r.ok) return res.status(r.status).end();
    res.set('cache-control', 'public, max-age=86400');
    res.set('content-type', r.headers.get('content-type') || 'image/jpeg');
    Readable.fromWeb(r.body).pipe(res);
  } catch {
    res.status(502).end();
  }
});

app.get('/api/proxy-stream', async (req, res) => {
  try {
    const target = String(req.query.u || '');
    if (!target || isAnimePageUrl(target)) return res.status(400).json({ error: 'URL invalida' });
    const u = new URL(target);
    if (!/^https?:$/.test(u.protocol)) return res.status(403).end();

    const headers = {
      'user-agent': UA_STRING,
      referer: req.query.ref || 'https://www.blogger.com/',
      origin: req.query.ref ? new URL(req.query.ref).origin : 'https://www.blogger.com',
    };
    if (req.headers.range) headers.range = req.headers.range;

    const r = await fetch(u.toString(), { headers });
    res.status(r.status);
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      if (r.headers.get(h)) res.setHeader(h, r.headers.get(h));
    }
    res.setHeader('cache-control', 'no-store');
    if (!r.body) return res.end();
    Readable.fromWeb(r.body).pipe(res);
  } catch {
    res.status(502).end();
  }
});

app.get('/api/hls', async (req, res) => {
  try {
    const target = new URL(String(req.query.u));
    const r = await fetchText(target.toString(), { referer: req.query.ref || undefined });
    if (!r.ok) return res.status(r.status).end();
    if (/\.m3u8(\?|$)/i.test(target.pathname + target.search)) {
      const base = target.href.replace(/[^/]*$/, '');
      const body = r.body.split('\n').map((line) => {
        if (!line || line.startsWith('#')) return line;
        const abs = new URL(line.trim(), base).toString();
        return `/api/hls?u=${encodeURIComponent(abs)}${req.query.ref ? `&ref=${encodeURIComponent(req.query.ref)}` : ''}`;
      }).join('\n');
      return res.set('content-type', 'application/vnd.apple.mpegurl').send(body);
    }
    res.set('content-type', r.headers.get('content-type') || 'application/octet-stream');
    res.send(r.body);
  } catch {
    res.status(502).end();
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.use(express.static(path.join(__dirname, '..', 'web'), { extensions: ['html'] }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, '..', 'web', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MEGA on :${PORT}`));