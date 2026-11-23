const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const cache = new Map();
const DEFAULT_TTL = 60_000;

export function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.exp < Date.now()) { cache.delete(key); return null; }
  return hit.value;
}

export function cacheSet(key, value, ttl = DEFAULT_TTL) {
  if (cache.size > 900) cache.clear();
  cache.set(key, { value, exp: Date.now() + ttl });
  return value;
}

export async function fetchText(url, opts = {}) {
  const { referer, headers = {}, timeout = 20_000, retries = 1, cacheTtl = 0 } = opts;
  const key = `t:${url}`;
  if (cacheTtl) {
    const hit = cacheGet(key);
    if (hit) return hit;
  }
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: 'follow',
        headers: {
          'user-agent': UA,
          accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
          'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.7',
          ...(referer ? { referer } : {}),
          ...headers,
        },
      });
      const body = await res.text();
      const out = { ok: res.ok, status: res.status, url: res.url, body, headers: res.headers };
      if (cacheTtl && res.ok) cacheSet(key, out, cacheTtl);
      return out;
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, status: 0, url, body: '', headers: new Headers(), error: lastErr?.message };
}

export async function fetchJson(url, opts = {}) {
  const res = await fetchText(url, {
    ...opts,
    headers: { accept: 'application/json', ...(opts.headers || {}) },
  });
  if (!res.ok) return { ok: false, status: res.status, data: null };
  try {
    return { ok: true, status: res.status, data: JSON.parse(res.body) };
  } catch {
    return { ok: false, status: res.status, data: null };
  }
}

export const UA_STRING = UA;