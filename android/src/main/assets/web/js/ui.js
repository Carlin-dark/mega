export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export function savedSource() { return localStorage.getItem('mega:source') || 'animesonlinecc'; }

const RAW_BASE = typeof window !== 'undefined' && window.API_BASE ? String(window.API_BASE).trim() : '';
export const API_BASE = RAW_BASE.replace(/\/+$/, '');

export function apiUrl(path = '') {
  const cleanPath = String(path || '').startsWith('/') ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${cleanPath}` : cleanPath;
}

export const img = (u, alt = '') =>
  u ? `<img loading="lazy" src="${apiUrl(`/img?u=${encodeURIComponent(u)}`)}" alt="${String(alt || '').replace(/"/g, '&quot;')}">` : '';

export function cardHTML(item, source) {
  const src = item.source || source || savedSource();
  const q = new URLSearchParams({ source: src, slug: item.slug }).toString();
  return `<a class="card" href="detail.html?${q}">
    <div class="ph">${img(item.poster || item.cover, item.title)}</div>
    ${item.type ? `<span class="badge">${item.type[0]}</span>` : ''}
    ${item.score ? `<span class="rate">★ ${Number(item.score).toFixed(1)}</span>` : ''}
    <div class="meta"><b>${item.title}</b>
      <small>${[item.year, item.episodes ? `${item.episodes} eps` : null].filter(Boolean).join(' • ')}</small>
    </div>
  </a>`;
}

export const skeletons = n =>
  Array.from({ length: n }, () => `<div class="skel"></div>`).join('');

export function savedSource() { return localStorage.getItem('mega:source') || 'animesonline'; }
export function saveSource(s) { localStorage.setItem('mega:source', s); }