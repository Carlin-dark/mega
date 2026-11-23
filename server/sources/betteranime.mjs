import { fetchText } from '../lib/http.mjs';
import { absUrl, cleanText, decodeEntities, titleFromSlug, uniqueBy } from '../lib/text.mjs';
import { resolveStreams, extractDirectVideosFromText, isAnimePageUrl, isBlockedEmbed } from '../lib/stream.mjs';

const BASES = ['https://betteranime.io', 'https://betteranime.net'];
const BASE = BASES[0];

export const meta = { id: 'betteranime', name: 'BetterAnime', base: BASE, lang: 'pt-BR', audio: ['leg', 'dub'] };

const rootOf = (slug) => String(slug || '').replace(/\/+$/, '').replace(/-dublado$/i, '').replace(/-\d+$/, '');
const seasonOf = (slug) => Number(String(slug || '').match(/-(\d+)(?:-dublado)?\/?$/)?.[1]) || 1;

function epSlug(slug, season, audio, num) {
  return [rootOf(slug), Number(season) > 1 ? String(Number(season)) : '', audio === 'dub' ? 'dublado' : '', `episodio-${num}`]
    .filter(Boolean).join('-');
}

function fixRef(list) {
  return list.map((s) => ({ ...s, referer: /googlevideo\.com/i.test(s.url) ? 'https://www.blogger.com/' : (s.referer || undefined) }));
}

const LINK_RE = /(?:href|data-href|data-url)="([^"]*\/(?:animes|anime)\/[^"?#]+)"/gi;

export function harvest(html, base = BASE) {
  const out = [];
  const seen = new Set();
  const push = (raw) => {
    const abs = absUrl(raw, base);
    if (!abs) return;
    const m = abs.match(/\/(?:animes|anime)\/([^/?#]+)/);
    if (!m) return;
    const slug = m[1].replace(/\/+$/, '');
    if (!slug || seen.has(slug)) return;
    seen.add(slug);
    out.push({ slug, title: titleFromSlug(slug), poster: null });
  };
  for (const m of String(html || '').matchAll(LINK_RE)) push(m[1]);
  for (const m of String(html || '').matchAll(/https?:\/\/[^"'\s<>\\]+\/(?:animes|anime)\/[^"'\s<>\\?#]+/gi)) push(m[0]);
  return out;
}

export function parseCards(html, base = BASE) {
  const cards = harvest(html, base);
  const doc = String(html || '');
  for (const c of cards) {
    const i = doc.indexOf(`/animes/${c.slug}`);
    if (i < 0) continue;
    const win = doc.slice(Math.max(0, i - 600), i + 600);
    const t = cleanText(win.match(/title="([^"]*)"/)?.[1]) || cleanText(win.match(/alt="([^"]*)"/)?.[1]);
    if (t) c.title = t;
    const img = win.match(/(?:src|data-src|data-lazy-src)="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i)?.[1];
    if (img) c.poster = absUrl(img, base);
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

async function wpSearch(q) {
  const enc = encodeURIComponent(q);
  for (const b of BASES) {
    for (const p of [`/wp-json/wp/v2/search?search=${enc}&per_page=20`, `/wp-json/wp/v2/animes?search=${enc}&per_page=20`]) {
      const res = await fetchText(`${b}${p}`, { referer: `${b}/`, cacheTtl: 20_000, timeout: 12_000 });
      if (!res.ok || !res.body.trim().startsWith('[')) continue;
      try {
        const list = JSON.parse(res.body);
        const items = list
          .map((x) => {
            const u = x.url || x.link || '';
            const slug = (u.match(/\/(?:animes|anime)\/([^/?#]+)/) || [])[1];
            return slug ? { slug, title: decodeEntities(x.title || titleFromSlug(slug)), poster: null } : null;
          })
          .filter(Boolean);
        if (items.length) return uniqueBy(items, (i) => i.slug);
      } catch {}
    }
  }
  return [];
}

export async function home() {
  const hit = await first(['/home/', '/'], { cacheTtl: 45_000 });
  if (!hit) throw new Error('home indisponivel');
  const all = parseCards(hit.res.body, hit.base);
  const sections = [];
  if (all.length) sections.push({ id: 'latest', title: 'Ultimos Episodios', items: all.slice(0, 24) });
  if (all.length > 6) sections.push({ id: 'top', title: 'Em Alta', items: all.slice(6, 30) });
  return { hero: all.slice(0, 5).map((c) => ({ ...c, banner: c.poster })), sections };
}

export async function catalog(page = 1) {
  const hit = await first([page > 1 ? `/animes?page=${page}` : '/animes', '/home/'], { cacheTtl: 60_000 });
  if (!hit) throw new Error('catalog indisponivel');
  return { page, items: parseCards(hit.res.body, hit.base) };
}

export async function search(q) {
  const fromWp = await wpSearch(q);
  if (fromWp.length) return fromWp;
  const hit = await first([`/home/?s=${encodeURIComponent(q)}`, `/?s=${encodeURIComponent(q)}`], { cacheTtl: 30_000 });
  if (!hit) return [];
  return parseCards(hit.res.body, hit.base);
}

export async function anime(slug) {
  const hit = await first([`/animes/${slug}/`, `/animes/${slug}`], { cacheTtl: 60_000 });
  if (!hit) throw new Error('anime indisponivel');
  const html = hit.res.body;
  const base = hit.base;

  const titulo =
    cleanText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]) ||
    cleanText(html.match(/<title>([\s\S]*?)<\/title>/)?.[1]).replace(/\s*[-|].*$/, '') ||
    titleFromSlug(slug);

  const isDub = /-dublado/i.test(slug);
  const nums = new Set();
  const epRe = new RegExp(`/episodios/${rootOf(slug)}(?:-\\d+)?(?:-dublado)?-episodio-(\\d+)`, 'gi');
  for (const m of html.matchAll(epRe)) nums.add(Number(m[1]));
  for (const m of html.matchAll(/episodio[-/](\d{1,4})/gi)) nums.add(Number(m[1]));

  const uniq = [...nums].filter((n) => n > 0).sort((a, b) => a - b);

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
          number: seasonOf(slug),
          title: `Temporada ${seasonOf(slug)}`,
          episodes: uniq.map((n) => ({
            id: String(n), number: n, title: `Episodio ${n}`, thumb: null, duration: null,
            audio: [isDub ? 'dub' : 'leg'], ids: { leg: String(n), dub: String(n) },
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
  let pageUrl = `${BASE}/episodios/${epSlug(slug, season, audioKey, num)}/`;

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
    for (const m of txt.matchAll(/https?:\/\/[^"'\s<>\\]+(?:embed|player|video\.g)[^"'\s<>\\]*/gi)) push(m[0], base);
    direct.push(...extractDirectVideosFromText(txt, base));
  };

  for (const b of BASES) {
    const candidates = [
      `${b}/episodios/${epSlug(slug, season, audioKey, num)}/`,
      `${b}/episodios/${epSlug(slug, season, audioKey, num)}`,
      `${b}/episodios/${epSlug(slug, 1, audioKey, num)}/`,
    ];
    for (const watch of candidates) {
      const res = await fetchText(watch, { referer: `${b}/animes/${slug}/`, cacheTtl: 0, timeout: 15000 });
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