import { fetchText } from '../lib/http.mjs';
import { absUrl, cleanText, decodeEntities, titleFromSlug, uniqueBy } from '../lib/text.mjs';
import { readRsc, readJsonKey, extractBalanced } from '../lib/next.mjs';
import { resolveStreams } from '../lib/stream.mjs';

const BASE = 'https://animesonline.blue';
const HEADERS = { referer: `${BASE}/` };

const CARD_RE = /<a\b[^>]*href="([^"]*\/anime\/[^"?#]+)"[^>]*>([\s\S]*?)<\/a>/gi;
const EP_BTN_RE = /title="Epis[oó]dio\s*(\d+)"[\s\S]{0,400}?data-(?:ep|episode|id)="([^"]+)"/gi;
const EP_BTN_RE2 = /data-(?:ep|episode|id)="([^"]+)"[\s\S]{0,400}?title="Epis[oó]dio\s*(\d+)"/gi;
const SEASON_BTN_RE = /title="Temporada\s*(\d+)"[\s\S]{0,300}?data-(?:season|temporada)="([^"]+)"/gi;

function cover(inner) {
  const next = inner.match(/\/_next\/image\?url=([^"'&]+)/);
  if (next) { try { return decodeURIComponent(next[1]); } catch {} }
  const src = inner.match(/(?:src|data-src)="(https?:\/\/[^"]+?\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
  return src?.[1] ?? null;
}

function parseCard(inner, href) {
  const abs = absUrl(href, BASE);
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
    poster: absUrl(cover(inner), BASE),
    year: Number(text.match(/\b(19|20)\d{2}\b/)?.[0]) || null,
    episodes: Number(text.match(/(\d+)\s*eps?/i)?.[1]) || null,
    score: Number(text.match(/\b(\d(?:\.\d)?)\b\s*(?:\/\s*10)?/)?.[1]) || null,
    type: /dublado/i.test(text) ? 'Dublado' : /legendado/i.test(text) ? 'Legendado' : null,
  };
}

export function parseCards(html) {
  const cards = [];
  for (const m of html.matchAll(CARD_RE)) {
    const c = parseCard(m[2], m[1]);
    if (c) cards.push(c);
  }
  return uniqueBy(cards, c => c.slug);
}

const SECTIONS = [
  { id: 'latest', title: 'Últimos Episódios', re: /[ÚU]ltimos\s+Epis[oó]dios/i },
  { id: 'added', title: 'Animes Adicionados', re: /Animes\s+Adicionados|Adicionados\s+recentemente/i },
  { id: 'top', title: 'Top 10', re: /Top\s*10/i },
];

export const meta = {
  id: 'animesonline',
  name: 'AnimesOnline',
  base: BASE,
  lang: 'pt-BR',
  audio: ['leg', 'dub'],
};

export async function home() {
  const res = await fetchText(BASE, { ...HEADERS, cacheTtl: 45_000 });
  if (!res.ok) throw new Error(`home ${res.status}`);
  const html = res.body;

  const marks = SECTIONS
    .map(s => ({ ...s, at: html.search(s.re) }))
    .filter(s => s.at >= 0)
    .sort((a, b) => a.at - b.at);

  const sections = [];
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].at;
    const end = i + 1 < marks.length ? marks[i + 1].at : start + 40_000;
    const items = parseCards(html.slice(start, end));
    if (items.length) sections.push({ id: marks[i].id, title: marks[i].title, items: items.slice(0, 24) });
  }

  if (!sections.length) {
    const all = parseCards(html);
    if (all.length) sections.push({ id: 'added', title: 'Animes Adicionados', items: all.slice(0, 24) });
  }

  const pool = sections.flatMap(s => s.items);
  const hero = uniqueBy(pool, c => c.slug).slice(0, 5).map(c => ({ ...c, banner: c.poster }));

  return { hero, sections };
}

export async function catalog(page = 1) {
  const url = page > 1 ? `${BASE}/animes?page=${page}` : `${BASE}/animes`;
  const res = await fetchText(url, { ...HEADERS, cacheTtl: 60_000 });
  if (!res.ok) throw new Error(`catalog ${res.status}`);
  return { page, items: parseCards(res.body) };
}

export async function search(q) {
  // 1) tenta o JSON interno do site
  const api = await fetchText(`${BASE}/api/search?q=${encodeURIComponent(q)}`, { ...HEADERS });
  if (api.ok && api.body.trim().startsWith('{')) {
    try {
      const data = JSON.parse(api.body);
      const list = data.results || data.animes || data.data || [];
      if (Array.isArray(list) && list.length) {
        return list.map(x => ({
          slug: x.slug || x.href?.split('/anime/')[1],
          title: x.titulo || x.title || x.nome,
          poster: absUrl(x.capa || x.cover || x.image, BASE),
        })).filter(x => x.slug);
      }
    } catch {}
  }
  // 2) fallback HTML (endpoints de busca variam entre versões do site)
  for (const path of [`/search?q=`, `/buscar?q=`, `/animes?q=`]) {
    const res = await fetchText(BASE + path + encodeURIComponent(q), { ...HEADERS, cacheTtl: 30_000 });
    if (!res.ok) continue;
    const items = parseCards(res.body).filter(c =>
      c.title.toLowerCase().includes(q.toLowerCase())
    );
    if (items.length) return items;
    const any = parseCards(res.body);
    if (any.length) return any;
  }
  return [];
}

export async function anime(slug) {
  const url = `${BASE}/anime/${slug}`;
  const res = await fetchText(url, { ...HEADERS, cacheTtl: 60_000 });
  if (!res.ok) throw new Error(`anime ${res.status}`);
  const html = res.body;
  const rsc = readRsc(html);

  const og = k => decodeEntities(html.match(new RegExp(`property="og:${k}"\\s+content="([^"]*)"`))?.[1] || '');
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
    .map(g => (typeof g === 'string' ? g : g?.nome || g?.name))
    .filter(Boolean);

  const serie = readJsonKey(rsc, 'serie') || {};
  const temporadasRaw = serie.temporadas || readJsonKey(rsc, 'temporadas') || [];

  const idOf = v => (typeof v === 'string' ? v : v?.id ?? v?.episodio ?? v?.slug ?? v?.ep ?? null);

  const seasons = temporadasRaw.map((t, i) => {
    const eps = (t.eps || t.episodios || []).map(e => ({
      id: idOf(e),
      number: Number(e.numero ?? e.ep ?? e.episodio ?? 0),
      title: e.titulo || e.title || `Episódio ${e.numero ?? ''}`.trim(),
      thumb: absUrl(e.capa || e.thumb, BASE),
      duration: e.tempos || e.duracao || null,
      audio: [idOf(e.leg) ? 'leg' : null, idOf(e.dub) ? 'dub' : null].filter(Boolean),
      ids: { leg: idOf(e.leg), dub: idOf(e.dub) },
    })).filter(e => e.id || e.ids.leg || e.ids.dub);
    return {
      number: Number(t.numero ?? t.temporada ?? i + 1),
      title: t.titulo || t.title || `Temporada ${t.numero ?? i + 1}`,
      episodes: eps,
    };
  }).filter(s => s.episodes.length);

  // Fallback DOM caso o JSON venha vazio
  if (!seasons.length) {
    const bySeason = new Map();
    for (const m of html.matchAll(SEASON_BTN_RE)) {
      bySeason.set(m[2], { number: Number(m[1]), title: `Temporada ${m[1]}`, episodes: [] });
    }
    const grab = (re, swap) => {
      for (const m of html.matchAll(re)) {
        const num = Number(swap ? m[2] : m[1]);
        const id = swap ? m[1] : m[2];
        const target = bySeason.get(id) || { number: 1, title: 'Temporada 1', episodes: [] };
        if (!bySeason.has(id)) bySeason.set(id, target);
        target.episodes.push({ id, number: num, title: `Episódio ${num}`, audio: ['leg', 'dub'] });
      }
    };
    grab(EP_BTN_RE, false);
    grab(EP_BTN_RE2, true);
    for (const s of bySeason.values()) if (s.episodes.length) seasons.push(s);
    seasons.sort((a, b) => a.number - b.number);
    seasons.forEach(s => s.episodes.sort((a, b) => a.number - b.number));
  }

  return {
    source: meta.id,
    slug,
    title: titulo,
    poster: absUrl(og('image'), BASE) || null,
    banner: absUrl(og('image'), BASE) || null,
    synopsis: sinopse,
    year: Number((html.match(/"ano":\s*"?(\d{4})/) || [])[1]) || null,
    type: (rsc.match(/"tipo":"([^"]+)"/) || [])[1] || null,
    status: (rsc.match(/"status":"([^"]+)"/) || [])[1] || null,
    score: Number((rsc.match(/"nota":\s*"?([\d.]+)/) || [])[1]) || null,
    genres: generos,
    seasons,
  };
}

export async function streams(slug, epId, audio = 'leg') {
  const pageUrl = `${BASE}/anime/${slug}?ep=${encodeURIComponent(epId)}${audio ? `&audio=${audio}` : ''}`;
  const res = await fetchText(pageUrl, { referer: `${BASE}/anime/${slug}`, cacheTtl: 0 });
  if (!res.ok) throw new Error(`watch ${res.status}`);
  const html = res.body;

  const iframes = [];
  for (const m of html.matchAll(/<iframe[^>]+src="([^"]+)"/gi)) {
    const u = absUrl(decodeEntities(m[1]), BASE);
    if (u && !/googletagmanager|doubleclick|facebook/.test(u)) iframes.push(u);
  }
  for (const m of html.matchAll(/https?:\/\/[^"'\s\\]+videoplayback[^"'\s\\]*/gi)) {
    iframes.push(m[0].replace(/\\u0026/g, '&'));
  }

  const sources = await resolveStreams(uniqueBy(iframes, x => x), pageUrl);
  return {
    source: meta.id,
    slug,
    episode: epId,
    audio,
    pageUrl,
    resolvedAt: Date.now(),
    sources,
  };
}

export default { meta, home, catalog, search, anime, streams };