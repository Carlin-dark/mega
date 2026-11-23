import { fetchText } from '../lib/http.mjs';
import { absUrl, cleanText, decodeEntities, titleFromSlug, uniqueBy } from '../lib/text.mjs';
import { resolveStreams, extractDirectVideosFromText, isAnimePageUrl, isBlockedEmbed } from '../lib/stream.mjs';

const BASES = ['https://betteranime.io', 'https://betteranime.net'];
const BASE = BASES[0];
const CARD_RE = /<a\b[^>]*href="([^"]*\/(?:animes|anime)\/[^"?#]+)"[^>]*>([\s\S]*?)<\/a>/gi;

function card(inner, href, base) {
  const abs = absUrl(href, base);
  if (!abs) return null;
  const slug = abs.replace(/^https?:\/\/[^/]+/, '').split('/').filter(Boolean).pop();
  if (!slug) return null;
  const title =
    cleanText(inner.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/)?.[1]) ||
    cleanText(inner.match(/alt="([^"]*)"/)?.[1]) ||
    titleFromSlug(slug);
  const img = inner.match(/(?:src|data-src)="(https?:\/\/[^"]+|\/[^"]+)"/i);
  return { slug, title, poster: absUrl(img?.[1], base) };
}

const parse = (html, base) => uniqueBy([...html.matchAll(CARD_RE)].map((m) => card(m[2], m[1], base)).filter(Boolean), (c) => c.slug);

async function fetchFirst(paths, opts = {}) {
  for (const b of BASES) {
    for (const p of paths) {
      const url = p.startsWith('http') ? p : `${b}${p}`;
      const res = await fetchText(url, { referer: `${b}/`, ...opts });
      if (res.ok && res.body) return { base: b, res };
    }
  }
  return null;
}

export const meta = { id: 'betteranime', name: 'BetterAnime', base: BASE, lang: 'pt-BR', audio: ['leg', 'dub'] };

export async function home() {
  const hit = await fetchFirst(['/home/', '/home', '/'], { cacheTtl: 60_000 });
  if (!hit) throw new Error('betteranime home indisponivel');
  const all = parse(hit.res.body, hit.base);
  const sections = [
    { id: 'added', title: 'Adicionados recentemente', items: all.slice(0, 24) },
    { id: 'top', title: 'Em alta', items: all.slice(24, 48) },
  ].filter((s) => s.items.length);
  return { hero: all.slice(0, 5), sections };
}

export async function catalog(page = 1) {
  const hit = await fetchFirst([page > 1 ? `/animes?page=${page}` : '/animes', '/home/'], { cacheTtl: 60_000 });
  if (!hit) throw new Error('betteranime catalog indisponivel');
  return { page, items: parse(hit.res.body, hit.base) };
}

export async function search(q) {
  const enc = encodeURIComponent(q);
  const hit = await fetchFirst([`/?s=${enc}`, `/search?q=${enc}`, `/animes?q=${enc}`], { cacheTtl: 30_000 });
  return hit ? parse(hit.res.body, hit.base) : [];
}

export async function anime(slug) {
  const hit = await fetchFirst([`/animes/${slug}/`, `/animes/${slug}`, `/anime/${slug}`], { cacheTtl: 60_000 });
  if (!hit) throw new Error('betteranime anime indisponivel');
  const html = hit.res.body;
  const base = hit.base;
  const eps = [];
  for (const m of html.matchAll(/href="([^"]*\/(?:animes|anime)\/[^"\/]+\/(\d+))"/gi)) {
    const number = Number(m[2]) || eps.length + 1;
    eps.push({ id: m[1], number, title: `Episodio ${number}`, audio: ['leg', 'dub'] });
  }
  return {
    source: meta.id,
    slug,
    title: cleanText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]) || titleFromSlug(slug),
    poster: absUrl(html.match(/property="og:image"\s+content="([^"]+)"/)?.[1], base),
    banner: null,
    synopsis: cleanText(html.match(/property="og:description"\s+content="([^"]+)"/)?.[1]),
    year: Number((html.match(/\b(19|20)\d{2}\b/) || [])[0]) || null,
    genres: [],
    seasons: [{ number: 1, title: 'Temporada 1', episodes: uniqueBy(eps, (e) => e.number).sort((a, b) => a.number - b.number) }],
  };
}

export async function streams(slug, epId) {
  const hit = await fetchFirst([`/animes/${slug}/`, `/animes/${slug}`], { cacheTtl: 30_000 });
  const base = hit?.base || BASE;
  const pageUrl = String(epId).startsWith('http') ? epId : absUrl(epId, base) || `${base}/animes/${slug}/${epId}`;
  const res = await fetchText(pageUrl, { referer: `${base}/animes/${slug}/`, cacheTtl: 0 });
  if (!res.ok) throw new Error(`watch ${res.status}`);

  const iframes = [...res.body.matchAll(/<iframe[^>]+src="([^"]+)"/gi)]
    .map((m) => absUrl(decodeEntities(m[1]), base))
    .filter((u) => u && !isBlockedEmbed(u) && !isAnimePageUrl(u));

  const direct = extractDirectVideosFromText(res.body, pageUrl);
  const resolved = await resolveStreams(iframes, pageUrl);
  const sources = uniqueBy([...direct, ...resolved], (s) => s.url);

  return { source: meta.id, slug, episode: epId, resolvedAt: Date.now(), pageUrl, iframes, sources };
}

export default { meta, home, catalog, search, anime, streams };