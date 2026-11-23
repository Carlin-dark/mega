import { fetchJson } from '../lib/http.mjs';

const BASE = 'https://api.jikan.moe/v4';
const SEASONS = ['winter', 'spring', 'summer', 'fall'];
const PT = { winter: 'Inverno', spring: 'Primavera', summer: 'Verão', fall: 'Outono' };

const map = a => ({
  malId: a.mal_id,
  title: a.title_english || a.title,
  poster: a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || null,
  score: a.score,
  year: a.year,
  type: a.type,
  episodes: a.episodes,
});

export async function season(year, season) {
  const res = await fetchJson(`${BASE}/seasons/${year}/${season}?limit=24&sfw=true`);
  if (!res.ok || !res.data) return { year, season, title: PT[season], items: [] };
  return {
    year,
    season,
    title: `${PT[season]} ${year}`,
    items: (res.data.data || []).map(map),
  };
}

export async function now() {
  const res = await fetchJson(`${BASE}/seasons/now?limit=24&sfw=true`);
  if (!res.ok || !res.data) return { title: 'Temporada atual', items: [] };
  return { title: 'Temporada atual', items: (res.data.data || []).map(map) };
}

export const seasons = SEASONS;
export default { season, now, seasons };