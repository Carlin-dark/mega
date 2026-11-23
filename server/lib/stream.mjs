import { fetchText, UA_STRING } from './http.mjs';
import { decodeEntities } from './text.mjs';
import { extractBalanced } from './next.mjs';

const ITAG = {
  18: { quality: '360p', label: '360p', mime: 'video/mp4' },
  59: { quality: '480p', label: '480p', mime: 'video/mp4' },
  22: { quality: '720p', label: '720p', mime: 'video/mp4' },
  37: { quality: '1080p', label: '1080p', mime: 'video/mp4' },
};

export function isAnimePageUrl(url = '') {
  try {
    const u = new URL(url);
    if (/\/(anime|animes)\/[^/]+\/?$/i.test(u.pathname) && !u.searchParams.get('ep')) return true;
    return false;
  } catch {
    return /\/(anime|animes)\/[^/?#]+\/?$/i.test(String(url));
  }
}

export function isBlockedEmbed(url = '') {
  return /googletagmanager|doubleclick|facebook\.net|googlesyndication|adservice|analytics|hotjar|clarity/i.test(url);
}

export function expiresAtFrom(url = '') {
  const m = String(url).match(/[?&]expire=(\d+)/);
  if (m) return Number(m[1]) * 1000;
  const e = String(url).match(/[?&]e=(\d+)/);
  return e ? Number(e[1]) * 1000 : null;
}

export function normalizeMediaUrl(raw, base) {
  let u = decodeEntities(String(raw || ''))
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/')
    .replace(/\\$/g, '')
    .trim();
  if (!u) return null;
  if (u.startsWith('//')) u = 'https:' + u;
  try {
    return new URL(u, base).toString();
  } catch {
    return null;
  }
}

export function parseStreamingData(html, referer) {
  const idx = html.indexOf('"streamingData"');
  if (idx < 0) return [];
  const brace = html.indexOf('{', idx);
  const raw = extractBalanced(html, brace);
  if (!raw) return [];
  let data;
  try { data = JSON.parse(raw); } catch { return []; }
  const all = [...(data.formats || []), ...(data.adaptiveFormats || [])];
  const out = [];
  for (const f of all) {
    const norm = normalizeMediaUrl(f.url, referer);
    if (!norm) continue;
    const mime = (f.mimeType || 'video/mp4').split(';')[0];
    if (!mime.startsWith('video/')) continue;
    const itag = Number(f.itag);
    const known = ITAG[itag];
    out.push({
      url: norm,
      quality: known?.quality || (f.height ? `${f.height}p` : String(itag || 'auto')),
      label: known?.label || (f.height ? `${f.height}p` : `itag ${itag}`),
      mime,
      itag,
      progressive: Boolean(f.url) && !(data.adaptiveFormats || []).some((a) => a.itag === f.itag),
      referer,
      expiresAt: expiresAtFrom(norm),
    });
  }
  return out;
}

export function extractDirectVideosFromText(text = '', base = '') {
  const found = [];
  const patterns = [
    /https?:\/\/[^"'\s<>\\]+googlevideo\.com\/videoplayback[^"'\s<>\\]*/gi,
    /https?:\/\/[^"'\s<>\\]+aniplay\.online[^"'\s<>\\]+\.(?:mp4|m3u8)[^"'\s<>\\]*/gi,
    /https?:\/\/[^"'\s<>\\]+\.(?:mp4|m3u8)[^"'\s<>\\]*/gi,
  ];
  for (const re of patterns) {
    for (const m of String(text).matchAll(re)) {
      const norm = normalizeMediaUrl(m[0], base);
      if (!norm || isAnimePageUrl(norm)) continue;
      const isHls = /\.m3u8(\?|$)/i.test(norm);
      const itag = Number((norm.match(/[?&]itag=(\d+)/) || [])[1]) || 0;
      const known = ITAG[itag];
      found.push({
        url: norm,
        quality: known?.quality || 'auto',
        label: known?.label || (isHls ? 'Auto (HLS)' : 'Auto'),
        mime: isHls ? 'application/vnd.apple.mpegurl' : 'video/mp4',
        hls: isHls,
        itag,
        referer: base || undefined,
        expiresAt: expiresAtFrom(norm),
      });
    }
  }
  return found;
}

export async function resolvePlayer(rawUrl, referer) {
  const url = normalizeMediaUrl(rawUrl, referer);
  if (!url || isBlockedEmbed(url) || isAnimePageUrl(url)) return [];

  if (/blogger\.com\/video\.g|video\.g\?token=/.test(url)) {
    const res = await fetchText(url, { referer: 'https://www.blogger.com/', timeout: 15_000 });
    return res.ok ? parseStreamingData(res.body, 'https://www.blogger.com/') : [];
  }

  if (/\.m3u8(\?|$)/i.test(url)) {
    return [{
      url,
      quality: 'auto',
      label: 'Auto (HLS)',
      mime: 'application/vnd.apple.mpegurl',
      hls: true,
      referer,
      expiresAt: null,
    }];
  }

  if (/\.mp4(\?|$)|videoplayback/i.test(url)) {
    const itag = Number((url.match(/[?&]itag=(\d+)/) || [])[1]) || 0;
    const known = ITAG[itag];
    return [{
      url,
      quality: known?.quality || 'auto',
      label: known?.label || 'Auto',
      mime: 'video/mp4',
      itag,
      referer,
      expiresAt: expiresAtFrom(url),
    }];
  }

  const page = await fetchText(url, { referer, timeout: 15_000 });
  if (!page.ok) return [];

  const found = parseStreamingData(page.body, url);
  if (found.length) return found;

  return extractDirectVideosFromText(page.body, url);
}

export async function resolveStreams(iframes, referer) {
  const cleanIframes = (iframes || []).filter((u) => u && !isBlockedEmbed(u) && !isAnimePageUrl(u));
  const results = await Promise.all(
    cleanIframes.slice(0, 6).map((u) => resolvePlayer(u, referer).catch(() => []))
  );
  const flat = results.flat();
  const seen = new Set();
  const order = { '1080p': 4, '720p': 3, '480p': 2, '360p': 1, auto: 0 };
  return flat
    .filter((s) => s.url && !seen.has(s.url) && seen.add(s.url))
    .sort((a, b) => (order[b.quality] ?? 0) - (order[a.quality] ?? 0));
}

export const UA = UA_STRING;