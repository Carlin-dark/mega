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

const ok = (res, data, max = 60) => res.set('cache-control', `public, max-age=${max}`).json(data);
const fail = (res, err, code = 502) => res.status(code).json({ error: String(err?.message || err) });
const pick = (req) => getSource(req.query.source);

const cardOf = (a) => ({
  slug: a.slug,
  title: a.title,
  cover: a.poster || a.cover || a.banner || null,
  type: a.type || null,
  year: a.year || null,
  episodes: a.episodes || null,
  synopsis: a.synopsis || null,
});

const RANK = { '1080p': 5, '720p': 4, '480p': 3, '360p': 2, auto: 1 };

app.get('/api/sources', (_req, res) => res.json({ default: DEFAULT_SOURCE, sources: listSources() }));

app.get('/api/home', async (req, res) => {
  try {
    const { hero = [], sections = [] } = await pick(req).home();
    const flat = [
      ...hero,
      ...sections.filter((x) => x.id === 'latest').flatMap((x) => x.items),
      ...sections.filter((x) => x.id === 'top').flatMap((x) => x.items),
      ...sections.filter((x) => x.id === 'added').flatMap((x) => x.items),
      ...sections.flatMap((x) => x.items),
    ];
    const seen = new Set();
    ok(res, flat.filter((c) => c.slug && !seen.has(c.slug) && seen.add(c.slug)).map(cardOf), 45);
  } catch (e) { fail(res, e); }
});

app.get('/api/catalog', async (req, res) => {
  try {
    const { items } = await pick(req).catalog(Number(req.query.page) || 1);
    ok(res, items.map(cardOf), 60);
  } catch (e) { fail(res, e); }
});

app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json([]);
  const first = pick(req);
  const targets = req.query.source ? [first] : [...new Set([first, ...listSources().map((x) => getSource(x.id))])];
  const out = [];
  await Promise.all(targets.map(async (t) => {
    try { (await t.search(q)).forEach((i) => out.push(cardOf(i))); } catch {}
  }));
  const seen = new Set();
  ok(res, out.filter((c) => c.slug && !seen.has(c.slug) && seen.add(c.slug)), 30);
});

app.get('/api/anime/:slug', async (req, res) => {
  try {
    const a = await pick(req).anime(req.params.slug);
    const seasons = (a.seasons || []).map((se) => ({
      season: se.number,
      title: se.title,
      episodes: (se.episodes || []).flatMap((e) =>
        (e.audio?.length ? e.audio : ['leg']).map((audio) => ({
          number: e.number,
          audio,
          duration: e.duration || null,
          id: e.ids?.[audio] || e.id,
        }))
      ),
    }));
    const all = seasons.flatMap((x) => x.episodes);
    ok(res, {
      slug: a.slug,
      title: a.title,
      cover: a.poster || a.banner || null,
      synopsis: a.synopsis || '',
      year: a.year || null,
      type: a.type || null,
      status: a.status || null,
      genres: a.genres || [],
      audios: [...new Set(all.map((e) => e.audio))],
      episodeCount: all.length,
      seasons,
    });
  } catch (e) { fail(res, e); }
});

app.get('/api/streams/:slug/:ep', async (req, res) => {
  const season = Number(req.query.season) || 1;
  const audio = req.query.audio === 'dub' ? 'dub' : 'leg';
  try {
    const src = pick(req);
    const a = await src.anime(req.params.slug);
    const se = (a.seasons || []).find((x) => x.number === season) || (a.seasons || [])[0];
    const epNum = Number(req.params.ep);
    const ep = (se?.episodes || []).find((e) => e.number === epNum) || (se?.episodes || [])[0];
    if (!ep) return fail(res, new Error('episodio nao encontrado'), 404);

    const id = ep.ids?.[audio] || ep.id;
    const out = await src.streams(req.params.slug, id, audio);

    const streams = (out.sources || [])
      .filter((x) => x.url)
      .map((x, i) => ({
        url: `/api/proxy-stream?u=${encodeURIComponent(x.url)}&ref=${encodeURIComponent(x.referer || '')}`,
        raw: x.url,
        quality: x.quality || 'auto',
        itag: x.itag || 900 + i,
      }))
      .sort((p, q) => (RANK[p.quality] || 0) - (RANK[q.quality] || 0));

    res.set('cache-control', 'no-store').json({
      slug: req.params.slug,
      episode: epNum,
      season,
      audio,
      streams,
      iframe: out.iframes?.[0] || out.pageUrl || null,
    });
  } catch (e) { fail(res, e); }
});

app.get('/api/similar/:slug', async (req, res) => {
  try {
    const src = pick(req);
    const a = await src.anime(req.params.slug);
    const words = a.title.split(/[\s:–-]+/).filter((w) => w.length > 3);
    const tries = [a.title, ...words, a.genres?.[0]].filter(Boolean);
    const out = [];
    for (const q of tries) {
      if (out.length >= 12) break;
      try { out.push(...(await src.search(q))); } catch {}
    }
    const seen = new Set([a.slug]);
    ok(res, out.filter((c) => c.slug && !seen.has(c.slug) && seen.add(c.slug)).slice(0, 12).map(cardOf), 300);
  } catch { ok(res, [], 60); }
});

app.get('/api/characters/:slug', async (req, res) => {
  try {
    const a = await pick(req).anime(req.params.slug);
    const query = 'query($s:String){Media(search:$s,type:ANIME){characters(sort:[ROLE,RELEVANCE],perPage:12){nodes{name{full}image{large}}}}}';
    const r = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': UA_STRING },
      body: JSON.stringify({ query, variables: { s: a.title } }),
    });
    const j = await r.json();
    const nodes = j?.data?.Media?.characters?.nodes || [];
    ok(res, nodes.map((n) => ({ name: n.name?.full || '-', image: n.image?.large || null })).filter((n) => n.image), 3600);
  } catch { ok(res, [], 60); }
});

app.get('/api/seasons', (_req, res) =>
  res.json({ year: new Date().getFullYear(), seasons: jikan.seasons.map((s) => ({ id: s, name: s })) }));

app.get('/api/seasons/:year/:season', async (req, res) => {
  try {
    const d = await jikan.season(Number(req.params.year), req.params.season);
    ok(res, d.items.map((i) => ({ title: i.title, cover: i.poster, type: i.type, score: i.score, year: i.year })), 900);
  } catch (e) { fail(res, e); }
});

app.get('/api/calendar', async (_req, res) => {
  try {
    const d = await jikan.now();
    ok(res, d.items.map((i) => ({ title: i.title, cover: i.poster, type: i.type, score: i.score })), 900);
  } catch (e) { fail(res, e); }
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
  } catch { res.status(502).end(); }
});

app.get('/api/proxy-stream', async (req, res) => {
  try {
    const u = new URL(String(req.query.u));
    if (!/^https?:$/.test(u.protocol)) return res.status(403).end();
    const headers = {
      'user-agent': UA_STRING,
      referer: req.query.ref || 'https://www.blogger.com/',
      origin: 'https://www.blogger.com',
    };
    if (req.headers.range) headers.range = req.headers.range;
    const r = await fetch(u.toString(), { headers });
    res.status(r.status);
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges'])
      if (r.headers.get(h)) res.setHeader(h, r.headers.get(h));
    res.setHeader('cache-control', 'no-store');
    if (!r.body) return res.end();
    Readable.fromWeb(r.body).pipe(res);
  } catch { res.status(502).end(); }
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
  } catch { res.status(502).end(); }
});

app.get('/api/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.use(express.static(path.join(__dirname, '..', 'web'), { extensions: ['html'] }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, '..', 'web', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MEGA on :${PORT}`));