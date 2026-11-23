import express from 'express';
import compression from 'compression';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { UA_STRING, headersFor, fetchText } from './lib/http.mjs';
import {
  getSource,
  listSources,
  priorityIds,
  setPriority,
  defaultSourceId,
  DEFAULT_SOURCE,
} from './sources/registry.mjs';
import { isAnimePageUrl, isJunkMedia, isBloggerEmbed } from './lib/stream.mjs';
import { freshHtml, extractEpisodeSources, episodeCandidates } from './lib/episode.mjs';
import * as jikan from './sources/jikan.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(compression());
app.use(express.json());

app.use((_req, res, next) => {
  res.set('access-control-allow-origin', '*');
  res.set('access-control-allow-headers', '*');
  res.set('access-control-allow-methods', 'GET,POST,OPTIONS');
  next();
});

const ok = (res, data, max = 60) => res.set('cache-control', `public, max-age=${max}`).json(data);
const fail = (res, err, code = 502) => res.status(code).json({ error: String(err?.message || err) });
const pick = (req, explicitSource) => getSource(explicitSource || req.query.source || req.params.source);

/* fila priorizada: começa na fonte pedida, segue a prioridade do usuário, depois o resto */
const sourceQueue = (preferredId) => {
  const first = String(preferredId || '');
  const ids = priorityIds();
  const ordered = [...new Set([first, ...ids])].filter((id) => id);
  const queue = ordered.map((id) => getSource(id));
  return [...new Map(queue.map((s) => [s.meta.id, s])).values()];
};

const dedupeByUrl = (list = []) => {
  const seen = new Set();
  return list.filter((x) => x?.url && !seen.has(x.url) && seen.add(x.url));
};

const cardOf = (a, sourceId) => ({
  slug: a.slug,
  source: sourceId || a.source || DEFAULT_SOURCE,
  title: a.title,
  poster: a.poster || a.cover || a.banner || a.image || a.thumb || a.thumbnail || null,
  cover: a.poster || a.cover || a.banner || a.image || a.thumb || a.thumbnail || null,
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

/* ===== cache de memória curto (detalhe, pool de trending) ===== */
const memCache = new Map();
const cacheGet = (key, maxAge) => {
  const hit = memCache.get(key);
  if (!hit) return null;
  return { v: hit.v, t: hit.t, fresh: Date.now() - hit.t < maxAge };
};
const cacheSet = (key, v) => {
  memCache.set(key, { t: Date.now(), v });
  if (memCache.size > 400) {
    const oldest = [...memCache.entries()].sort((a, b) => a[1].t - b[1].t).slice(0, 100);
    oldest.forEach(([k]) => memCache.delete(k));
  }
};

const daySeed = () => Math.floor(Date.now() / 86_400_000);
const rotate = (arr = [], by = 0) => {
  if (!arr.length) return [];
  const n = ((by % arr.length) + arr.length) % arr.length;
  return arr.slice(n).concat(arr.slice(0, n));
};

/* FIX: pool de "Em Alta" — home + catálogo da fonte, com cache de 10 min. */
async function trendingPool(src) {
  const key = 'pool:' + src.meta.id;
  const hit = cacheGet(key, 10 * 60_000);
  if (hit?.fresh) return hit.v;

  const out = [];
  try {
    const raw = await budget(Promise.resolve(src.home()), 8000);
    (raw?.hero || []).forEach((i) => out.push(i));
    (raw?.sections || []).forEach((sec) => (sec.items || []).forEach((i) => out.push(i)));
  } catch {}
  try {
    const { items } = await budget(Promise.resolve(src.catalog(1)), 8000);
    (items || []).forEach((i) => out.push(i));
  } catch {}

  const list = dedupe(out.map((i) => cardOf(i, src.meta.id)));
  if (list.length) cacheSet(key, list);
  return list;
}

app.get('/api/sources', (_req, res) => {
  res.set('cache-control', 'no-store');
  res.json({ default: defaultSourceId(), sources: listSources() });
});

/* ===== prioridade de servidores ===== */
app.get('/api/priority', (_req, res) => {
  res.set('cache-control', 'no-store');
  res.json({ order: priorityIds(), sources: listSources() });
});

app.post('/api/priority', (req, res) => {
  const order = req.body?.order;
  if (!Array.isArray(order) || !order.length) {
    return res.status(400).json({ error: 'envie { "order": ["id1","id2",...] }' });
  }
  res.set('cache-control', 'no-store');
  res.json({ order: setPriority(order), sources: listSources() });
});

app.get(['/api/home', '/api/home/:source'], async (req, res) => {
  const first = pick(req);
  const order = sourceQueue(first.meta.id);
  const BATCH = 3;

  for (let i = 0; i < order.length; i += BATCH) {
    const batch = order.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      batch.map(async (src) => {
        try {
          const raw = await budget(Promise.resolve(src.home()), 8000);
          return { src, raw };
        } catch (e) {
          return { src, raw: null };
        }
      })
    );

    const success = settled.find(
      (s) => s.status === 'fulfilled' && s.value?.raw
    );
    if (!success) continue;

    const { src, raw } = success.value;
    const hero = (raw?.hero || []).map((i) => cardOf(i, src.meta.id));

    const rawSections = (raw?.sections || [])
      .map((sec) => ({
        id: sec.id || 'latest',
        title: sec.title || '',
        items: (sec.items || []).map((i) => cardOf(i, src.meta.id)),
      }))
      .filter((sec) => sec.items.length);

    const all = dedupe([...hero, ...rawSections.flatMap((sec) => sec.items)]);
    if (!all.length) continue;

    let latest = rawSections.find((sec) => sec.id === 'latest')?.items || [];
    if (!latest.length) latest = all.slice(0, 24);

    let top = rawSections.find((sec) => sec.id === 'top')?.items || [];
    if (top.length < 8) {
      const pool = dedupe([...all, ...(await budget(trendingPool(src), 12000).catch(() => []))]);
      top = rotate(pool, daySeed()).slice(0, 24);
    }

    const sections = [
      { id: 'latest', title: 'Novos Episódios', items: latest },
      { id: 'top', title: 'Em Alta', items: top },
    ];

    return ok(res, { source: src.meta.id, hero, sections }, 45);
  }

  ok(res, { source: first.meta.id, hero: [], sections: [] }, 15);
});

app.get(['/api/trending', '/api/trending/:source'], async (req, res) => {
  const first = pick(req);
  const key = 'trending:' + first.meta.id;
  const hit = cacheGet(key, 10 * 60_000);
  if (hit?.fresh) return ok(res, { source: first.meta.id, items: hit.v }, 600);

  const order = sourceQueue(first.meta.id);

  for (const src of order) {
    try {
      const pool = await budget(trendingPool(src), 15000);
      if (!pool || pool.length < 4) continue;
      const items = rotate(pool, daySeed()).slice(0, 30);
      cacheSet(key, items);
      return ok(res, { source: src.meta.id, items }, 600);
    } catch {}
  }

  if (hit) return ok(res, { source: first.meta.id, items: hit.v, stale: true }, 60);
  ok(res, { source: first.meta.id, items: [] }, 30);
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
  res.set('cache-control', 'no-store');
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ results: [] });

  const explicit = req.query.source || req.params.source;
  const targets = explicit ? [getSource(explicit)] : sourceQueue(defaultSourceId());

  const out = [];
  await Promise.all(targets.map(async (t) => {
    try {
      const items = await budget(Promise.resolve(t.search(q)), 12000);
      (items || []).forEach((i) => out.push(cardOf(i, t.meta.id)));
    } catch {}
  }));

  let partial = false;
  if (!out.length) {
    partial = true;
    const nq = normTitle(q);
    await Promise.all(targets.map(async (t) => {
      try {
        const { items } = await budget(Promise.resolve(t.catalog(1)), 9000);
        (items || []).forEach((i) => {
          const n = normTitle(i.title || i.slug);
          if (nq && (n.includes(nq) || nq.includes(n))) out.push(cardOf(i, t.meta.id));
        });
      } catch {}
    }));
  }

  ok(res, { query: q, results: dedupe(out), partial }, 30);
});

app.get('/api/episodes-all', async (req, res) => {
  const qTitle = String(req.query.title || req.query.q || '').trim();
  const preferredSource = String(req.query.source || defaultSourceId());
  const slugHint = String(req.query.slug || '').trim();

  if (!qTitle && !slugHint) {
    return res.json({ source: preferredSource, results: [] });
  }

  const targetNorm = normTitle(qTitle || slugHint.replace(/[-_]+/g, ' '));
  const ordered = sourceQueue(preferredSource);

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

/* FIX: detalhe com budget maior, cache e resolução de fonte NO SERVIDOR,
   seguindo a fila priorizada quando a fonte do link falha. */
const DETAIL_TTL = 5 * 60_000;

const detailOf = async (src, targetSlug) => {
  const a = await budget(Promise.resolve(src.anime(targetSlug)), 25000);
  const total = (a?.seasons || []).reduce((n, se) => n + (se.episodes?.length || 0), 0);
  if (!a || (!a.title && !total)) throw new Error('detalhe vazio');
  return {
    ...a,
    slug: a.slug || targetSlug,
    source: src.meta.id,
    poster: a.poster || a.cover || a.banner || null,
    cover: a.poster || a.cover || a.banner || null,
  };
};

app.get(['/api/anime/:slug', '/api/anime/:source/:slug'], async (req, res) => {
  res.set('cache-control', 'no-store');
  const src = pick(req);
  const targetSlug = String(req.params.slug || '');
  const key = `anime:${src.meta.id}:${targetSlug}`;
  const cached = cacheGet(key, DETAIL_TTL);

  if (cached?.fresh) return res.json({ ...cached.v, cached: true });

  try {
    const a = await detailOf(src, targetSlug);
    cacheSet(key, a);
    return res.json(a);
  } catch (firstErr) {
    const q = normTitle(targetSlug.replace(/[-_]+/g, ' '));
    const others = sourceQueue(src.meta.id).filter((s) => s.meta.id !== src.meta.id).slice(0, 2);

    for (const alt of others) {
      try {
        const found = await budget(Promise.resolve(alt.search(q)), 9000).catch(() => []);
        const match = (found || []).find((x) => {
          const n = normTitle(x.title || x.slug);
          return n === q || n.includes(q) || q.includes(n);
        });
        if (!match?.slug) continue;
        const a = await detailOf(alt, match.slug);
        cacheSet(`anime:${alt.meta.id}:${a.slug}`, a);
        return res.json({ ...a, resolvedFrom: src.meta.id });
      } catch {}
    }

    if (cached) return res.json({ ...cached.v, cached: true, stale: true });
    fail(res, firstErr);
  }
});

app.get(['/api/streams/:slug/:ep', '/api/streams/:source/:slug/:ep'], async (req, res) => {
  res.set('cache-control', 'no-store, max-age=0, must-revalidate');
  res.set('pragma', 'no-cache');

  const season = Number(req.query.season) || 1;
  const audio = req.query.audio === 'dub' ? 'dub' : 'leg';
  const epNum = Number(req.query.n || req.params.ep) || 1;
  const preferredSrc = pick(req);
  const debug = req.query.debug === '1';

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

    /* FIX: fontes com player em query string (?ep=&t=) montam a URL de outra forma */
    const watchCandidates = src.meta.watchKind === 'query'
      ? [`${src.meta.base}/anime/${targetSlug}?ep=${epNum}&t=${season}${audio === 'dub' ? '&audio=dub' : ''}`]
      : episodeCandidates(src.meta.base, targetSlug, season, epNum);

    const pageCandidates = [...new Set([out.pageUrl, ...watchCandidates].filter(Boolean))].slice(0, 2);

    const freshBlogger = [];
    const freshDirect = [];
    let freshPage = null;

    for (const pageUrl of pageCandidates) {
      const html = await freshHtml(pageUrl, `${src.meta.base}/`);
      if (!html) continue;
      const found = extractEpisodeSources(html, src.meta.base);
      if (found.direct.length) freshDirect.push(...found.direct);
      if (found.blogger.length) {
        freshBlogger.push(...found.blogger);
        freshPage = pageUrl;
        break;
      }
    }

    const sources = dedupeByUrl([
      ...(out.sources || [])
        .filter((x) => x.url && !isAnimePageUrl(x.url) && !isJunkMedia(x.url))
        .map((x, i) => ({
          url: x.url,
          label: x.label || x.quality || `Fonte ${i + 1}`,
          quality: x.quality || 'auto',
          mime: x.mime || (x.hls ? 'application/vnd.apple.mpegurl' : 'video/mp4'),
          hls: Boolean(x.hls),
          referer: x.referer || out.pageUrl || src.meta.base,
          itag: x.itag || 900 + i,
          expiresAt: x.expiresAt || null,
        })),
      ...freshDirect,
    ]);

    const validIframes = [...new Set([...(out.iframes || []), ...freshBlogger])]
      .filter((u) => u && !isAnimePageUrl(u) && !isJunkMedia(u));
    const orderedIframes = [...validIframes].sort((a, b) => Number(isBloggerEmbed(b)) - Number(isBloggerEmbed(a)));
    const iframe = orderedIframes[0] || null;

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
        iframes: orderedIframes,
        resolvedAt: Date.now(),
        expiresAt: sources.reduce((min, s) => (s.expiresAt && (!min || s.expiresAt < min) ? s.expiresAt : min), null),
        pageUrl: freshPage || out.pageUrl || null,
      },
    };
  };

  try {
    const first = await trySource(preferredSrc, req.params.slug, req.params.ep);
    let finalPayload = first.payload;

    /* FIX: fallback segue a fila priorizada do usuário */
    if (!finalPayload.sources.length && !finalPayload.iframe) {
      const q = normTitle(first.animeTitle || req.params.slug.replace(/[-_]+/g, ' '));
      const others = sourceQueue(preferredSrc.meta.id).filter((s) => s.meta.id !== preferredSrc.meta.id).slice(0, 2);
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

    const hasSource = Boolean(finalPayload.sources.length || finalPayload.iframe);
    const body = { ok: hasSource, ...finalPayload };
    if (debug) {
      body.diagnostics = {
        preferredSource: preferredSrc.meta.id,
        queue: sourceQueue(preferredSrc.meta.id).map((s) => s.meta.id),
        triedSlug: req.params.slug,
        triedEp: req.params.ep,
      };
    }

    res.status(hasSource ? 200 : 404).set('cache-control', 'no-store').json(body);
  } catch (e) {
    res.set('cache-control', 'no-store').status(502).json({ ok: false, error: String(e?.message || e) });
  }
});

/* ===== temporadas / calendário ===== */
const seasonCache = new Map();
const seasonKey = (y, s) => `${y}:${s}`;

const asItems = (d) => (Array.isArray(d) ? d : (d?.items || d?.data || []));

async function seasonPayload(year, season) {
  const key = seasonKey(year, season);
  const hit = seasonCache.get(key);
  if (hit && Date.now() - hit.t < 60 * 60_000) return hit.v;

  let items = [];

  try {
    const d = await budget(jikan.season(year, season), 12000);
    items = asItems(d);
  } catch {}

  if (!items.length) {
    try {
      const src = getSource(defaultSourceId());
      const { items: cat } = await budget(Promise.resolve(src.catalog(1)), 10000);
      items = (cat || [])
        .map((a) => cardOf(a, src.meta.id));
    } catch {}
  }

  if (!items.length) {
    try {
      const raw = await budget(Promise.resolve(getSource(defaultSourceId()).home()), 10000);
      const hero = (raw?.hero || []).map((i) => cardOf(i, defaultSourceId()));
      const sections = (raw?.sections || []).flatMap((sec) => sec.items || []);
      items = [...hero, ...sections].map((i) => cardOf(i, defaultSourceId()));
    } catch {}
  }

  const payload = { year, season, items };
  seasonCache.set(key, { t: Date.now(), v: payload });
  return payload;
}

app.get('/api/seasons', async (_req, res) => {
  try {
    const d = await budget(jikan.now(), 12000);
    ok(res, { items: asItems(d) }, 900);
  } catch {
    ok(res, { items: [] }, 60);
  }
});

app.get('/api/seasons/:year/:season', async (req, res) => {
  const year = Number(req.params.year);
  const season = String(req.params.season || '').toLowerCase();
  if (!year || !season) return res.json({ year, season, items: [] });
  try {
    ok(res, await seasonPayload(year, season), 900);
  } catch (e) {
    fail(res, e);
  }
});

app.get('/api/calendar', async (req, res) => {
  const now = new Date();
  const year = Number(req.query.year) || now.getFullYear();
  const season = String(req.query.season || '').toLowerCase() || 'winter';
  try {
    ok(res, await seasonPayload(year, season), 300);
  } catch (e) {
    fail(res, e);
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
app.listen(PORT, () => console.log(`MEGA on :${PORT} | prioridade: ${priorityIds().join(' > ')}`));