const BASE = 'https://animesonline.blue';

const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  'accept': 'text/html,application/json;q=0.9,*/*;q=0.8',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
  'referer': BASE + '/'
};
export const HEADERS_UA = HEADERS['user-agent'];

const QUALITY = { '18': '360p', '59': '480p', '22': '720p', '37': '1080p' };
const cache = new Map();
const TTL = 60_000;

export const abs = (u) => (!u ? '' : u.startsWith('http') ? u : BASE + u);

export function decodeNextImage(src = '') {
  try {
    const u = new URL(abs(src));
    const inner = u.searchParams.get('url');
    return inner ? decodeURIComponent(inner) : abs(src);
  } catch { return src; }
}

const unescapeRsc = (s) =>
  s.replace(/\\"/g, '"').replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/\\\\/g, '\\');

async function get(url, { json = false, ttl = 0 } = {}) {
  if (ttl && cache.has(url)) {
    const hit = cache.get(url);
    if (Date.now() - hit.t < ttl) return hit.v;
  }
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
      const body = json ? await res.json() : await res.text();
      if (ttl) cache.set(url, { t: Date.now(), v: body });
      return body;
    } catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 400 * (i + 1))); }
  }
  throw lastErr;
}

/* ---------- parser JSON com controle de string ---------- */
export function extractJson(html, key) {
  const text = unescapeRsc(html);
  const m = new RegExp(`"${key}"\\s*:\\s*`).exec(text);
  if (!m) return null;
  const start = text.indexOf('{', m.index + m[0].length);
  if (start < 0) return null;

  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

/* ---------- cards ---------- */
const CARD_RE = /<a[^>]+href="(?:https:\/\/animesonline\.blue)?\/anime\/([^"?#]+)"[^>]*>[\s\S]{0,600}?<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"/g;

export function parseCards(html) {
  const seen = new Set(), out = [];
  for (const [, slug, img, title] of html.matchAll(CARD_RE)) {
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, title: title.trim(), cover: decodeNextImage(img) });
  }
  return out;
}

/* ---------- episódios: JSON e fallback DOM ---------- */
const SEASON_BTN_RE = /title="Temporada\s+(\d+)/g;
const EP_BTN_RE = /title="Episódio\s+(\d+)"[^>]*>\s*(\d+)\s*</g;
const DUR_RE = /Assistindo:[\s\S]{0,80}?(\d{2}:\d{2})/;

function seasonsFromDom(html) {
  const nums = new Set([1]);
  for (const [, n] of html.matchAll(SEASON_BTN_RE)) nums.add(+n);
  return [...nums].sort((a, b) => a - b);
}

async function episodesFromDom(slug, season) {
  const html = await get(`${BASE}/anime/${encodeURIComponent(slug)}?ep=1&t=${season}`);
  const dur = DUR_RE.exec(html)?.[1] || '';
  const out = [];
  const seen = new Set();
  for (const [, n] of html.matchAll(EP_BTN_RE)) {
    const num = +n;
    if (seen.has(num)) continue;
    seen.add(num);
    out.push({ number: num, duration: num === 1 ? dur : '' });
  }
  return out;
}

export async function parseAnime(slug) {
  const html = await get(`${BASE}/anime/${encodeURIComponent(slug)}`, { ttl: TTL });
  const a = extractJson(html, 'anime') || {};
  const serie = extractJson(html, 'serie') || {};
  const title = a.title || (/<h1[^>]*>([^<]+)</.exec(html)?.[1] || slug).trim();

  let seasons = (serie.temporadas || []).map(t => ({
    season: t.numero,
    name: t.nome || '',
    episodes: (t.eps || []).flatMap(e =>
      ['leg', 'dub'].filter(k => e[k]).map(k => ({
        number: e.num, audio: k, id: e[k].id, duration: e[k].tempo || '', thumb: abs(e[k].capa || '')
      })))
  }));

  // fallback: se o payload veio vazio, lê os botões do DOM por temporada
  if (!seasons.some(s => s.episodes.length)) {
    seasons = [];
    for (const n of seasonsFromDom(html)) {
      const eps = await episodesFromDom(slug, n);
      seasons.push({
        season: n, name: '',
        episodes: eps.flatMap(e => (a.audios || ['leg']).map(k => ({
          number: e.number, audio: k, id: 0, duration: e.duration, thumb: ''
        })))
      });
    }
  }

  return {
    slug: a.slug || slug,
    title,
    cover: abs(a.cover || ''),
    type: a.tipo || '',
    audios: a.audios || ['leg'],
    year: a.year || (/•\s*(\d{4})/.exec(html)?.[1] || ''),
    episodeCount: seasons.reduce((n, s) => n + s.episodes.length, 0),
    synopsis: a.synopsis || '',
    genres: (a.genres || []).map(g => g.name),
    seasons: seasons.filter(s => s.episodes.length)
  };
}

/* ---------- semelhantes ---------- */
export async function similar(slug) {
  const html = await get(`${BASE}/anime/${encodeURIComponent(slug)}`, { ttl: TTL });
  const i = html.indexOf('Você também pode gostar');
  const block = i > -1 ? html.slice(i, i + 30_000) : html;
  return parseCards(block).filter(a => a.slug !== slug).slice(0, 18);
}

/* ---------- player ---------- */
const IFRAME_RE = /src="(https:\/\/www\.blogger\.com\/video\.g\?token=[^"]+)"/;
const MP4_RE = /videoplayback\?[^"\\]+/g;
const ITAG_RE = /[?&]itag=(\d+)/;

export async function getStreams(slug, ep, season = 1, audio = 'leg') {
  const watch = `${BASE}/anime/${encodeURIComponent(slug)}?ep=${ep}&t=${season}${audio === 'dub' ? '&audio=dub' : ''}`;
  const html = await get(watch);
  const iframe = IFRAME_RE.exec(html)?.[1] || null;
  const streams = [];
  if (iframe) {
    const player = await get(iframe);
    const seen = new Set();
    for (const raw of player.matchAll(MP4_RE)) {
      const url = ('https://' + raw[0].replace(/\\u0026/g, '&')).replace(/[,)\\]+$/, '');
      const itag = ITAG_RE.exec(url)?.[1] || '';
      if (seen.has(itag)) continue;
      seen.add(itag);
      streams.push({ url, itag, quality: QUALITY[itag] || itag, mime: 'video/mp4' });
    }
  }
  return { iframe, streams: streams.sort((a, b) => (+a.itag) - (+b.itag)) };
}

/* ---------- listas ---------- */
export const home = async () => parseCards(await get(BASE + '/', { ttl: TTL }));
export const catalog = async (page = 1) => parseCards(await get(`${BASE}/animes?page=${page}`, { ttl: TTL }));
export const byLetter = async (l) => parseCards(await get(`${BASE}/letra/${l}`, { ttl: TTL }));
export const byGenre = async (g) => parseCards(await get(`${BASE}/genero/${encodeURIComponent(g)}`, { ttl: TTL }));

export async function search(q) {
  const data = await get(`${BASE}/api/search?q=${encodeURIComponent(q)}`, { json: true, ttl: 30_000 });
  return (data.results || []).map(r => ({ slug: r.slug, title: r.title, cover: abs(r.cover), year: r.year, type: r.tipo, audios: r.audios }));
}

/* ---------- temporadas (Jikan) ---------- */
const JIKAN = 'https://api.jikan.moe/v4';

export async function season(year, seasonName) {
  const data = await get(`${JIKAN}/seasons/${year}/${seasonName}?limit=24&sfw`, { json: true, ttl: 6 * 3600_000 });
  return (data.data || []).map(m => ({
    malId: m.mal_id,
    title: m.title_english || m.title,
    cover: m.images?.jpg?.large_image_url || '',
    year: m.year || '',
    score: m.score || 0,
    type: m.type || ''
  }));
}

export async function seasonNow() {
  const data = await get(`${JIKAN}/seasons/now?limit=24&sfw`, { json: true, ttl: 3600_000 });
  return (data.data || []).map(m => ({
    malId: m.mal_id, title: m.title_english || m.title,
    cover: m.images?.jpg?.large_image_url || '', year: m.year || '', score: m.score || 0, type: m.type || ''
  }));
}

/* ---------- personagens (AniList) ---------- */
export async function characters(title) {
  const q = `query($s:String){Media(search:$s,type:ANIME){characters(perPage:12,sort:ROLE){nodes{name{full}image{large}}}}}`;
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: q, variables: { s: title } })
  });
  if (!res.ok) return [];
  const json = await res.json();
  return (json.data?.Media?.characters?.nodes || []).map(c => ({ name: c.name.full, image: c.image.large }));
}