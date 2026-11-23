import { $, cardHTML, skeletons, savedSource, saveSource } from './ui.js';

let source = savedSource();

async function boot() {
  const meta = await fetch('/api/sources').then(r => r.json()).catch(() => null);
  if (meta?.sources?.length) {
    const sel = document.createElement('select');
    sel.id = 'src';
    sel.innerHTML = meta.sources.map(s => `<option value="${s.id}" ${s.id === source ? 'selected' : ''}>${s.name}</option>`).join('');
    sel.onchange = () => { source = sel.value; saveSource(source); load(); };
    $('#searchForm').prepend(sel);
  }
  load();
}

async function load() {
  $('#hero').innerHTML = '';
  $('#rows').innerHTML = `<div class="row"><div class="scroller">${skeletons(6)}</div></div>`;

  const data = await fetch(`/api/home/${source}`).then(r => r.json()).catch(() => null);

  if (!data || (!data.sections?.length && !data.hero?.length)) {
    $('#rows').innerHTML = `<div class="empty"><b>Nada carregado de ${source}</b>Tente outra fonte no seletor acima.</div>`;
    return;
  }

  renderHero(data.hero || []);
  $('#rows').innerHTML = (data.sections || []).map(sec => `
    <section class="row">
      <h2>${sec.title}</h2>
      <div class="scroller">${sec.items.map(i => cardHTML(i, source)).join('')}</div>
    </section>`).join('');
}

function renderHero(items) {
  if (!items.length) return;
  let i = 0;
  const paint = () => {
    const a = items[i % items.length];
    $('#hero').innerHTML = `<section class="hero">
      ${a.banner || a.poster ? `<img src="/img?u=${encodeURIComponent(a.banner || a.poster)}" alt="">` : ''}
      <div class="shade"></div>
      <div class="info">
        <span class="tag">Destaque</span>
        <h1>${a.title}</h1>
        <p>${[a.year, a.type, a.episodes ? `${a.episodes} episódios` : null].filter(Boolean).join(' • ')}</p>
        <a class="btn" href="/detail.html?source=${source}&slug=${encodeURIComponent(a.slug)}">▶ Assistir agora</a>
      </div></section>`;
  };
  paint();
  clearInterval(window.__heroT);
  window.__heroT = setInterval(() => { i++; paint(); }, 6500);
}

$('#searchForm').addEventListener('submit', e => {
  e.preventDefault();
  const q = $('#q').value.trim();
  if (q) location.href = `/search.html?q=${encodeURIComponent(q)}&source=${source}`;
});

boot();