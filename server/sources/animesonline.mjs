import { fetchText } from '../lib/http.mjs';
import { absUrl, cleanText, decodeEntities, titleFromSlug, uniqueBy } from '../lib/text.mjs';
import { readRsc, readJsonKey } from '../lib/next.mjs';
import { resolveStreams, extractDirectVideosFromText, isAnimePageUrl, isBlockedEmbed } from '../lib/stream.mjs';

const BASES = ['https://animesonline.blue', 'https://animesonline.cloud'];
const BASE = BASES[0];
const CARD_RE = /<a\b[^>]*href="([^"]*\/anime\/[^"?#]+)"[^>]*>([\s\S]*?)<\/a>/gi;

function cover(inner, base) {
  const next = inner.match(/\/_next\/image\?url=([^"'&]+)/);
  if (next) {
    try { return decodeURIComponent(next[1]); } catch {}
  }
  const src = inner.match(/(?:src|data-src)="(https?:\/\/[^"]+?\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
  if (src?.[1]) return src[1];
  const rel = inner.match(/(?:src|data-src)="(\/[^"]+?\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
  return rel?.[1] ? absUrl(rel[1], base) : null;
}

function parseCard(inner, href, base) {
  const abs = absUrl(href, base);
  if (!abs) return null;
  const slug = abs.split('/anime/')[1].replace(/[?#].*$/, '').replace(/\/+$/, '');
  if (!slug) return null;
  const title =
    cleanText(inner.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/)?.[1]) ||
    cleanText(inner.match(/alt="([^"]*)"/)?.[1]) ||
    titleFromSlug(slug);
  const text = cleanText(inner);
  return {
    slug,
    title,
    poster: absUrl(cover(inner, base), base),
    year: Number(text.match(/\b(19|20)\d{2}\b/)?.[0]) || null,
    episodes: Number(text.match(/(\d+)\s*eps?/i)?.[1]) || null,
    score: Number(text.match(/\b(\d(?:\.\d)?)\b\s*(?:\/\s*10)?/)?.[1]) || null,
    type: /dublado/i.test(text) ? 'Dublado' : /legendado/i.test(text) ? 'Legendado' : null,
  };
}

export function parseCards(html, base = BASE) {
  const cards = [];
  for (const m of html.matchAll(CARD_RE)) {
    const c = parseCard(m[2], m[1], base);
    if (c) cards.push(c);
  }
  return uniqueBy(cards, (c) => c.slug);
}

async function fetchFromBases(paths, opts = {}) {
  for (const b of BASES) {
    for (const p of paths) {
      const url = p.startsWith('http') ? p : `${b}${p}`;
      const res = await fetchText(url, { referer: `${b}/`, ...opts });
      if (res.ok && res.body) return { base: b, res };
    }
  }
  return null;
}

export const meta = {
  id: 'animesonline',
  name: 'AnimesOnline',
  base: BASE,
  lang: 'pt-BR',
  audio: ['leg', 'dub'],
};

function numberFrom(text, fallback) {
  const m = String(text || '').match(/(\d{1,4})/);
  return m ? Number(m[1]) : fallback;
}

function episodesFromHtml(html, slug) {
  const out = [];
  const add = (id, number, title) => {
    if (!id) return;
    out.push({ id: String(id), number, title: title || `Episodio ${number}`, audio: ['leg', 'dub'] });
  };

  const linkRe = /(?:href|data-href)="([^"]*[?&](?:ep|episodio|episodioId|capitulo)=([^"&]+)[^"]*)"[^>]*>([\s\S]{0,180}?)</gi;
  for (const m of html.matchAll(linkRe)) {
    const label = cleanText(m[3]);
    add(m[2], numberFrom(label, out.length + 1), label || null);
  }

  // links curtos usados na home e no player: /anime/<slug>?ep=<numero>[&audio=leg|dub]
  const epQueryRe = /href="[^"]*[?&]ep=(\d{1,4})(?:&(?:amp;)?audio=(leg|dub))?[^"]*"/gi;
  for (const m of html.matchAll(epQueryRe)) add(m[1], Number(m[1]), null);

  const pathRe = new RegExp(`href="[^"]*\\/anime\\/${slug}\\/(?:episodio\\/)?(\\d+)"`, 'gi');
  for (const m of html.matchAll(pathRe)) add(m[1], Number(m[1]), null);

  const dataRe = /data-(?:ep|episode|episodio|id)="([^"]+)"[^>]*>([\s\S]{0,120}?)</gi;
  for (const m of html.matchAll(dataRe)) {
    const label = cleanText(m[2]);
    add(m[1], numberFrom(label, out.length + 1), label || null);
  }

  const titleRe = /title="Epis[oó]dio\s*(\d+)"[\s\S]{0,300}?(?:data-[a-z]+|href)="([^"]+)"/gi;
  for (const m of html.matchAll(titleRe)) add(m[2], Number(m[1]), `Episodio ${m[1]}`);

  return uniqueBy(out, (e) => `${e.number}|${e.id}`).sort((a, b) => a.number - b.number);
}

export async function home() {
  const hit = await fetchFromBases(['/', '/home'], { cacheTtl: 45_000 });
  if (!hit) throw new Error('home indisponivel');
  const html = hit.res.body;
  const all = parseCards(html, hit.base);
  const sections = [];
  if (all.length) sections.push({ id: 'latest', title: 'Ultimos Episodios', items: all.slice(0, 24) });
  if (all.length > 6) sections.push({ id: 'top', title: 'Em Alta', items: all.slice(6, 30) });
  return { hero: all.slice(0, 5).map((c) => ({ ...c, banner: c.poster })), sections };
}

export async function catalog(page = 1) {
  const hit = await fetchFromBases([page > 1 ? `/animes?page=${page}` : '/animes', '/'], { cacheTtl: 60_000 });
  if (!hit) throw new Error('catalog indisponivel');
  return { page, items: parseCards(hit.res.body, hit.base) };
}

export async function search(q) {
  const enc = encodeURIComponent(q);
  for (const b of BASES) {
    const api = await fetchText(`${b}/api/search?q=${enc}`, { referer: `${b}/` });
    if (api.ok && api.body.trim().startsWith('{')) {
      try {
        const data = JSON.parse(api.body);
        const list = data.results || data.animes || data.data || [];
        if (Array.isArray(list) && list.length) {
          return list.map((x) => ({
            slug: x.slug || x.href?.split('/anime/')[1]?.replace(/[?#].*$/, ''),
            title: x.titulo || x.title || x.nome,
            poster: absUrl(x.capa || x.cover || x.image, b),
          })).filter((x) => x.slug);
        }
      } catch {}
    }

    for (const p of [`/buscar?q=${enc}`, `/?s=${enc}`, `/search?q=${enc}`, `/animes?q=${enc}`]) {
      const res = await fetchText(`${b}${p}`, { referer: `${b}/`, cacheTtl: 30_000 });
      if (!res.ok) continue;
      const items = parseCards(res.body, b);
      if (items.length) return items;
    }
  }
  return [];
}

export async function anime(slug) {
  const hit = await fetchFromBases([`/anime/${slug}`, `/animes/${slug}`], { cacheTtl: 60_000 });
  if (!hit) throw new Error('anime indisponivel');
  const html = hit.res.body;
  const base = hit.base;
  const rsc = readRsc(html);

  const og = (k) => decodeEntities(html.match(new RegExp(`property="og:${k}"\\s+content="([^"]*)"`))?.[1] || '');
  const titulo =
    cleanText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]) ||
    og('title').replace(/\s*[-|]\s*Animes?Online.*$/i, '') ||
    titleFromSlug(slug);

  const sinopse =
    readJsonKey(rsc, 'sinopse') ||
    cleanText(html.match(/<meta\s+name="description"\s+content="([^"]*)"/)?.[1]) ||
    og('description') ||
    '';

  const generos = (readJsonKey(rsc, 'generos') || [])
    .map((g) => (typeof g === 'string' ? g : g?.nome || g?.name))
    .filter(Boolean);

  const info = readJsonKey(rsc, 'anime') || {};
  const serie = readJsonKey(rsc, 'serie') || {};
  const temporadasRaw = serie.temporadas || readJsonKey(rsc, 'temporadas') || [];
  const idOf = (v) => (typeof v === 'string' ? v : v?.id ?? v?.episodio ?? v?.slug ?? v?.ep ?? null);

  const numOf = (e, i) => {
    const raw = e.numero ?? e.num ?? e.ep ?? e.episodio ?? e.n ?? e.ordem ?? e.posicao;
    if (raw !== null && raw !== undefined && raw !== '') {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return n;
    }
    const t = String(e.titulo || e.title || e.nome || '');
    const m = t.match(/(\d{1,4})/);
    if (m) return Number(m[1]);
    return i + 1;
  };

  const seasons = temporadasRaw.map((t, i) => {
    const eps = (t.eps || t.episodios || []).map((e, idx) => {
      const number = numOf(e, idx);
      return {
        id: idOf(e) ?? String(number),
        number,
        title: e.titulo || e.title || e.nome || `Episodio ${number}`,
        thumb: absUrl(e.capa || e.thumb, base),
        duration: e.tempos || e.duracao || null,
        audio: [idOf(e.leg) ? 'leg' : null, idOf(e.dub) ? 'dub' : null].filter(Boolean),
        ids: { leg: idOf(e.leg) ?? String(number), dub: idOf(e.dub) ?? String(number) },
      };
    }).filter((e) => e.id || e.ids.leg || e.ids.dub);
    return {
      number: Number(t.numero ?? t.temporada ?? i + 1),
      title: t.titulo || t.title || `Temporada ${t.numero ?? i + 1}`,
      episodes: eps,
    };
  }).filter((s) => s.episodes.length);

  // fallback 1: lista de ids de episodios do payload (anime.episodeIds)
  if (!seasons.length) {
    const ids = Array.isArray(info.episodeIds) ? info.episodeIds : [];
    const audios = Array.isArray(info.audios) && info.audios.length ? info.audios : ['leg'];
    if (ids.length) {
      seasons.push({
        number: 1,
        title: 'Temporada 1',
        episodes: ids.map((id, i) => ({
          id: String(id),
          number: i + 1,
          title: `Episodio ${i + 1}`,
          thumb: null,
          duration: null,
          audio: audios.slice(),
          ids: Object.fromEntries(audios.map((k) => [k, String(id)])),
        })),
      });
    }
  }

  // fallback 2: botoes/links do DOM
  if (!seasons.length) {
    const eps = episodesFromHtml(html, slug);
    if (eps.length) seasons.push({ number: 1, title: 'Temporada 1', episodes: eps });
  }

  return {
    source: meta.id,
    slug,
    title: titulo,
    poster: absUrl(og('image'), base) || null,
    banner: absUrl(og('image'), base) || null,
    synopsis: sinopse,
    year: Number((html.match(/"ano":\s*"?(\d{4})/) || [])[1]) || null,
    type: (rsc.match(/"tipo":"([^"]+)"/) || [])[1] || null,
    status: (rsc.match(/"status":"([^"]+)"/) || [])[1] || null,
    score: Number((rsc.match(/"nota":\s*"?([\d.]+)/) || [])[1]) || null,
    genres: generos,
    seasons,
  };
}

export async function streams(slug, epId, audio = 'leg', season = 1) {
  const rawId = String(epId || '').trim();
  const audioKey = audio === 'dub' ? 'dub' : 'leg';
  const foundIframes = [];
  const directSources = [];

  let epNumber = /^\d{1,4}$/.test(rawId) ? Number(rawId) : null;
  let resolvedId = rawId;
  let pageUrl = `${BASE}/anime/${slug}?ep=${encodeURIComponent(rawId)}`;

  // 1) resolve o numero do episodio e o id real do audio pedido (leg/dub)
  try {
    const detail = await anime(slug);
    const all = detail.seasons || [];
    const se = all.find((s) => Number(s.number) === Number(season)) || all[0];
    const match = (se?.episodes || []).find(
      (e) =>
        String(e.id) === rawId ||
        String(e.ids?.[audioKey]) === rawId ||
        Number(e.number) === Number(rawId)
    );
    if (match) {
      if (match.number) epNumber = Number(match.number);
      const byAudio = match.ids?.[audioKey];
      if (byAudio) resolvedId = String(byAudio);
    }
  } catch {}

  const watchUrl = (b) =>
    `${b}/anime/${slug}?ep=${encodeURIComponent(String(epNumber ?? resolvedId))}${audioKey === 'dub' ? '&audio=dub' : ''}`;

  const pushIframe = (u, base) => {
    const abs = absUrl(u, base);
    if (!abs || isBlockedEmbed(abs) || isAnimePageUrl(abs)) return;
    if (!foundIframes.includes(abs)) foundIframes.push(abs);
  };

  const collectFromHtml = (html, baseUrl) => {
    const unescaped = decodeEntities(String(html || ''))
      .replace(/\\u0026/g, '&')
      .replace(/\\\//g, '/');

    for (const m of unescaped.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)) pushIframe(m[1], baseUrl);

    for (const m of unescaped.matchAll(/(?:https?:)?\/\/www\.blogger\.com\/video\.g\?token=[A-Za-z0-9_=-]+/gi)) {
      pushIframe(m[0].startsWith('http') ? m[0] : `https:${m[0]}`, baseUrl);
    }

    for (const m of unescaped.matchAll(/https?:\/\/[^"'\s<>\\]+(?:embed|player|video\.g|stream)[^"'\s<>\\]*/gi)) {
      pushIframe(m[0], baseUrl);
    }

    directSources.push(...extractDirectVideosFromText(unescaped, baseUrl));
  };

  // 2) API interna do episodio: e a UNICA fonte do iframe do player.
  //    GET /api/episodio/<episodeId> -> { playerUrl: "https://www.blogger.com/video.g?token=..." }
  for (const b of BASES) {
    const apiUrl = `${b}/api/episodio/${encodeURIComponent(resolvedId)}`;
    const res = await fetchText(apiUrl, { referer: watchUrl(b), cacheTtl: 0, timeout: 15000 });
    if (!res.ok || !res.body) continue;

    let data = null;
    try { data = JSON.parse(res.body); } catch { data = null; }
    if (!data || typeof data !== 'object') continue;

    pageUrl = watchUrl(b);
    for (const field of ['playerUrl', 'player', 'iframe', 'embed']) {
      if (typeof data[field] === 'string' && data[field]) pushIframe(data[field], b);
    }
    for (const m of String(res.body).matchAll(/https?:\/\/[^"'\s<>\\]+/g)) {
      if (/blogger\.com\/video\.g|videoplayback|\.mp4(\?|$)|\.m3u8(\?|$)/.test(m[0])) pushIframe(m[0], b);
    }

    if (foundIframes.length) break;
  }

  // 3) fallback: varre o HTML do episodio e o payload RSC
  if (!foundIframes.length && !directSources.length) {
    for (const b of BASES) {
      const res = await fetchText(watchUrl(b), { referer: `${b}/anime/${slug}`, cacheTtl: 0, timeout: 15000 });
      if (!res.ok || !res.body) continue;
      pageUrl = watchUrl(b);

      collectFromHtml(res.body, b);
      const rsc = readRsc(res.body);
      if (rsc) collectFromHtml(rsc, b);

      if (foundIframes.length || directSources.length) break;
    }
  }

  const iframes = uniqueBy(foundIframes, (x) => x);
  const resolved = await resolveStreams(iframes, pageUrl);
  const sources = uniqueBy([...directSources, ...resolved], (s) => s.url);

  return {
    source: meta.id,
    slug,
    episode: rawId,
    episodeNumber: epNumber ?? null,
    epId: resolvedId,
    audio: audioKey,
    season,
    pageUrl,
    iframes,
    resolvedAt: Date.now(),
    sources,
  };
}

export default { meta, home, catalog, search, anime, streams };