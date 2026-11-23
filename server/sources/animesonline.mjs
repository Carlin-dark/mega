import { fetchText } from '../lib/http.mjs';
import { absUrl, cleanText, decodeEntities, titleFromSlug, uniqueBy } from '../lib/text.mjs';
import { readRsc, readJsonKey } from '../lib/next.mjs';
import { resolveStreams, isAnimePageUrl, isBlockedEmbed } from '../lib/stream.mjs';

const BASE = 'https://animesonline.blue';
const HEADERS = { referer: `${BASE}/` };

const CARD_RE = /<a\b[^>]*href="([^"]*\/anime\/[^"?#]+)"[^>]*>([\s\S]*?)<\/a>/gi;

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
  return uniqueBy(cards, (c) => c.slug);
}

const SECTIONS = [
  { id: 'latest', title: 'Ultimos Episodios', re: /[ÚU]ltimos\s+Epis[oó]dios/i },
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
  const res = await fetchText(BASE, { ...HEADERS, cacheTtl: 45_000 });
  if (!res.ok) throw new Error(`home ${res.status}`);
  const html = res.body;

  const marks = SECTIONS
    .map((s) => ({ ...s, at: html.search(s.re) }))
    .filter((s) => s.at >= 0)
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

  const pool = sections.flatMap((s) => s.items);
  const hero = uniqueBy(pool, (c) => c.slug).slice(0, 5).map((c) => ({ ...c, banner: c.poster }));
  return { hero, sections };
}

export async function catalog(page = 1) {
  const url = page > 1 ? `${BASE}/animes?page=${page}` : `${BASE}/animes`;
  const res = await fetchText(url, { ...HEADERS, cacheTtl: 60_000 });
  if (!res.ok) throw new Error(`catalog ${res.status}`);
  return { page, items: parseCards(res.body) };
}

export async function search(q) {
  const api = await fetchText(`${BASE}/api/search?q=${encodeURIComponent(q)}`, { ...HEADERS });
  if (api.ok && api.body.trim().startsWith('{')) {
    try {
      const data = JSON.parse(api.body);
      const list = data.results || data.animes || data.data || [];
      if (Array.isArray(list) && list.length) {
        return list.map((x) => ({
          slug: x.slug || x.href?.split('/anime/')[1],
          title: x.titulo || x.title || x.nome,
          poster: absUrl(x.capa || x.cover || x.image, BASE),
        })).filter((x) => x.slug);
      }
    } catch {}
  }
  for (const path of ['/search?q=', '/buscar?q=', '/animes?q=']) {
    const res = await fetchText(BASE + path + encodeURIComponent(q), { ...HEADERS, cacheTtl: 30_000 });
    if (!res.ok) continue;
    const items = parseCards(res.body).filter((c) => c.title.toLowerCase().includes(q.toLowerCase()));
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
        thumb: absUrl(e.capa || e.thumb, BASE),
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

  if (!seasons.length) {
    const eps = episodesFromHtml(html, slug);
    if (eps.length) seasons.push({ number: 1, title: 'Temporada 1', episodes: eps });
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

export async function streams(slug, epId, audio = 'leg', season = 1) {
  const id = encodeURIComponent(epId);
  const candidates = [
    `${BASE}/anime/${slug}?ep=${id}&t=${season}${audio ? `&audio=${audio}` : ''}`,
    `${BASE}/anime/${slug}?ep=${id}${audio ? `&audio=${audio}` : ''}`,
    `${BASE}/anime/${slug}?ep=${id}`,
    `${BASE}/anime/${slug}/episodio/${id}`,
  ];

  const found = [];
  let pageUrl = candidates[0];

  for (const url of candidates) {
    const res = await fetchText(url, { referer: `${BASE}/anime/${slug}`, cacheTtl: 0 });
    if (!res.ok) continue;
    const html = res.body;

    for (const m of html.matchAll(/<iframe[^>]+src="([^"]+)"/gi)) {
      const u = absUrl(decodeEntities(m[1]), BASE);
      if (u && !isBlockedEmbed(u) && !isAnimePageUrl(u)) found.push(u);
    }
    for (const m of html.matchAll(/https?:\/\/[^"'\s\\]+videoplayback[^"'\s\\]*/gi)) {
      found.push(m[0].replace(/\\u0026/g, '&'));
    }
    for (const m of html.matchAll(/(?:https?:)?\/\/www\.blogger\.com\/video\.g\?token=([A-Za-z0-9_-]+)/g)) {
      found.push(`https://www.blogger.com/video.g?token=${m[1]}`);
    }
    for (const m of html.matchAll(/video\.g\\?\/?\?token=([A-Za-z0-9_-]+)/g)) {
      found.push(`https://www.blogger.com/video.g?token=${m[1]}`);
    }
    for (const m of html.matchAll(/https?:\/\/[^"'\s\\]+\.(?:mp4|m3u8)[^"'\s\\]*/gi)) {
      const u = m[0].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
      if (!isAnimePageUrl(u)) found.push(u);
    }

    if (found.length) {
      pageUrl = url;
      break;
    }
  }

  const iframes = uniqueBy(found, (x) => x).filter((u) => !isAnimePageUrl(u));
  const sources = await resolveStreams(iframes, pageUrl);
  // Só expõe iframe se for embed de vídeo/player real (nunca página /anime/ do site)
  const cleanEmbeds = iframes.filter((u) => !/animesonline\.blue\/anime\//i.test(u));

  return {
    source: meta.id,
    slug,
    episode: epId,
    audio,
    season,
    pageUrl,
    iframes: cleanEmbeds,
    resolvedAt: Date.now(),
    sources,
  };
}

export async function calendar() {
  const res = await fetchText(BASE, { ...HEADERS, cacheTtl: 120_000 });
  if (!res.ok) throw new Error(`calendar ${res.status}`);
  const rsc = readRsc(res.body);
  const days = readJsonKey(rsc, 'days') || [];
  const out = [];
  for (const d of days) {
    const day = d.dia || d.day || d.data || d.date || null;
    const list = d.animes || d.items || d.eps || [];
    for (const a of list) {
      const slug = a.slug || a.href?.split('/anime/')[1]?.replace(/[?#].*$/, '');
      if (!slug) continue;
      out.push({
        slug,
        title: a.titulo || a.title || a.nome || titleFromSlug(slug),
        cover: absUrl(a.capa || a.cover || a.imagem, BASE),
        day,
      });
    }
  }
  return uniqueBy(out, (x) => x.slug);
}

export default { meta, home, catalog, search, anime, streams, calendar };