import { fetchText } from '../lib/http.mjs';
import { absUrl, cleanText, decodeEntities, titleFromSlug, uniqueBy } from '../lib/text.mjs';
import {
  resolveStreams,
  extractDirectVideosFromText,
  isAnimePageUrl,
  isBlockedEmbed,
  isJunkMedia,
  bloggerTokens,
} from '../lib/stream.mjs';

const BASES = ['https://animesonlinecc.to'];
const BASE = BASES[0];

export const meta = {
  id: 'animesonlinecc',
  name: 'AnimesOnlineCC',
  base: BASE,
  lang: 'pt-BR',
  audio: ['leg', 'dub'],
};

const CARD_RE = /<a\b[^>]*href="([^"]*\/anime\/[^"?#]+)"[^>]*>([\s\S]*?)<\/a>/gi;
const EP_LINK_RE = /href="([^"]*\/episodio\/[^"?#]+)"[^>]*>([\s\S]{0,180}?)</gi;
const OPTION_DIV_RE = /<div[^>]+id="(option-\d+)"[^>]*>([\s\S]*?)<\/div>/gi;
const OPTION_NAV_RE = /<a[^>]+href="#(option-\d+)"[^>]*>([\s\S]{0,200}?)<\/a>/gi;
const IFRAME_RE = /<iframe[^>]+src=["']([^"']+)["']/gi;

const rootOf = (slug) => String(slug || '').replace(/\/+$/, '').replace(/-\d+-episodio-\d+$/i, '').replace(/-episodio-\d+$/i, '');

function episodeUrl(root, season, num) {
  const s = Number(season) || 1;
  const suffix = s > 1 ? `-${s}` : '';
  return `${BASE}/episodio/${root}${suffix}-episodio-${num}/`;
}

function isEpisodePage(u = '') {
  return /\/episodio\//i.test(String(u));
}

function fixRef(list) {
  return list.map((s) => ({
    ...s,
    referer: /googlevideo\.com/i.test(s.url) ? 'https://www.blogger.com/' : (s.referer || BASE + '/'),
  }));
}

function coverFrom(inner, base) {
  const next = inner.match(/\/_next\/image\?url=([^"'&]+)/);
  if (next) {
    try { return decodeURIComponent(next[1]); } catch {}
  }
  const abs = inner.match(/(?:src|data-src|data-lazy-src|data-original)="(https?:\/\/[^"]+?\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
  if (abs?.[1]) return abs[1];
  const rel = inner.match(/(?:src|data-src|data-lazy-src|data-original)="(\/[^"]+?\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
  return rel?.[1] ? absUrl(rel[1], base) : null;
}

function parseCard(inner, href, base) {
  const abs = absUrl(href, base);
  if (!abs) return null;
  const slug = abs.split('/anime/')[1]?.replace(/[?#].*$/, '').replace(/\/+$/, '');
  if (!slug) return null;
  const title =
    cleanText(inner.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/)?.[1]) ||
    cleanText(inner.match(/alt="([^"]*)"/)?.[1]) ||
    cleanText(inner.match(/title="([^"]*)"/)?.[1]) ||
    titleFromSlug(slug);
  const text = cleanText(inner);
  return {
    slug,
    title,
    poster: absUrl(coverFrom(inner, base), base),
    year: Number(text.match(/\b(19|20)\d{2}\b/)?.[0]) || null,
    episodes: Number(text.match(/(\d+)\s*eps?/i)?.[1]) || null,
    score: Number(text.match(/\b(\d(?:\.\d)?)\b\s*(?:\/\s*10)?/)?.[1]) || null,
    type: /dublado/i.test(text) ? 'Dublado' : /legendado/i.test(text) ? 'Legendado' : null,
  };
}

export function parseCards(html, base = BASE) {
  const doc = String(html || '');
  const cards = [];
  for (const m of doc.matchAll(CARD_RE)) {
    const c = parseCard(m[2], m[1], base);
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

export async function home() {
  const hit = await first(['/', '/anime/'], { cacheTtl: 45_000 });
  if (!hit) throw new Error('home indisponivel');
  const all = parseCards(hit.res.body, hit.base);
  const sections = [];
  if (all.length) sections.push({ id: 'latest', title: 'Ultimos Episodios', items: all.slice(0, 24) });
  if (all.length > 6) sections.push({ id: 'top', title: 'Em Alta', items: all.slice(6, 30) });
  return { hero: all.slice(0, 5).map((c) => ({ ...c, banner: c.poster })), sections };
}

export async function catalog(page = 1) {
  const p = page > 1 ? `/anime/page/${page}/` : '/anime/';
  const hit = await first([p, '/anime/'], { cacheTtl: 60_000 });
  if (!hit) throw new Error('catalog indisponivel');
  return { page, items: parseCards(hit.res.body, hit.base) };
}

function mapWpResults(list, base) {
  const out = [];
  for (const item of list || []) {
    const url = item?.url || item?.link || '';
    const slug = (url.match(/\/anime\/([^/?#]+)/) || [])[1];
    if (!slug) continue;
    out.push({ slug, title: decodeEntities(item.title || titleFromSlug(slug)), poster: null });
  }
  return uniqueBy(out, (i) => i.slug);
}

export async function search(q) {
  const raw = String(q || '').trim();
  if (!raw) return [];
  const enc = encodeURIComponent(raw);

  for (const b of BASES) {
    for (const p of [
      `/wp-json/wp/v2/search?search=${enc}&per_page=20`,
      `/wp-json/wp/v2/animes?search=${enc}&per_page=20`,
    ]) {
      const res = await fetchText(`${b}${p}`, { referer: `${b}/`, cacheTtl: 20_000, timeout: 12_000 });
      if (!res.ok || !res.body.trim().startsWith('[')) continue;
      try {
        const items = mapWpResults(JSON.parse(res.body), b);
        if (items.length) return items;
      } catch {}
    }
  }

  const plus = raw.replace(/\s+/g, '+');
  const hit = await first([`/search/${plus}`, `/?s=${enc}`, `/page/1/?s=${enc}`], { cacheTtl: 30_000 });
  if (!hit) return [];
  return parseCards(hit.res.body, hit.base);
}

function seasonsFromHtml(html, root, base) {
  const found = new Map();
  const add = (season, number) => {
    if (!number || number < 1) return;
    const s = season && season > 0 ? season : 1;
    if (!found.has(s)) found.set(s, new Set());
    found.get(s).add(number);
  };

  const urlRe = /\/episodio\/([^"'?#]+?)-episodio-(\d{1,4})\/?["'?#]/gi;
  for (const m of html.matchAll(urlRe)) {
    const seg = m[1];
    if (!seg.startsWith(root)) continue;
    const rest = seg.slice(root.length).replace(/^-/, '');
    add(rest ? Number(rest) : 1, Number(m[2]));
  }

  const titleRe = /title="(?:Epis[oó]dio|EP)\s*(\d{1,4})"/gi;
  for (const m of html.matchAll(titleRe)) add(1, Number(m[1]));

  const dataRe = /data-(?:ep|episode|episodio|numero)="(\d{1,4})"/gi;
  for (const m of html.matchAll(dataRe)) add(1, Number(m[1]));

  for (const m of html.matchAll(EP_LINK_RE)) {
    const href = m[1];
    const num = (href.match(/-episodio-(\d{1,4})\/?$/i) || [])[1];
    if (!num) continue;
    const season = (href.match(/-(\d+)-episodio-\d+\/?$/i) || [])[1];
    add(season ? Number(season) : 1, Number(num));
  }

  return [...found.entries()]
    .map(([season, nums]) => ({
      number: season,
      title: `Temporada ${season}`,
      episodes: [...nums].sort((a, b) => a - b).map((n) => ({
        id: String(n),
        number: n,
        title: `Episodio ${n}`,
        thumb: null,
        duration: null,
        audio: ['leg', 'dub'],
        ids: { leg: String(n), dub: String(n) },
      })),
    }))
    .filter((s) => s.episodes.length)
    .sort((a, b) => a.number - b.number);
}

export async function anime(slug) {
  const root = rootOf(slug);
  const hit = await first([`/anime/${root}/`, `/anime/${root}`], { cacheTtl: 60_000 });
  if (!hit) throw new Error('anime indisponivel');
  const html = hit.res.body;
  const base = hit.base;

  const og = (k) => decodeEntities(html.match(new RegExp(`property="og:${k}"\\s+content="([^"]*)"`))?.[1] || '');
  const titulo =
    cleanText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]) ||
    og('title').replace(/\s*[-|]\s*Animes Online.*$/i, '') ||
    titleFromSlug(root);

  const sinopse =
    cleanText(html.match(/<meta\s+name="description"\s+content="([^"]*)"/)?.[1]) ||
    og('description') ||
    '';

  const generos = [...html.matchAll(/href="[^"]*\/genero\/([^"/]+)\/"/gi)]
    .map((m) => decodeEntities(m[1]))
    .filter((g) => g && !/^letra-|^legendado$|^dublado$/i.test(g));

  const seasons = seasonsFromHtml(html, root, base);
  const epTotal = seasons.reduce((n, s) => n + s.episodes.length, 0);

  return {
    source: meta.id,
    slug: root,
    title: titulo,
    poster: absUrl(og('image'), base) || null,
    banner: absUrl(og('image'), base) || null,
    synopsis: sinopse,
    year: Number((html.match(/\b(19|20)\d{2}\b/) || [])[0]) || null,
    type: /dublado/i.test(titulo) ? 'Dublado' : /legendado/i.test(titulo) ? 'Legendado' : null,
    status: null,
    score: Number((html.match(/"ratingValue"\s*:\s*"?([\d.]+)/) || [])[1]) || null,
    genres: uniqueBy(generos, (g) => g),
    episodeCount: epTotal,
    seasons,
  };
}

function audioMap(html) {
  const map = new Map();
  for (const m of html.matchAll(OPTION_NAV_RE)) {
    const label = cleanText(m[2]).toLowerCase();
    if (!label) continue;
    map.set(m[1], /dublado/.test(label) ? 'dub' : /legendado/.test(label) ? 'leg' : 'outro');
  }
  if (!map.size) {
    map.set('option-1', 'dub');
    map.set('option-2', 'leg');
  }
  return map;
}

function pushUnique(list, url, audio) {
  if (!url || isBlockedEmbed(url) || isAnimePageUrl(url) || isEpisodePage(url) || isJunkMedia(url)) return;
  if (list.some((x) => x.url === url)) return;
  list.push({ url, audio });
}

export async function streams(slug, epId, audio = 'leg', season = 1) {
  const root = rootOf(slug);
  const num = Number(String(epId || '').match(/\d{1,4}/)?.[0]) || 1;
  const s = Number(season) > 0 ? Number(season) : 1;
  const audioKey = audio === 'dub' ? 'dub' : 'leg';

  const found = [];
  const direct = [];
  let pageUrl = episodeUrl(root, s, num);

  const candidates = [
    episodeUrl(root, s, num),
    episodeUrl(root, 1, num),
    `${BASE}/episodio/${root}-episodio-${num}/`,
  ];

  let html = '';
  for (const b of BASES) {
    for (const url of candidates) {
      const res = await fetchText(url, { referer: `${b}/anime/${root}/`, cacheTtl: 0, timeout: 15000 });
      if (!res.ok || !res.body) continue;
      pageUrl = url;
      html = res.body;
      break;
    }
    if (html) break;
  }

  if (html) {
    const map = audioMap(html);

    for (const m of html.matchAll(OPTION_DIV_RE)) {
      const aud = map.get(m[1]) || 'outro';
      for (const url of bloggerTokens(m[2], BASE)) pushUnique(found, url, aud);
      for (const f of m[2].matchAll(IFRAME_RE)) {
        const abs = absUrl(f[1], BASE);
        if (abs && /blogger\.com\/video\.g/i.test(abs)) pushUnique(found, abs, aud);
      }
      direct.push(...extractDirectVideosFromText(m[2], BASE));
    }

    if (!found.length) {
      for (const url of bloggerTokens(html, BASE)) pushUnique(found, url, 'outro');
    }

    if (!found.length) {
      for (const f of html.matchAll(IFRAME_RE)) {
        const abs = absUrl(f[1], BASE);
        if (abs) pushUnique(found, abs, 'outro');
      }
    }
  }

  const ordered = [
    ...found.filter((x) => x.audio === audioKey),
    ...found.filter((x) => x.audio === 'outro'),
    ...found.filter((x) => x.audio !== audioKey && x.audio !== 'outro'),
  ];
  const iframes = uniqueBy(ordered.map((x) => x.url), (u) => u);

  const resolved = await resolveStreams(iframes, pageUrl);
  const sources = uniqueBy([...direct, ...resolved], (x) => x.url);

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