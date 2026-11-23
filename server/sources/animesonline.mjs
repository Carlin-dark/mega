import { fetchText } from '../lib/http.mjs';
import { absUrl, cleanText, decodeEntities, titleFromSlug, uniqueBy } from '../lib/text.mjs';
import { extractBalanced } from '../lib/next.mjs';
import {
  resolveStreams,
  extractDirectVideosFromText,
  isAnimePageUrl,
  isBlockedEmbed,
  isJunkMedia,
  bloggerTokens,
} from '../lib/stream.mjs';

const BASES = ['https://animesonline.blue'];
const BASE = BASES[0];

export const meta = {
  id: 'animesonline',
  name: 'AnimesOnline',
  base: BASE,
  lang: 'pt-BR',
  audio: ['leg', 'dub'],
  watchKind: 'query',
};

/* ---------- helpers ---------- */
const unescapeRsc = (s = '') =>
  String(s).replace(/\\"/g, '"').replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/\\\\/g, '\\');

function jsonKey(html, key) {
  const text = unescapeRsc(html);
  const m = new RegExp(`"${key}"\\s*:\\s*`).exec(text);
  if (!m) return null;
  const start = text.indexOf('{', m.index + m[0].length);
  if (start < 0) return null;
  const raw = extractBalanced(text, start);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function decodeNextImage(src = '') {
  if (!src) return null;
  try {
    const abs = absUrl(src, BASE);
    if (!abs) return null;
    const u = new URL(abs);
    const inner = u.searchParams.get('url');
    return inner ? decodeURIComponent(inner) : u.toString();
  } catch { return null; }
}

const rootOf = (slug) => String(slug || '').replace(/\/+$/, '');

function watchUrl(slug, season, ep, audio) {
  const s = Number(season) || 1;
  const n = Number(ep) || 1;
  const q = new URLSearchParams({ ep: String(n), t: String(s) });
  if (audio === 'dub') q.set('audio', 'dub');
  return `${BASE}/anime/${rootOf(slug)}?${q.toString()}`;
}

function fixRef(list) {
  return list.map((s) => ({
    ...s,
    referer: /googlevideo\.com/i.test(s.url) ? 'https://www.blogger.com/' : (s.referer || `${BASE}/`),
  }));
}

/* ---------- cards ---------- */
const CARD_RE = /<a\b[^>]+href="(?:\/anime\/)([^"?#]+)"[^>]*>([\s\S]{0,800}?)<\/a>/gi;

function coverFrom(inner) {
  const next = inner.match(/\/_next\/image\?url=([^"'&\s]+)/);
  if (next) {
    try { return decodeURIComponent(next[1]); } catch {}
  }
  const abs = inner.match(/(?:src|data-src|data-lazy-src)="(https?:\/\/[^"]+?\.(?:jpg|jpeg|png|webp|avif)[^"]*)"/i);
  if (abs?.[1]) return abs[1];
  const rel = inner.match(/(?:src|data-src|data-lazy-src)="(\/[^"]+?\.(?:jpg|jpeg|png|webp|avif)[^"]*)"/i);
  return rel?.[1] ? absUrl(rel[1], BASE) : null;
}

function parseCard(inner, slugRaw) {
  const slug = String(slugRaw || '').replace(/[?#].*$/, '').replace(/\/+$/, '');
  if (!slug) return null;
  const title =
    cleanText(inner.match(/alt="([^"]*)"/)?.[1]) ||
    cleanText(inner.match(/title="([^"]*)"/)?.[1]) ||
    cleanText(inner.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/)?.[1]) ||
    titleFromSlug(slug);
  const text = cleanText(inner);
  return {
    slug,
    title,
    poster: decodeNextImage(coverFrom(inner) || ''),
    year: Number(text.match(/\b(19|20)\d{2}\b/)?.[0]) || null,
    episodes: Number(text.match(/(\d+)\s*eps?/i)?.[1]) || null,
    score: Number(text.match(/\b(\d(?:\.\d)?)\b\s*(?:\/\s*10)?/)?.[1]) || null,
    type: /dublado/i.test(text) ? 'Dublado' : /legendado/i.test(text) ? 'Legendado' : null,
  };
}

export function parseCards(html) {
  const doc = String(html || '');
  const cards = [];
  for (const m of doc.matchAll(CARD_RE)) {
    const c = parseCard(m[2], m[1]);
    if (c) cards.push(c);
  }
  return uniqueBy(cards, (c) => c.slug);
}

async function first(paths, opts = {}) {
  for (const b of BASES) {
    for (const p of paths) {
      const res = await fetchText(`${b}${p}`, { referer: `${b}/`, ...opts });
      if (res.ok && res.body) return { base: b, res };
    }
  }
  return null;
}

/* ---------- listas ---------- */
export async function home() {
  const hit = await first(['/'], { cacheTtl: 45_000 });
  if (!hit) throw new Error('home indisponivel');
  const all = parseCards(hit.res.body);
  const sections = [];
  if (all.length) sections.push({ id: 'latest', title: 'Ultimos Episodios', items: all.slice(0, 24) });
  if (all.length > 6) sections.push({ id: 'top', title: 'Em Alta', items: all.slice(6, 30) });
  return { hero: all.slice(0, 5).map((c) => ({ ...c, banner: c.poster })), sections };
}

export async function catalog(page = 1) {
  const p = page > 1 ? `/animes?page=${page}` : '/animes';
  const hit = await first([p, '/'], { cacheTtl: 60_000 });
  if (!hit) throw new Error('catalog indisponivel');
  return { page, items: parseCards(hit.res.body) };
}

/* ---------- busca ---------- */
function mapApiResults(list) {
  const out = [];
  for (const r of list || []) {
    const slug = String(r?.slug || '').replace(/\/+$/, '');
    if (!slug) continue;
    out.push({
      slug,
      title: decodeEntities(r.title || titleFromSlug(slug)),
      poster: r.cover ? decodeNextImage(r.cover) : null,
      year: r.year || null,
      type: r.tipo || null,
    });
  }
  return uniqueBy(out, (i) => i.slug);
}

export async function search(q) {
  const raw = String(q || '').trim();
  if (!raw) return [];
  const enc = encodeURIComponent(raw);

  for (const b of BASES) {
    for (const p of [`/api/search?q=${enc}`, `/api/search?query=${enc}`]) {
      const res = await fetchText(`${b}${p}`, { referer: `${b}/`, cacheTtl: 25_000, timeout: 12_000 });
      if (!res.ok || !res.body.trim().startsWith('{')) continue;
      try {
        const data = JSON.parse(res.body);
        const items = mapApiResults(data.results || data.data || []);
        if (items.length) return items;
      } catch {}
    }
  }

  /* fallback: varre a listagem procurando no título */
  const hit = await first([`/animes?q=${enc}`, `/animes`], { cacheTtl: 30_000 });
  if (!hit) return [];
  const norm = (s = '') => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const target = norm(raw);
  const all = parseCards(hit.res.body);
  const matches = all.filter((c) => norm(c.title).includes(target));
  return matches.length ? matches : [];
}

/* ---------- anime ---------- */
async function seasonsFromDom(slug, html) {
  const nums = new Set([1]);
  for (const m of String(html).matchAll(/title="Temporada\s+(\d{1,3})/gi)) nums.add(Number(m[1]));
  const seasons = [];
  for (const n of [...nums].filter((x) => x > 0).sort((a, b) => a - b).slice(0, 8)) {
    let page = html;
    if (n > 1) {
      const res = await fetchText(`${BASE}/anime/${rootOf(slug)}?ep=1&t=${n}`, {
        referer: `${BASE}/anime/${rootOf(slug)}`,
        cacheTtl: 60_000,
        timeout: 15_000,
      });
      if (!res.ok || !res.body) continue;
      page = res.body;
    }
    const eps = new Set();
    for (const m of page.matchAll(/title="Epis[oó]dio\s+(\d{1,4})"/gi)) eps.add(Number(m[1]));
    for (const m of page.matchAll(/[?&]ep=(\d{1,4})/gi)) eps.add(Number(m[1]));
    const list = [...eps].filter((x) => x > 0).sort((a, b) => a - b);
    if (!list.length) continue;
    seasons.push({
      number: n,
      title: `Temporada ${n}`,
      episodes: list.map((num) => ({
        id: String(num),
        number: num,
        title: `Episodio ${num}`,
        thumb: null,
        duration: null,
        audio: ['leg', 'dub'],
        ids: { leg: String(num), dub: String(num) },
      })),
    });
  }
  return seasons;
}

export async function anime(slug) {
  const root = rootOf(slug);
  const hit = await first([`/anime/${root}`], { cacheTtl: 60_000 });
  if (!hit) throw new Error('anime indisponivel');

  const html = hit.res.body;
  const a = jsonKey(html, 'anime') || {};
  const serie = jsonKey(html, 'serie') || {};

  const titulo =
    cleanText(a.title) ||
    cleanText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]) ||
    cleanText(html.match(/<title>([\s\S]*?)<\/title>/)?.[1]).replace(/\s*[-|].*$/, '') ||
    titleFromSlug(root);

  const sinopse =
    cleanText(a.synopsis) ||
    cleanText(html.match(/<meta\s+name="description"\s+content="([^"]*)"/)?.[1]) ||
    '';

  const generos = (Array.isArray(a.genres) ? a.genres.map((g) => (typeof g === 'string' ? g : g?.name)) : [])
    .concat([...html.matchAll(/href="[^"]*\/genero\/([^"/]+)"/gi)].map((m) => decodeEntities(m[1])))
    .filter((g) => g && !/^letra-|^legendado$|^dublado$/i.test(g));

  let seasons = (serie.temporadas || []).map((t) => ({
    number: Number(t.numero) || 1,
    title: t.nome || `Temporada ${Number(t.numero) || 1}`,
    episodes: (t.eps || []).flatMap((e) =>
      ['leg', 'dub']
        .filter((k) => e[k])
        .map((k) => ({
          id: String(e[k].id ?? e.num),
          number: Number(e.num) || 1,
          title: `Episodio ${e.num}`,
          thumb: decodeNextImage(e[k].capa || ''),
          duration: e[k].tempo || null,
          audio: [k],
          ids: { [k]: String(e[k].id ?? e.num) },
        }))
    ),
  })).filter((s) => s.episodes.length);

  if (!seasons.length) seasons = await seasonsFromDom(root, html);

  const epTotal = seasons.reduce((n, s) => n + s.episodes.length, 0);
  const audios = [...new Set(seasons.flatMap((s) => s.episodes.flatMap((e) => e.audio)))];

  return {
    source: meta.id,
    slug: a.slug || root,
    title: titulo,
    poster: decodeNextImage(a.cover || '') || absUrl(html.match(/property="og:image"\s+content="([^"]*)"/)?.[1], BASE) || null,
    banner: decodeNextImage(a.cover || '') || null,
    synopsis: sinopse,
    year: Number(a.year) || Number((html.match(/\b(19|20)\d{2}\b/) || [])[0]) || null,
    type: a.tipo || (/dublado/i.test(titulo) ? 'Dublado' : /legendado/i.test(titulo) ? 'Legendado' : null),
    status: null,
    score: Number((html.match(/"ratingValue"\s*:\s*"?([\d.]+)/) || [])[1]) || null,
    genres: uniqueBy(generos, (g) => g),
    episodeCount: epTotal,
    audios: audios.length ? audios : (Array.isArray(a.audios) ? a.audios : ['leg', 'dub']),
    seasons,
  };
}

/* ---------- player ---------- */
const IFRAME_RE = /<iframe[^>]+src=["']([^"']*blogger\.com\/video\.g\?token=[^"']+)["']/gi;

export async function streams(slug, epId, audio = 'leg', season = 1) {
  const root = rootOf(slug);
  const num = Number(String(epId || '').match(/\d{1,4}/)?.[0]) || 1;
  const s = Number(season) > 0 ? Number(season) : 1;
  const audioKey = audio === 'dub' ? 'dub' : 'leg';

  const found = [];
  const direct = [];
  let pageUrl = watchUrl(root, s, num, audioKey);

  const push = (u) => {
    const abs = absUrl(u, BASE);
    if (!abs || isBlockedEmbed(abs) || isAnimePageUrl(abs) || isJunkMedia(abs)) return;
    if (!found.includes(abs)) found.push(abs);
  };

  let html = '';
  for (const url of [watchUrl(root, s, num, audioKey), watchUrl(root, 1, num, audioKey)]) {
    const res = await fetchText(url, { referer: `${BASE}/anime/${root}`, cacheTtl: 0, timeout: 16_000 });
    if (!res.ok || !res.body) continue;
    pageUrl = url;
    html = res.body;
    break;
  }

  if (html) {
    for (const u of bloggerTokens(html, BASE)) push(u);
    for (const m of html.matchAll(IFRAME_RE)) push(m[1]);
    direct.push(...extractDirectVideosFromText(html, BASE));
  }

  const iframes = uniqueBy(found, (u) => u);
  const resolved = await resolveStreams(iframes, pageUrl);
  const sources = uniqueBy(fixRef([...direct, ...resolved]), (x) => x.url);

  return {
    source: meta.id,
    slug: root,
    episode: String(num),
    episodeNumber: num,
    epId: String(num),
    audio: audioKey,
    season: s,
    pageUrl,
    iframes,
    resolvedAt: Date.now(),
    sources,
  };
}

export default { meta, home, catalog, search, anime, streams };