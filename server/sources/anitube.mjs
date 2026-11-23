import { fetchText } from '../lib/http.mjs';
import { absUrl, cleanText, decodeEntities, titleFromSlug, uniqueBy } from '../lib/text.mjs';
import { resolveStreams, extractDirectVideosFromText, isAnimePageUrl, isBlockedEmbed } from '../lib/stream.mjs';

const BASES = ['https://flixnet.cfd/animefire', 'https://anitube.vip'];
const BASE = BASES[0];
const CARD_RE = /<a\b[^>]*href="([^"]*\/(?:anime|animes)\/[^"?#]+)"[^>]*>([\s\S]*?)<\/a>/gi;

export const meta = { id: 'anitube', name: 'Anitube', base: BASE, lang: 'pt-BR', audio: ['leg', 'dub'] };

function fixRef(list) {
  return list.map((s) => ({
    ...s,
    referer: /googlevideo\.com/i.test(s.url) ? 'https://www.blogger.com/' : (s.referer || undefined),
  }));
}

export function parseCards(html, base = BASE) {
  const out = [];
  for (const m of html.matchAll(CARD_RE)) {
    const abs = absUrl(m[1], base);
    if (!abs) continue;
    const slug = (abs.split('/anime/')[1] || '').replace(/[?#].*$/, '').replace(/\/+$/, '');
    if (!slug || /\//.test(slug)) continue;
    const title =
      cleanText(m[2].match(/title="([^"]*)"/)?.[1]) ||
      cleanText(m[2].match(/alt="([^"]*)"/)?.[1]) ||
      titleFromSlug(slug);
    const img = m[2].match(/(?:src|data-src|data-original)="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i)?.[1];
    out.push({ slug, title, poster: img ? absUrl(img, base) : null });
  }
  return uniqueBy(out, (c) => c.slug);
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
  const hit = await first(['/', '/home/'], { cacheTtl: 45_000 });
  if (!hit) throw new Error('home indisponivel');
  const all = parseCards(hit.res.body, hit.base);
  const sections = [];
  if (all.length) sections.push({ id: 'latest', title: 'Ultimos Episodios', items: all.slice(0, 24) });
  if (all.length > 6) sections.push({ id: 'top', title: 'Em Alta', items: all.slice(6, 30) });
  return { hero: all.slice(0, 5).map((c) => ({ ...c, banner: c.poster })), sections };
}

export async function catalog(page = 1) {
  const hit = await first([page > 1 ? `/animes?page=${page}` : '/animes', '/'], { cacheTtl: 60_000 });
  if (!hit) throw new Error('catalog indisponivel');
  return { page, items: parseCards(hit.res.body, hit.base) };
}

export async function search(q) {
  const hit = await first(
    [`/search?q=${encodeURIComponent(q)}`, `/?s=${encodeURIComponent(q)}`, `/animes/pesquisar?q=${encodeURIComponent(q)}`],
    { cacheTtl: 30_000 }
  );
  if (!hit) return [];
  return parseCards(hit.res.body, hit.base);
}

export async function anime(slug) {
  const hit = await first([`/anime/${slug}`, `/anime/${slug}/`, `/animes/${slug}/`], { cacheTtl: 60_000 });
  if (!hit) throw new Error('anime indisponivel');
  const html = hit.res.body;
  const base = hit.base;

  const titulo =
    cleanText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]) ||
    cleanText(html.match(/<title>([\s\S]*?)<\/title>/)?.[1]).replace(/\s*[-|].*$/, '') ||
    titleFromSlug(slug);

  const nums = [];
  for (const pat of [
    new RegExp(`href="[^"]*\\/anime\\/${slug}\\/episodio\\/(\\d+)"`, 'gi'),
    new RegExp(`href="[^"]*\\/anime\\/${slug}\\/(\\d+)"`, 'gi'),
    new RegExp(`/episodios/${slug}-episodio-(\\d+)`, 'gi'),
  ]) {
    for (const m of html.matchAll(pat)) nums.push(Number(m[1]));
  }

  const uniq = [...new Set(nums)].filter((n) => n > 0).sort((a, b) => a - b);
  const isDub = /dublado/i.test(titulo) || /-dublado/i.test(slug);

  return {
    source: meta.id,
    slug,
    title: titulo,
    poster: absUrl(html.match(/property="og:image"\s+content="([^"]*)"/)?.[1], base) || null,
    banner: absUrl(html.match(/property="og:image"\s+content="([^"]*)"/)?.[1], base) || null,
    synopsis: cleanText(html.match(/<meta\s+name="description"\s+content="([^"]*)"/)?.[1]) || '',
    year: Number((html.match(/\b(19|20)\d{2}\b/) || [])[0]) || null,
    type: isDub ? 'Dublado' : 'Legendado',
    status: null,
    score: null,
    genres: [...html.matchAll(/href="[^"]*\/genero\/([^"]+)"/gi)].map((m) => decodeEntities(m[1])),
    seasons: uniq.length
      ? [{
          number: 1,
          title: 'Temporada 1',
          episodes: uniq.map((n) => ({
            id: String(n), number: n, title: `Episodio ${n}`,
            thumb: null, duration: null,
            audio: [isDub ? 'dub' : 'leg'],
            ids: { leg: String(n), dub: String(n) },
          })),
        }]
      : [],
  };
}

export async function streams(slug, epId, audio = 'leg', season = 1) {
  const num = String(epId || '').match(/\d{1,4}/)?.[0] || '1';
  const audioKey = audio === 'dub' ? 'dub' : 'leg';
  const found = [];
  const direct = [];
  let pageUrl = `${BASE}/anime/${slug}/episodio/${num}/`;

  const push = (u, base) => {
    const abs = absUrl(u, base);
    if (!abs || isBlockedEmbed(abs) || isAnimePageUrl(abs)) return;
    if (!found.includes(abs)) found.push(abs);
  };

  const collect = (html, base) => {
    const txt = decodeEntities(String(html || '')).replace(/\\u0026/g, '&').replace(/\\\//g, '/');
    for (const m of txt.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)) push(m[1], base);
    for (const m of txt.matchAll(/<(?:video|source)[^>]+src=["']([^"']+)["']/gi)) push(m[1], base);
    for (const m of txt.matchAll(/(?:https?:)?\/\/www\.blogger\.com\/video\.g\?token=[A-Za-z0-9_=-]+/gi)) {
      push(m[0].startsWith('http') ? m[0] : `https:${m[0]}`, base);
    }
    direct.push(...extractDirectVideosFromText(txt, base));
  };

  for (const b of BASES) {
    const candidates = [
      `${b}/anime/${slug}/episodio/${num}/`,
      `${b}/anime/${slug}/episodio/${num}`,
      `${b}/episodios/${slug}-episodio-${num}/`,
      `${b}/anime/${slug}/${num}/`,
      `${b}/anime/${slug}/${num}`,
    ];
    for (const watch of candidates) {
      const res = await fetchText(watch, { referer: `${b}/anime/${slug}`, cacheTtl: 0, timeout: 15000 });
      if (!res.ok || !res.body) continue;
      pageUrl = watch;
      collect(res.body, b);
      if (found.length || direct.length) break;
    }
    if (found.length || direct.length) break;
  }

  const iframes = uniqueBy(found, (x) => x);
  const resolved = await resolveStreams(iframes, pageUrl);
  const sources = uniqueBy(fixRef([...direct, ...resolved]), (s) => s.url);

  return {
    source: meta.id, slug, episode: num, episodeNumber: Number(num), epId: num,
    audio: audioKey, season, pageUrl, iframes, resolvedAt: Date.now(), sources,
  };
}

export default { meta, home, catalog, search, anime, streams };