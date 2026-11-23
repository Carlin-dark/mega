import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as s from './scraper-utils.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8787;

app.use((req, res, next) => {
  res.set('access-control-allow-origin', '*');
  next();
});

const wrap = (fn) => async (req, res) => {
  try { res.json(await fn(req)); }
  catch (e) { res.status(502).json({ error: e.message }); }
};

app.get('/api/home', wrap(() => s.home()));
app.get('/api/catalog', wrap(r => s.catalog(Math.max(1, +r.query.page || 1))));
app.get('/api/letter/:l', wrap(r => s.byLetter(r.params.l)));
app.get('/api/genre/:g', wrap(r => s.byGenre(r.params.g)));
app.get('/api/search', wrap(r => s.search(String(r.query.q || ''))));
app.get('/api/anime/:slug', wrap(r => s.parseAnime(r.params.slug)));
app.get('/api/similar/:slug', wrap(r => s.similar(r.params.slug)));
app.get('/api/characters/:slug', wrap(async r => {
  const a = await s.parseAnime(r.params.slug);
  return s.characters(a.title);
}));
app.get('/api/streams/:slug/:ep', wrap(r =>
  s.getStreams(r.params.slug, +r.params.ep, +(r.query.season || 1), r.query.audio === 'dub' ? 'dub' : 'leg')));

app.get('/api/seasons', wrap(() => s.seasonNow()));
app.get('/api/seasons/:year/:season', wrap(r => s.season(+r.params.year, r.params.season)));

const IMG_OK = ['animesonline.blue', 'cdn.myanimelist.net', 's4.anilist.co'];
app.get('/img', async (req, res) => {
  try {
    const target = decodeURIComponent(String(req.query.u || ''));
    const host = new URL(target).host;
    if (!IMG_OK.some(h => host.endsWith(h))) return res.status(400).end();
    const up = await fetch(target, { headers: { 'user-agent': s.HEADERS_UA, referer: 'https://animesonline.blue/' } });
    res.set('content-type', up.headers.get('content-type') || 'image/jpeg');
    res.set('cache-control', 'public, max-age=86400');
    res.send(Buffer.from(await up.arrayBuffer()));
  } catch { res.status(502).end(); }
});

app.use(express.static(path.join(__dirname, '..', 'web')));
app.listen(PORT, () => console.log(`server em http://localhost:${PORT}`));