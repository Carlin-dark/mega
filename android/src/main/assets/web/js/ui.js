export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export function savedSource() { return localStorage.getItem('mega:source') || 'animesonlinecc'; }

const RAW_BASE = typeof window !== 'undefined' && window.API_BASE ? String(window.API_BASE).trim() : '';
export const API_BASE = RAW_BASE.replace(/\/+$/, '');

export function apiUrl(path = '') {
  const cleanPath = String(path || '').startsWith('/') ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${cleanPath}` : cleanPath;
}

export const PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450"><rect width="300" height="450" fill="#15151c"/><text x="150" y="230" fill="#5a5a6a" font-family="sans-serif" font-size="18" text-anchor="middle">Sem capa</text></svg>');

export function __coverFail(im) {
  if (!im || im.dataset.dead) return;
  im.dataset.dead = '1';
  const proxy = im.dataset.proxy || '';
  if (proxy && im.src !== proxy) { im.src = proxy; return; }
  im.src = PLACEHOLDER;
}

export const img = (u, alt = '') =>
  u
    ? `<img loading="lazy" decoding="async" referrerpolicy="no-referrer" src="${apiUrl(`/img?u=${encodeURIComponent(u)}`)}" data-proxy="${apiUrl(`/img?u=${encodeURIComponent(u)}`)}" data-title="${String(alt || '').replace(/"/g, '&quot;')}" alt="${String(alt || '').replace(/"/g, '&quot;')}" onerror="__coverFail(this)">`
    : '';

export function cardHTML(item, source) {
  const src = item.source || source || savedSource();
  const q = new URLSearchParams({ source: src, slug: item.slug }).toString();
  const cover = item.poster || item.cover || item.image || item.thumb || item.thumbnail || null;
  return `<a class="card" href="detail.html?${q}">
    <div class="ph">${img(cover, item.title)}</div>
    ${item.type ? `<span class="badge">${item.type[0]}</span>` : ''}
    ${item.score ? `<span class="rate">★ ${Number(item.score).toFixed(1)}</span>` : ''}
    <div class="meta"><b>${item.title}</b>
      <small>${[item.year, item.episodes ? `${item.episodes} eps` : null].filter(Boolean).join(' • ')}</small>
    </div>
  </a>`;
}

export const skeletons = n =>
  Array.from({ length: n }, () => `<div class="skel"></div>`).join('');

export function saveSource(s) { localStorage.setItem('mega:source', s); }