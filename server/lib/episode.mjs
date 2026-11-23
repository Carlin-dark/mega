/* Resolução FRESCA de episódio via HTML bruto — Render free, sem navegador headless.
   Tokens/URLs do Blogger são temporários: nunca reaproveitamos página em cache. */
import { headersFor } from './http.mjs';
import {
  bloggerTokens,
  extractDirectVideosFromText,
  isAnimePageUrl,
  isJunkMedia,
  isBlockedEmbed,
  normalizeMediaUrl,
} from './stream.mjs';

const withCacheBust = (url) => {
  try {
    const u = new URL(url);
    u.searchParams.set('_t', String(Date.now()));
    return u.toString();
  } catch {
    return url;
  }
};

/* fetch leve do HTML atual da página do episódio */
export async function freshHtml(url, referer, timeout = 9000) {
  if (!url) return null;
  const target = withCacheBust(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(target, {
      signal: ctrl.signal,
      redirect: 'follow',
      cache: 'no-store',
      headers: headersFor(target, referer, {
        'cache-control': 'no-cache, no-store, must-revalidate',
        pragma: 'no-cache',
        'sec-fetch-dest': 'iframe',
      }),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const pushVideoTag = (out, seen, raw, base) => {
  const u = normalizeMediaUrl(raw, base);
  if (!u || seen.has(u)) return;
  if (isAnimePageUrl(u) || isJunkMedia(u) || isBlockedEmbed(u)) return;
  seen.add(u);
  const hls = /\.m3u8(\?|$)/i.test(u);
  out.push({
    url: u,
    quality: 'auto',
    label: hls ? 'Auto (HLS)' : 'Auto',
    mime: hls ? 'application/vnd.apple.mpegurl' : 'video/mp4',
    hls,
    itag: 0,
    referer: base || undefined,
    expiresAt: null,
  });
};

/* extrai blogger (prioritário) + streams diretos válidos; ignora lixo */
export function extractEpisodeSources(html, base) {
  const text = String(html || '');
  const blogger = [...new Set(
    bloggerTokens(text, base)
      .map((u) => normalizeMediaUrl(u, base))
      .filter(Boolean)
      .filter((u) => !isBlockedEmbed(u))
  )];

  const direct = [];
  const seen = new Set();

  for (const s of extractDirectVideosFromText(text, base)) {
    if (!s?.url || seen.has(s.url)) continue;
    if (isAnimePageUrl(s.url) || isJunkMedia(s.url) || isBlockedEmbed(s.url)) continue;
    seen.add(s.url);
    direct.push({ ...s, referer: s.referer || base || undefined });
  }

  for (const m of text.matchAll(/<video[^>]+src=["']([^"']+)["']/gi)) pushVideoTag(direct, seen, m[1], base);
  for (const m of text.matchAll(/<source[^>]+src=["']([^"']+)["']/gi)) pushVideoTag(direct, seen, m[1], base);

  return { blogger, direct };
}

/* URLs de página do episódio para tentar a resolução fresca */
export function episodeCandidates(base, slug, season, ep) {
  const b = String(base || '').replace(/\/+$/, '');
  if (!b) return [];
  const root = String(slug || '')
    .replace(/\/+$/, '')
    .replace(/-\d+-episodio-\d+$/i, '')
    .replace(/-episodio-\d+$/i, '');
  if (!root) return [];
  const s = Number(season) || 1;
  const n = Number(ep) || 1;
  const out = [];
  if (s > 1) out.push(`${b}/episodio/${root}-${s}-episodio-${n}/`);
  out.push(`${b}/episodio/${root}-episodio-${n}/`);
  return out;
}