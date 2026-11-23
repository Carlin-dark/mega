import { fetchText } from '../lib/http.mjs';
import { absUrl, cleanText, decodeEntities, titleFromSlug, uniqueBy } from '../lib/text.mjs';
import { resolveStreams } from '../lib/stream.mjs';

const BASE = 'https://animefire.io';
const H = { referer: `${BASE}/` };
const CARD_RE = /<a\b[^>]*href="([^"]*\/anime\/[^"?#]+)"[^>]*>([\s\S]*?)<\/a>/gi;

function card(inner, href) {
  const abs = absUrl(href, BASE);
  if (!abs) return null;
  const slug = abs.split('/anime/')[1].replace(/[?#].*$/, '').replace(/\/+$/, '');
  const title =
    cleanText(inner.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/)?.[1]) ||
    cleanText(inner.match(/alt="([^"]*)"/)?.[1]) ||
    titleFromSlug(slug);
  const img = inner.match(/(?:src|data-src)="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
  return { slug, title, poster: absUrl(img?.[1], BASE) };
}

const parse = (html) => uniqueBy([...html.matchAll(CARD_RE)].map((m) => card(m[2], m[1])).filter(Boolean), (c) => c.slug);

export const meta = { id: 'animefire', name: 'AnimeFire', base: BASE, lang: 'pt-BR', audio: ['leg', 'dub'] };

export async function home() {
  const res = await fetchText(BASE, { ...H, cacheTtl: 60_000 });
  if (!res.ok) throw new Error(`home ${res.status}`);
  const all = parse(res.body);
  const sections = [
    { id: 'added', title: 'Adicionados recentemente', items: all.slice(0, 24) },
    { id: 'top', title: 'Em alta', items: all.slice(24, 48) },
  ].filter((s) => s.items.length);
  return { hero: all.slice(0, 5), sections };
}

export async function catalog(page = 1) {
  const res = await fetchText(`${BASE}/animes?page=${page}`, { ...H, cacheTtl: 60_000 });
  if (!res.ok) throw new Error(`catalog ${res.status}`);
  return { page, items: parse(res.body) };
}

export async function search(q) {
  for (const path of ['/search?q=', '/buscar?q=']) {
    const res = await fetchText(BASE + path + encodeURIComponent(q), { ...H, cacheTtl: 30_000 });
    if (!res.ok) continue;
    const items = parse(res.body);
    if (items.length) return items;
  }
  return [];
}

export async function anime(slug) {
  const res = await fetchText(`${BASE}/anime/${slug}`, { ...H, cacheTtl: 60_000 });
  if (!res.ok) throw new Error(`anime ${res.status}`);
  const html = res.body;
  const title = cleanText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]) || titleFromSlug(slug);
  const eps = [];
  for (const m of html.matchAll(/href="([^"]*\/anime\/[^"\/]+\/(\d+))"[^>]*>/gi)) {
    eps.push({ id: m[1], number: Number(m[2]), title: `Episodio ${m[2]}`, audio: ['leg', 'dub'] });
  }
  return {
    source: meta.id, slug, title,
    poster: absUrl(html.match(/property="og:image"\s+content="([^"]+)"/)?.[1], BASE),
    banner: null,
    synopsis: cleanText(html.match(/property="og:description"\s+content="([^"]+)"/)?.[1]),
    year: Number((html.match(/\b(19|20)\d{2}\b/) || [])[0]) || null,
    genres: [...html.matchAll(/\/genero\/[^"]*"[^>]*>([^<]+)</gi)].map((m) => cleanText(m[1])),
    seasons: [{ number: 1, title: 'Temporada 1', episodes: uniqueBy(eps, (e) => e.number).sort((a, b) => a.number - b.number) }],
  };
}

export async function streams(slug, epId) {
  const pageUrl = epId.startsWith('http') ? epId : absUrl(epId, BASE);
  const res = await fetchText(pageUrl, { referer: `${BASE}/anime/${slug}`, cacheTtl: 0 });
  if (!res.ok) throw new Error(`watch ${res.status}`);
  const iframes = [...res.body.matchAll(/<iframe[^>]+src="([^"]+)"/gi)]
    .map((m) => absUrl(decodeEntities(m[1]), BASE))
    .filter((u) => u && !/googletagmanager|doubleclick/.test(u));
  return { source: meta.id, slug, episode: epId, resolvedAt: Date.now(), pageUrl, iframes, sources: await resolveStreams(iframes, pageUrl) };
}

export default { meta, home, catalog, search, anime, streams };