import { $, apiUrl, cardHTML, skeletons, savedSource, saveSource } from './ui.js';

let source = savedSource();
let sourcesList = [];

async function boot() {
  const meta = await fetch(apiUrl('/api/sources')).then(r => r.json()).catch(() => null);
  sourcesList = meta?.sources || [];
  if (sourcesList.length) {
    const sel = document.createElement('select');
    sel.id = 'src';
    sel.innerHTML = sourcesList.map(s => `<option value="${s.id}" ${s.id === source ? 'selected' : ''}>${s.name}</option>`).join('');
    sel.onchange = () => {
      source = sel.value;
      saveSource(source);
      load();
    };
    $('#searchForm')?.prepend(sel);
  }
  load();
}

async function load() {
  if ($('#hero')) $('#hero').innerHTML = '';
  if ($('#rows')) $('#rows').innerHTML = `<div class="row"><div class="scroller">${skeletons(6)}</div></div>`;

  let data = await fetch(apiUrl(`/api/home?source=${encodeURIComponent(source)}`)).then(r => r.json()).catch(() => null);

  // Se a fonte escolhida vier vazia, tenta outras fontes automaticamente
  if (!data || (!data.sections?.length && !data.hero?.length)) {
    for (const s of sourcesList) {
      if (s.id === source) continue;
      const alt = await fetch(apiUrl(`/api/home?source=${encodeURIComponent(s.id)}`)).then(r => r.json()).catch(() => null);
      if (alt && (alt.sections?.length || alt.hero?.length)) {
        data = alt;
        source = s.id;
        saveSource(source);
        const sel = $('#src');
        if (sel) sel.value = source;
        break;
      }
    }
  }

  if (!data || (!data.sections?.length && !data.hero?.length)) {
    if ($('#rows')) $('#rows').innerHTML = `<div class="empty"><b>Nada carregado de ${source}</b>Tente outro servidor no seletor.</div>`;
    return;
  }

  renderHero(data.hero || []);
  if ($('#rows')) {
    $('#rows').innerHTML = (data.sections || []).map(sec => `
      <section class="row">
        <h2>${sec.title}</h2>
        <div class="scroller">${sec.items.map(i => cardHTML(i, source)).join('')}</div>
      </section>`).join('');
  }
}

function renderHero(items) {
  if (!items.length || !$('#hero')) return;
  let i = 0;
  const paint = () => {
    const a = items[i % items.length];
    const banner = a.banner || a.poster;
    $('#hero').innerHTML = `<section class="hero">
      ${banner ? `<img src="${apiUrl(`/img?u=${encodeURIComponent(banner)}`)}" alt="">` : ''}
      <div class="shade"></div>
      <div class="info">
        <span class="tag">Destaque</span>
        <h1>${a.title}</h1>
        <p>${[a.year, a.type, a.episodes ? `${a.episodes} episódios` : null].filter(Boolean).join(' • ')}</p>
        <a class="btn" href="detail.html?source=${encodeURIComponent(source)}&slug=${encodeURIComponent(a.slug)}">▶ Assistir agora</a>
      </div></section>`;
  };
  paint();
  clearInterval(window.__heroT);
  window.__heroT = setInterval(() => { i++; paint(); }, 6500);
}

$('#searchForm')?.addEventListener('submit', e => {
  e.preventDefault();
  const q = $('#q')?.value.trim();
  if (q) location.href = `search.html?q=${encodeURIComponent(q)}&source=${encodeURIComponent(source)}`;
});

boot();