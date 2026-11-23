import { $, $$, apiUrl, skeletons, PLACEHOLDER, __coverFail } from './ui.js';

const NOW = new Date().getFullYear();
const MIN_YEAR = 2000;
const MAX_YEAR = 2030;
const SEASONS = ['winter', 'spring', 'summer', 'fall'];

/* FIX: fallback de capa imediato ao montar cards sem cover (consulta /api/external/poster) */
const posterFallbackCache = {};
async function getPosterFallback(title) {
  const clean = String(title || '').replace(/\b(dub\w*|leg\w*|temporada\w*|\d+ª?|eps?\.?\s*\d+)\b/gi, '').trim();
  if (!clean) return null;
  if (posterFallbackCache[clean]) return posterFallbackCache[clean];
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(apiUrl(`/api/external/poster?q=${encodeURIComponent(clean)}`), { signal: ctrl.signal });
    clearTimeout(t);
    if (r.ok) {
      const d = await r.json();
      if (d?.url) { posterFallbackCache[clean] = d.url; return d.url; }
    }
  } catch {}
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(apiUrl(`/api/search?q=${encodeURIComponent(clean)}`), { signal: ctrl.signal });
    clearTimeout(t);
    if (r.ok) {
      const d = await r.json();
      const results = Array.isArray(d) ? d : (d?.results || []);
      const nq = clean.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
      const match = results.find((i) => {
        const n = String(i.title || i.slug || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
        return n === nq || n.includes(nq) || nq.includes(n);
      });
      const url = match?.cover || match?.poster || match?.image || match?.thumb;
      if (url) { posterFallbackCache[clean] = url; return url; }
    }
  } catch {}
  return null;
}

/* injeta/atualiza a capa de um card já montado */
async function patchCover(imgEl, title) {
  if (!imgEl) return;
  const url = await getPosterFallback(title);
  if (url) {
    const proxy = apiUrl(`/img?u=${encodeURIComponent(url)}`);
    imgEl.src = proxy;
    imgEl.dataset.proxy = proxy;
    imgEl.dataset.title = title;
  } else {
    imgEl.src = PLACEHOLDER;
  }
}

let year = Math.min(MAX_YEAR, Math.max(MIN_YEAR, NOW));
let season = currentSeason();
let reqId = 0;

function currentSeason() {
  const m = new Date().getMonth();
  if (m <= 1 || m === 11) return 'winter';
  if (m <= 4) return 'spring';
  if (m <= 7) return 'summer';
  return 'fall';
}

/* ---------- seletor de ano (modal) ---------- */
function buildYearPicker() {
  const grid = $('#yearpick-grid');
  if (!grid) return;
  for (let y = MAX_YEAR; y >= MIN_YEAR; y--) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'yearpick-i';
    b.textContent = y;
    b.dataset.y = String(y);
    b.onclick = () => {
      year = y;
      syncYear();
      $('#yearpick')?.classList.remove('on');
      load();
    };
    grid.appendChild(b);
  }
  $('#yearpick-btn')?.addEventListener('click', () => {
    $('#yearpick')?.classList.toggle('on');
    syncYear();
  });
  $('#yearpick-x')?.addEventListener('click', () => $('#yearpick')?.classList.remove('on'));
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.yearpick-wrap')) $('#yearpick')?.classList.remove('on');
  });
}

function syncYear() {
  const lbl = $('#yearpick-label');
  if (lbl) lbl.textContent = year;
  $$('#yearpick-grid .yearpick-i').forEach((b) => b.classList.toggle('on', b.dataset.y === String(year)));
}

function syncSeason() {
  $$('.cal-s').forEach((b) => b.classList.toggle('on', b.dataset.s === season));
}

/* ---------- dados ---------- */
function normalize(payload) {
  // FIX: a API devolve array puro em /api/seasons/:ano/:temporada; antes o código
  // só olhava payload.items e por isso a grade ficava sempre vazia.
  const raw = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.data)
        ? payload.data
        : [];
  return raw
    .filter((a) => a && (a.title || a.slug))
    .map((a) => ({
      title: a.title || a.slug,
      slug: a.slug || null,
      poster: a.poster || a.cover || a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || null,
      score: a.score || null,
      type: a.type || null,
      year: a.year || year,
    }));
}

async function fetchJson(url, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { accept: 'application/json' }, signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function load() {
  if (!$('#grid')) return;
  const id = ++reqId;
  $('#grid').innerHTML = skeletons(8);

  // 1) backend (Jikan via proxy + catálogo como fallback) 2) catálogo local filtrado
  let items = normalize(await fetchJson(apiUrl(`/api/seasons/${year}/${season}`)));
  if (!items.length) {
    const home = normalize(await fetchJson(apiUrl(`/api/home`), 9000));
    items = home.filter((a) => !a.year || String(a.year) === String(year));
    if (!items.length) items = home;
  }

  if (id !== reqId) return;

  if (!items.length) {
    $('#grid').innerHTML = `<div class="empty"><b>Nenhum anime encontrado</b>Temporada ${season.toUpperCase()} / ${year} sem dados. <button type="button" class="btn dark" id="cal-retry">Tentar novamente</button></div>`;
    $('#cal-retry')?.addEventListener('click', load);
    return;
  }

  const frag = document.createDocumentFragment();
  items.forEach((a) => {
    const href = a.slug
      ? `detail.html?source=animesonline&slug=${encodeURIComponent(a.slug)}`
      : `search.html?q=${encodeURIComponent(a.title)}`;
    const src = a.poster || a.cover || a.image || a.thumb || a.thumbnail;
    const coverUrl = src ? apiUrl(`/img?u=${encodeURIComponent(src)}`) : '';
    const titleEsc = String(a.title || '').replace(/"/g, '&quot;');
    const wrap = document.createElement('div');
    wrap.innerHTML = `<a class="card" href="${href}">
      <div class="ph">${coverUrl ? `<img loading="lazy" src="${coverUrl}" alt="${titleEsc}" data-proxy="${coverUrl}" data-title="${titleEsc}" decoding="async" referrerpolicy="no-referrer" onerror="__coverFail(this)">` : `<img loading="lazy" alt="${titleEsc}" data-title="${titleEsc}" decoding="async" referrerpolicy="no-referrer" onerror="__coverFail(this)">`}</div>
      ${a.score ? `<span class="rate">★ ${Number(a.score).toFixed(1)}</span>` : ''}
      <div class="meta"><b>${a.title}</b><small>${[a.year, a.type].filter(Boolean).join(' • ')}</small></div>
    </a>`;
    const cardEl = wrap.firstElementChild;
    const imgEl = cardEl.querySelector('img');
    /* FIX: se não veio capa do backend, consulta /api/external/poster imediatamente */
    if (!src && imgEl) patchCover(imgEl, a.title);
    frag.appendChild(cardEl);
  });
  $('#grid').innerHTML = '';
  $('#grid').appendChild(frag);
}

/* ---------- boot ---------- */
buildYearPicker();
syncYear();
syncSeason();
$$('.cal-s').forEach((b) => (b.onclick = () => {
  season = b.dataset.s;
  syncSeason();
  load();
}));
load();