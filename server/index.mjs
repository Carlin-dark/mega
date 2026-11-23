import express from 'express';
import compression from 'compression';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { UA_STRING, headersFor, fetchText } from './lib/http.mjs';
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

const normTitle = (s = '') =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

app.get('/api/sources', (_req, res) => res.json({ default: DEFAULT_SOURCE, sources: listSources() }));

app.get(['/api/home', '/api/home/:source'], async (req, res) => {
  const first = pick(req);
  const order = [first, ...listSources().map((s) => getSource(s.id)).filter((s) => s.meta.id !== first.meta.id)];

  for (const src of order) {
    try {
      const raw = await budget(Promise.resolve(src.home()), 18000);
      const sections = (raw?.sections || []).map((sec) => ({
        ...sec,
        items: (sec.items || []).map((i) => cardOf(i, src.meta.id)),
      }));
      const hero = (raw?.hero || []).map((i) => cardOf(i, src.meta.id));
      if (hero.length || sections.some((s) => s.items?.length)) {
        return ok(res, { source: src.meta.id, hero, sections }, 45);
      }
    } catch {}
  }

  ok(res, { source: first.meta.id, hero: [], sections: [] }, 15);
});

app.get(['/api/catalog', '/api/catalog/:source'], async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const src = pick(req);
  try {
    const { items } = await budget(Promise.resolve(src.catalog(page)), 15000);
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
      const items = await budget(Promise.resolve(t.search(q)), 14000);
      (items || []).forEach((i) => out.push(cardOf(i, t.meta.id)));
    } catch {}
  }));

  ok(res, { query: q, results: dedupe(out) }, 30);
});

app.get('/api/episodes-all', async (req, res) => {
  const qTitle = String(req.query.title || req.query.q || '').trim();
  const preferredSource = String(req.query.source || DEFAULT_SOURCE);
  const slugHint = String(req.query.slug || '').trim();

  if (!qTitle && !slugHint) {
    return res.json({ source: preferredSource, results: [] });
  }

  const targetNorm = normTitle(qTitle || slugHint.replace(/[-_]+/g, ' '));
  const allSources = listSources().map((m) => getSource(m.id));
  const ordered = [
    ...allSources.filter((s) => s.meta.id === preferredSource),
    ...allSources.filter((s) => s.meta.id !== preferredSource),
  ];

  const bundles = [];

  await Promise.all(
    ordered.map(async (src) => {
      try {
        let candidateSlugs = [];
        if (src.meta.id === preferredSource && slugHint) candidateSlugs.push(slugHint);

        if (qTitle) {
          const found = await budget(Promise.resolve(src.search(qTitle)), 10000).catch(() => []);
          for (const item of found || []) {
            if (!item?.slug) continue;
            const itemNorm = normTitle(item.title || item.slug);
            if (!targetNorm || itemNorm === targetNorm || itemNorm.includes(targetNorm) || targetNorm.includes(itemNorm)) {
              candidateSlugs.push(item.slug);
            }
          }
        }

        if (!candidateSlugs.length && slugHint) candidateSlugs.push(slugHint);
        candidateSlugs = [...new Set(candidateSlugs)].slice(0, 2);

        for (const sSlug of candidateSlugs) {
          const detail = await budget(Promise.resolve(src.anime(sSlug)), 11000).catch(() => null);
          const epTotal = (detail?.seasons || []).reduce((acc, se) => acc + (se.episodes?.length || 0), 0);
          if (detail && epTotal > 0) {
            bundles.push({
              source: src.meta.id,
              sourceName: src.meta.name,
              slug: detail.slug || sSlug,
              title: detail.title || qTitle || sSlug,
              poster: detail.poster || detail.cover || null,
              seasons: detail.seasons || [],
              episodeCount: epTotal,
            });
            break;
          }
        }
      } catch {}
    })
  );

  bundles.sort((a, b) => ordered.findIndex((s) => s.meta.id === a.source) - ordered.findIndex((s) => s.meta.id === b.source));
  ok(res, { query: qTitle || slugHint, results: bundles }, 30);
});

app.get(['/api/anime/:slug', '/api/anime/:source/:slug'], async (req, res) => {
  const src = pick(req);
  try {
    const a = await budget(Promise.resolve(src.anime(req.params.slug)), 15000);
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
  const epNum = Number(req.query.n || req.params.ep) || 1;
  const preferredSrc = pick(req);

  const trySource = async (src, targetSlug, targetEpId) => {
    let resolvedEpId = String(targetEpId || epNum);
    let animeTitle = '';
    try {
      const a = await budget(Promise.resolve(src.anime(targetSlug)), 10000);
      animeTitle = a?.title || '';
      const se = (a.seasons || []).find((x) => x.number === season) || (a.seasons || [])[0];
      const matchEp = (se?.episodes || []).find((e) => String(e.id) === resolvedEpId || e.number === epNum);
      if (matchEp) resolvedEpId = String(matchEp.ids?.[audio] || matchEp.id || resolvedEpId);
    } catch {}

    const out = await budget(Promise.resolve(src.streams(targetSlug, resolvedEpId, audio, season)), 16000);
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

    return {
      animeTitle,
      payload: {
        source: src.meta.id,
        slug: targetSlug,
        episode: epNum,
        epId: resolvedEpId,
        audio,
        season,
        sources,
        streams: sources.map((s) => ({
          ...s,
          proxyUrl: `/api/proxy-stream?u=${encodeURIComponent(s.url)}&ref=${encodeURIComponent(s.referer || '')}`,
        })),
        iframe,
        iframes: validIframes,
      },
    };
  };

  try {
    const first = await trySource(preferredSrc, req.params.slug, req.params.ep);
    let finalPayload = first.payload;

    // Se a fonte escolhida nao retornou stream nem iframe, tenta nas outras fontes pelo titulo
    if (!finalPayload.sources.length && !finalPayload.iframe) {
      const q = normTitle(first.animeTitle || req.params.slug.replace(/[-_]+/g, ' '));
      const others = listSources().map((m) => getSource(m.id)).filter((s) => s.meta.id !== preferredSrc.meta.id);
      for (const alt of others) {
        try {
          const found = await budget(Promise.resolve(alt.search(q)), 8000).catch(() => []);
          const match = (found || []).find((x) => {
            const n = normTitle(x.title || x.slug);
            return n === q || n.includes(q) || q.includes(n);
          }) || (found || [])[0];
          if (!match?.slug) continue;
          const altRes = await trySource(alt, match.slug, epNum);
          if (altRes.payload.sources.length || altRes.payload.iframe) {
            finalPayload = altRes.payload;
            break;
          }
        } catch {}
      }
    }

    res.set('cache-control', 'no-store').json(finalPayload);
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
    const d = await budget(jikan.season(year, season), 8000);
    ok(res, d, 900);
  } catch {
    ok(res, { year, season, items: [] }, 60);
  }
});

app.get('/img', async (req, res) => {
  try {
    const u = new URL(String(req.query.u));
    if (!/^https?:$/.test(u.protocol)) return res.status(403).end();
    const ref = req.query.ref || (/akumast\.net/i.test(u.hostname) ? 'https://animefire.one/' : `${u.protocol}//${u.hostname}/`);
    const r = await fetch(u.toString(), { headers: headersFor(u.toString(), ref, { 'sec-fetch-dest': 'image' }) });
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

    const ref = req.query.ref || (/aniplay\.online/i.test(u.hostname) ? 'https://animesonline.cloud/' : 'https://www.blogger.com/');
    const extra = { 'sec-fetch-dest': 'video', 'sec-fetch-mode': 'no-cors', 'sec-fetch-site': 'cross-site' };
    if (req.headers.range) extra.range = req.headers.range;

    const r = await fetch(u.toString(), { headers: headersFor(u.toString(), ref, extra) });

    // Se o host (ex.: aniplay.online) bloquear o IP da Render com 403/503, retorna o link direto para o cliente tentar
    if (r.status === 403 || r.status === 503) {
      return res.status(409).json({ error: 'Host bloqueou IP do servidor', directUrl: u.toString() });
    }

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

app.get('/api/debug', async (req, res) => {
  const u = String(req.query.u || '');
  const ref = req.query.ref ? String(req.query.ref) : undefined;
  if (!u) return res.status(400).json({ error: 'informe ?u=' });
  try {
    const r = await fetchText(u, { referer: ref, timeout: 15000, retries: 0 });
    res.json({
      url: u,
      ref: ref || null,
      status: r.status,
      ok: r.ok,
      bytes: r.body.length,
      content_type: r.headers.get('content-type') || null,
      server: r.headers.get('server') || null,
      cf_mitigated: r.headers.get('cf-mitigated') || null,
      head: r.body.slice(0, 700),
    });
  } catch (e) {
    res.status(500).json({ url: u, ref: ref || null, status: 0, error: String(e?.message || e) });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.use(express.static(path.join(__dirname, '..', 'web'), { extensions: ['html'] }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, '..', 'web', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MEGA on :${PORT}`));