export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const img = (u, alt = '') =>
  u ? `<img loading="lazy" src="/img?u=${encodeURIComponent(u)}" alt="${alt.replace(/"/g, '&quot;')}">` : '';

export function cardHTML(item, source) {
  const q = new URLSearchParams({ source, slug: item.slug }).toString();
  return `<a class="card" href="/detail.html?${q}">
    <div class="ph">${img(item.poster, item.title)}</div>
    ${item.type ? `<span class="badge">${item.type[0]}</span>` : ''}
    ${item.score ? `<span class="rate">★ ${item.score.toFixed(1)}</span>` : ''}
    <div class="meta"><b>${item.title}</b>
      <small>${[item.year, item.episodes ? `${item.episodes} eps` : null].filter(Boolean).join(' • ')}</small>
    </div>
  </a>`;
}

export const skeletons = n =>
  Array.from({ length: n }, () => `<div class="skel"></div>`).join('');

export function savedSource() { return localStorage.getItem('mega:source') || 'animesonline'; }
export function saveSource(s) { localStorage.setItem('mega:source', s); }