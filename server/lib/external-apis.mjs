import { fetchJson, fetchText } from './http.mjs';

const TIMEOUT_MS = 8000;

async function withTimeout(promise, ms = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await promise;
  } finally {
    clearTimeout(t);
  }
}

function norm(item) {
  if (!item) return null;
  return {
    title: item.title || null,
    cover: item.cover || item.poster || item.image || item.thumb || item.thumbnail || null,
    poster: item.poster || item.cover || item.image || item.thumb || item.thumbnail || null,
    year: item.year || null,
    score: item.score || null,
    synopsis: item.synopsis || null,
    type: item.type || null,
    episodes: item.episodes || null,
    source: item.source || null,
  };
}

/* ---------- AniList (GraphQL) ---------- */
export async function anilistSearch(title) {
  try {
    const query = `query($search: String){ Media(search:$search, type:ANIME) { title { romaji english } coverImage { large medium } averageScore episodes season year description(asHtml:false) } }`;
    const res = await withTimeout(fetchJson('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query, variables: { search: title } })
    }), TIMEOUT_MS);
    if (!res.ok || !res.data) return null;
    const m = res.data.Media;
    if (!m) return null;
    return norm({
      title: m.title?.english || m.title?.romaji || title,
      cover: m.coverImage?.large || m.coverImage?.medium || null,
      year: m.year || null,
      score: m.averageScore ? Number(m.averageScore) / 10 : null,
      episodes: m.episodes || null,
      season: m.season || null,
      synopsis: m.description || null,
      source: 'anilist',
    });
  } catch { return null; }
}

/* ---------- Jikan (REST v4) ---------- */
export async function jikanSearch(title) {
  try {
    const res = await withTimeout(fetchJson(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1&sfw`), TIMEOUT_MS);
    if (!res.ok || !res.data || !res.data.data?.[0]) return null;
    const m = res.data.data[0];
    return norm({
      title: m.title_english || m.title || title,
      cover: m.images?.jpg?.large_image_url || m.images?.jpg?.image_url || null,
      year: m.year || null,
      score: m.score || null,
      episodes: m.episodes || null,
      type: m.type || null,
      synopsis: m.synopsis || null,
      source: 'jikan',
    });
  } catch { return null; }
}

/* ---------- Kitsu ---------- */
export async function kitsuSearch(title) {
  try {
    const res = await withTimeout(fetchJson(`https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(title)}&page[limit]=1`), TIMEOUT_MS);
    if (!res.ok || !res.data || !res.data[0]) return null;
    const m = res.data[0];
    const attrs = m.attributes || {};
    return norm({
      title: attrs.canonicalTitle || attrs.titles?.en || attrs.titles?.en_jp || title,
      cover: attrs.posterImage?.large || attrs.posterImage?.medium || attrs.posterImage?.small || null,
      year: attrs.startDate ? String(attrs.startDate).slice(0, 4) : null,
      score: attrs.averageRating ? Number(attrs.averageRating) / 20 : null,
      episodes: attrs.episodeCount || null,
      type: attrs.subtype || null,
      synopsis: attrs.synopsis || null,
      source: 'kitsu',
    });
  } catch { return null; }
}

/* ---------- Anime News Network Encyclopedia ---------- */
export async function annSearch(title) {
  try {
    const res = await withTimeout(fetchText(`https://cdn.animenewsnetwork.com/encyclopedia/api.xml?anime=${encodeURIComponent(title)}`), TIMEOUT_MS);
    if (!res.ok || !res.body) return null;
    const idMatch = res.body.match(/<anime id="(\d+)"/);
    if (!idMatch) return null;
    const id = idMatch[1];
    const infoRes = await withTimeout(fetchText(`https://cdn.animenewsnetwork.com/encyclopedia/api.xml?anime=${id}`), TIMEOUT_MS);
    if (!infoRes.ok || !infoRes.body) return null;
    const coverMatch = infoRes.body.match(/<img src="([^"]+)"[^>]*>/);
    const titleMatch = infoRes.body.match(/<title>([^<]+)<\/title>/);
    const yearMatch = infoRes.body.match(/<year>(\d+)<\/year>/);
    return norm({
      title: titleMatch?.[1] || title,
      cover: coverMatch?.[1] || null,
      year: yearMatch?.[1] || null,
      source: 'ann',
    });
  } catch { return null; }
}

/* ---------- Cascata: tenta todas em paralelo, retorna a primeira com cover válido ---------- */
export async function fetchExternalAnime(title) {
  if (!title) return null;
  const settled = await Promise.allSettled([
    anilistSearch(title),
    jikanSearch(title),
    kitsuSearch(title),
    annSearch(title),
  ]);
  const results = settled
    .filter(s => s.status === 'fulfilled' && s.value)
    .map(s => s.value);
  const withCover = results.find(r => r.cover);
  if (withCover) return withCover;
  return results[0] || null;
}
