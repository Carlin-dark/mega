import { fetchText, UA_STRING } from './http.mjs';
import { decodeEntities } from './text.mjs';
import { extractBalanced } from './next.mjs';

const ITAG = {
  18: { quality: '360p', label: '360p', mime: 'video/mp4' },
  59: { quality: '480p', label: '480p', mime: 'video/mp4' },
  22: { quality: '720p', label: '720p', mime: 'video/mp4' },
  37: { quality: '1080p', label: '1080p', mime: 'video/mp4' },
};

const PLAYER_REFERERS = [
  'https://www.blogger.com/',
  'https://animesonline.blue/',
  'https://animefire.io/',
  'https://betteranime.net/',
];

export function expiresAtFrom(url) {
  const m = url.match(/[?&]expire=(\d+)/);
  if (m) return Number(m[1]) * 1000;
  const e = url.match(/[?&]e=(\d+)/);
  return e ? Number(e[1]) * 1000 : null;
}

function normalizeGooglevideo(raw) {
  let u = decodeEntities(raw).replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/\\$/g, '');
  if (u.startsWith('//')) u = 'https:' + u;
  if (u.startsWith('/')) u = 'https://' + u.slice(1);
  return u;
}

/** Extrai fontes de uma página que contenha streamingData (blogger/video.g). */
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
    const url = f.url || f.signatureCipher && null;
    if (!url) continue;
    const mime = (f.mimeType || 'video/mp4').split(';')[0];
    if (!mime.startsWith('video/')) continue;
    const itag = Number(f.itag);
    const known = ITAG[itag];
    const label = known?.label || (f.height ? `${f.height}p` : `itag ${itag}`);
    out.push({
      url: normalizeGooglevideo(url),
      quality: known?.quality || (f.height ? `${f.height}p` : String(itag)),
      label,
      mime,
      itag,
      progressive: Boolean(f.url) && !(data.adaptiveFormats || []).some(a => a.itag === f.itag),
      referer,
      expiresAt: expiresAtFrom(url),
    });
  }
  return out;
}

/** Resolve um iframe/player em fontes jogáveis. */
export async function resolvePlayer(rawUrl, referer) {
  let url;
  try { url = new URL(decodeEntities(rawUrl), referer).toString(); } catch { return []; }

  // Blogger / video.g
  if (/blogger\.com\/video\.g|video\.g\?token=/.test(url)) {
    const res = await fetchText(url, { referer: 'https://www.blogger.com/', timeout: 15_000 });
    return res.ok ? parseStreamingData(res.body, 'https://www.blogger.com/') : [];
  }

  // HLS
  if (/\.m3u8(\?|$)/i.test(url)) {
    return [{ url, quality: 'auto', label: 'Auto (HLS)', mime: 'application/x-mpegURL', hls: true, referer, expiresAt: null }];
  }

  // MP4 direto
  if (/\.mp4(\?|$)|videoplayback/i.test(url)) {
    return [{
      url: normalizeGooglevideo(url),
      quality: 'auto',
      label: 'Auto',
      mime: 'video/mp4',
      referer,
      expiresAt: expiresAtFrom(url),
    }];
  }

  // Player HTML genérico que embute arquivo/streamingData
  const page = await fetchText(url, { referer, timeout: 15_000 });
  if (!page.ok) return [];
  const found = parseStreamingData(page.body, url);
  if (found.length) return found;

  const mp4 = page.body.match(/https?:\/\/[^"'\s\\]+\.mp4[^"'\s\\]*/i);
  if (mp4) {
    return [{ url: normalizeGooglevideo(mp4[0]), quality: 'auto', label: 'Auto', mime: 'video/mp4', referer: url, expiresAt: expiresAtFrom(mp4[0]) }];
  }
  return [];
}

/** Resolve uma lista de iframes em fontes, deduplicadas e ordenadas por qualidade. */
export async function resolveStreams(iframes, referer) {
  const results = await Promise.all(
    iframes.slice(0, 4).map(u => resolvePlayer(u, referer).catch(() => []))
  );
  const flat = results.flat();
  const seen = new Set();
  const order = { '1080p': 4, '720p': 3, '480p': 2, '360p': 1, auto: 0 };
  return flat
    .filter(s => s.url && !seen.has(s.url) && seen.add(s.url))
    .sort((a, b) => (order[b.quality] ?? 0) - (order[a.quality] ?? 0));
}

export const PLAYER_REFERERS_LIST = PLAYER_REFERERS;
export const UA = UA_STRING;