import { fetchText, UA_STRING } from './http.mjs';
import { decodeEntities } from './text.mjs';
import { extractBalanced } from './next.mjs';

const ITAG = {
  18: { quality: '360p', label: '360p', mime: 'video/mp4' },
  59: { quality: '480p', label: '480p', mime: 'video/mp4' },
  22: { quality: '720p', label: '720p', mime: 'video/mp4' },
  37: { quality: '1080p', label: '1080p', mime: 'video/mp4' },
};

/* FIX: mídias de fundo/decoração da página não são episódio.
   bg.mp4, background, banner, poster, thumb, trailer, placeholder + assets de tema. */
const JUNK_RE = /(?:^|[/_\-.])(bg|background|banner|poster|thumb|thumbnail|trailer|placeholder|preview|sprite)(?:[-_.][\w-]+)?\.(?:mp4|webm|m4v|ogv)(?:[?#]|$)/i;
const ASSET_RE = /(?:\/wp-content\/|\/assets\/|\/static\/|\/tema\/|\/themes\/|\/img\/|\/images\/)[^?#]*\.(?:mp4|webm|m4v)(?:[?#]|$)/i;

export function isJunkMedia(url = '') {
  const u = String(url || '');
  if (!u) return true;
  if (/\/bg\.mp4/i.test(u)) return true;
  if (JUNK_RE.test(u)) return true;
  if (ASSET_RE.test(u)) return true;
  return false;
}

export function isAnimePageUrl(url = '') {
  try {
    const u = new URL(url);
    if (/\/oembed/i.test(u.pathname)) return true;
    if (/\/(anime|animes)\/[^/]+\/?$/i.test(u.pathname) && !u.searchParams.get('ep')) return true;
    return false;
  } catch {
    return /\/oembed|\/(anime|animes)\/[^/?#]+\/?$/i.test(String(url));
  }
}

export function isBlockedEmbed(url = '') {
  return /googletagmanager|doubleclick|facebook\.net|googlesyndication|adservice|analytics|hotjar|clarity/i.test(url);
}

export function isBloggerEmbed(url = '') {
  return /blogger\.com\/video\.g|video\.g\?token=/i.test(url);
}

export function expiresAtFrom(url = '') {
  const m = String(url).match(/[?&]expire=(\d+)/);
  if (m) return Number(m[1]) * 1000;
  const e = String(url).match(/[?&]e=(\d+)/);
  return e ? Number(e[1]) * 1000 : null;
}

export function normalizeMediaUrl(raw, base) {
  let u = decodeEntities(String(raw || ''))
    .replace(/\\u003c/gi, '<')
    .replace(/\\u003e/gi, '>')
    .replace(/\\u0026/g, '&')
    .replace(/\\"/g, '"')
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

function unwrapOEmbedText(text = '', base = '') {
  const trimmed = String(text || '').trim();
  if (!trimmed) return { html: '', embeds: [] };

  let decoded = trimmed
    .replace(/\\u003c/gi, '<')
    .replace(/\\u003e/gi, '>')
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/');

  const embeds = [];
  let innerHtml = decoded;

  if (decoded.startsWith('{') && /"html"\s*:/.test(decoded)) {
    try {
      const parsed = JSON.parse(decoded);
      if (parsed && typeof parsed.html === 'string') {
        innerHtml = decodeEntities(parsed.html).replace(/\\\//g, '/');
      }
    } catch {
      const m = decoded.match(/"html"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (m?.[1]) {
        try {
          innerHtml = decodeEntities(JSON.parse(`"${m[1]}"`)).replace(/\\\//g, '/');
        } catch {
          innerHtml = decodeEntities(m[1].replace(/\\"/g, '"').replace(/\\\//g, '/'));
        }
      }
    }
  }

  for (const m of innerHtml.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)) {
    const u = normalizeMediaUrl(m[1], base);
    if (u && !isBlockedEmbed(u) && !isAnimePageUrl(u)) embeds.push(u);
  }

  for (const m of innerHtml.matchAll(/data-secret=["']([^"']+)["'][\s\S]{0,400}?src=["']([^"']+)["']/gi)) {
    const u = normalizeMediaUrl(m[2], base);
    if (u && !isBlockedEmbed(u) && !isAnimePageUrl(u)) embeds.push(u);
  }

  for (const m of innerHtml.matchAll(/https?:\/\/[^"'\s<>\\]+\/embed\/[^"'\s<>\\]*/gi)) {
    const u = normalizeMediaUrl(m[0], base);
    if (u && !isBlockedEmbed(u) && !isAnimePageUrl(u)) embeds.push(u);
  }

  return { html: innerHtml, embeds };
}

export function parseStreamingData(html, referer) {
  const src = String(html || '')
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"')
    .replace(/&amp;/g, '&');

  const out = [];
  const pushFormat = (f) => {
    const norm = normalizeMediaUrl(f.url || f.src, referer);
    if (!norm) return;
    /* FIX: descarta bg.mp4 e mídias de tema */
    if (isJunkMedia(norm)) return;
    const mime = String(f.mimeType || f.mime || 'video/mp4').split(';')[0];
    if (!mime.startsWith('video/')) return;
    const itag = Number(f.itag) || Number((norm.match(/[?&]itag=(\d+)/) || [])[1]) || 0;
    const known = ITAG[itag];
    out.push({
      url: norm,
      quality: known?.quality || (f.height ? `${f.height}p` : 'auto'),
      label: known?.label || (f.height ? `${f.height}p` : `itag ${itag}`),
      mime,
      itag,
      progressive: Boolean(f.url) && !(f.adaptiveFormats || []).some((a) => a.itag === f.itag),
      referer,
      expiresAt: expiresAtFrom(norm),
    });
  };

  for (const marker of ['"streamingData"', 'streamingData:', '"adaptiveFormats"', 'VIDEO_CONFIG', '"formats"']) {
    const idx = src.indexOf(marker);
    if (idx < 0) continue;
    const brace = src.indexOf('{', idx);
    const raw = extractBalanced(src, brace);
    if (!raw) continue;
    try {
      const data = JSON.parse(raw);
      const all = [...(data.formats || []), ...(data.adaptiveFormats || []), ...(data.streamingData?.formats || []), ...(data.streamingData?.adaptiveFormats || [])];
      for (const f of all) pushFormat(f);
      if (out.length) break;
    } catch {}
  }

  if (!out.length) {
    for (const m of src.matchAll(/https?:\/\/[^"'\s<>\\]+videoplayback[^"'\s<>\\]*/g)) {
      pushFormat({ url: m[0] });
    }
  }

  return out;
}

export function extractDirectVideosFromText(text = '', base = '') {
  const found = [];
  const { html } = unwrapOEmbedText(text, base);
  const scanTarget = `${text}\n${html}`;
  const patterns = [
    /https?:\/\/[^"'\s<>\\]+googlevideo\.com\/videoplayback[^"'\s<>\\]*/gi,
    /https?:\/\/[^"'\s<>\\]+aniplay\.online[^"'\s<>\\]+\.(?:mp4|m3u8)[^"'\s<>\\]*/gi,
    /https?:\/\/[^"'\s<>\\]+\.(?:mp4|m3u8)[^"'\s<>\\]*/gi,
  ];
  for (const re of patterns) {
    for (const m of String(scanTarget).matchAll(re)) {
      const norm = normalizeMediaUrl(m[0], base);
      if (!norm || isAnimePageUrl(norm)) continue;
      /* FIX: bg.mp4 do site e assets de tema não entram como episódio */
      if (isJunkMedia(norm)) continue;
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

async function fetchBloggerPlayer(url, referer) {
  const variants = [url, `${url}${url.includes('?') ? '&' : '?'}hl=pt-BR`];
  const refs = [referer, 'https://www.blogger.com/', 'https://www.blogger.com', undefined];
  const clean = (u) => u && !isBlockedEmbed(u) && !isJunkMedia(u);

  for (const v of variants) {
    for (const r of refs) {
      const res = await fetchText(v, { referer: r, timeout: 15_000, retries: 0 });
      if (!res.ok || !res.body) continue;
      const parsed = parseStreamingData(res.body, 'https://www.blogger.com/');
      if (parsed.length) return parsed;
      const raw = extractDirectVideosFromText(res.body, 'https://www.blogger.com/').filter((s) => clean(s.url));
      if (raw.length) return raw;
    }
  }
  return [];
}

export async function resolvePlayer(rawUrl, referer, depth = 0) {
  const url = normalizeMediaUrl(rawUrl, referer);
  if (!url || isBlockedEmbed(url) || depth > 2) return [];

  if (/\/oembed|oembed/i.test(url)) {
    const res = await fetchText(url, { referer: referer || url, timeout: 15_000 });
    if (!res.ok || !res.body) return [];
    const direct = extractDirectVideosFromText(res.body, url);
    if (direct.length) return direct;
    const { html, embeds } = unwrapOEmbedText(res.body, url);
    const fromHtml = parseStreamingData(html, url).concat(extractDirectVideosFromText(html, url));
    if (fromHtml.length) return fromHtml;
    for (const emb of embeds) {
      const resolved = await resolvePlayer(emb, url, depth + 1);
      if (resolved.length) return resolved;
    }
    return [];
  }

  if (isAnimePageUrl(url)) return [];

  if (isBloggerEmbed(url)) {
    return fetchBloggerPlayer(url, referer);
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
    /* FIX: se for bg.mp4, não devolve nada para o caller seguir adiante */
    if (isJunkMedia(url)) return [];
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

  const unwrapped = unwrapOEmbedText(page.body, url);
  const found = parseStreamingData(unwrapped.html, url).concat(extractDirectVideosFromText(unwrapped.html, url));
  if (found.length) return found;

  for (const emb of unwrapped.embeds) {
    const resolved = await resolvePlayer(emb, url, depth + 1);
    if (resolved.length) return resolved;
  }

  return [];
}

export async function resolveStreams(iframes, referer) {
  const cleanIframes = (iframes || []).filter((u) => u && !isBlockedEmbed(u) && (!isAnimePageUrl(u) || /\/oembed/i.test(u)));
  /* FIX: blogger primeiro — é o embed que realmente toca quando não há vídeo direto */
  const ordered = [
    ...cleanIframes.filter((u) => isBloggerEmbed(u)),
    ...cleanIframes.filter((u) => !isBloggerEmbed(u)),
  ];
  const results = await Promise.all(
    ordered.slice(0, 6).map((u) => resolvePlayer(u, referer).catch(() => []))
  );
  const flat = results.flat().filter((s) => s.url && !isJunkMedia(s.url));
  const seen = new Set();
  const order = { '1080p': 4, '720p': 3, '480p': 2, '360p': 1, auto: 0 };
  return flat
    .filter((s) => !seen.has(s.url) && seen.add(s.url))
    .sort((a, b) => (order[b.quality] ?? 0) - (order[a.quality] ?? 0));
}

export const UA = UA_STRING;