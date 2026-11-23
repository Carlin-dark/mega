const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

import * as http from 'node:http';
import * as https from 'node:https';

http.globalAgent.keepAlive = true;
http.globalAgent.maxSockets = 50;
http.globalAgent.keepAliveMsecs = 10000;

https.globalAgent.keepAlive = true;
https.globalAgent.maxSockets = 50;
https.globalAgent.keepAliveMsecs = 10000;

const cache = new Map();
const DEFAULT_TTL = 30_000;

export function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.exp < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

export function cacheSet(key, value, ttl = DEFAULT_TTL) {
  if (cache.size > 900) cache.clear();
  cache.set(key, { value, exp: Date.now() + ttl });
  return value;
}

export function headersFor(url, referer, extra = {}) {
  let origin = '';
  try {
    if (referer) origin = new URL(referer).origin;
    else if (url) origin = new URL(url).origin;
  } catch {}

  return {
    'user-agent': UA,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'cache-control': 'no-cache',
    pragma: 'no-cache',
    'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': referer ? 'same-origin' : 'none',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
    ...(referer ? { referer } : {}),
    ...(origin ? { origin } : {}),
    ...extra,
  };
}

export async function fetchText(url, opts = {}) {
  const { referer, headers = {}, timeout = 20_000, retries = 1, cacheTtl = 0 } = opts;
  const key = `t:${url}`;
  if (cacheTtl) {
    const hit = cacheGet(key);
    if (hit) return hit;
  }
  let last = { ok: false, status: 0, url, body: '', headers: new Headers() };
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: 'follow',
        cache: 'no-store',
        headers: headersFor(url, referer, headers),
      });
      const body = await res.text();
      const out = { ok: res.ok, status: res.status, url: res.url, body, headers: res.headers };
      if (res.ok) {
        if (cacheTtl) cacheSet(key, out, cacheTtl);
        return out;
      }
      last = out;
      if (res.status < 400 || res.status >= 500) break;
    } catch (err) {
      last = { ok: false, status: 0, url, body: '', headers: new Headers(), error: err?.message };
    } finally {
      clearTimeout(timer);
    }
  }
  return last;
}

export async function fetchJson(url, opts = {}) {
  const res = await fetchText(url, {
    ...opts,
    headers: { accept: 'application/json,text/plain,*/*', ...(opts.headers || {}) },
  });
  if (!res.ok) return { ok: false, status: res.status, data: null };
  try {
    return { ok: true, status: res.status, data: JSON.parse(res.body) };
  } catch {
    return { ok: false, status: res.status, data: null };
  }
}

export const UA_STRING = UA;