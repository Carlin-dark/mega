import { $, apiUrl, img, savedSource, saveSource } from './ui.js';

const p = new URLSearchParams(location.search);
let source = p.get('source') || savedSource();
let slug = p.get('slug');
let allSources = [];

async function loadSources() {
  const meta = await fetch(apiUrl('/api/sources')).then(r => r.json()).catch(() => null);
  allSources = meta?.sources || [
    { id: 'animesonline', name: 'AnimesOnline' },
    { id: 'animefire', name: 'AnimeFire' },
    { id: 'betteranime', name: 'BetterAnime' },
    { id: 'animesroll', name: 'AnimesRoll' },
    { id: 'anitube', name: 'AniTube' },
  ];
}

async function fetchAnimeBySource(srcId, targetSlug) {
  return fetch(apiUrl(`/api/anime/${encodeURIComponent(targetSlug)}?source=${encodeURIComponent(srcId)}`))
    .then(r => r.json())
    .catch(() => null);
}

async function findSlugInSource(srcId, animeTitle) {
  if (!animeTitle) return null;
  const res = await fetch(apiUrl(`/api/search?q=${encodeURIComponent(animeTitle)}&source=${encodeURIComponent(srcId)}`))
    .then(r => r.json())
    .catch(() => null);
  const list = res?.results || [];
  if (!list.length) return null;
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const target = norm(animeTitle);
  const exact = list.find(i => norm(i.title) === target || norm(i.title).includes(target) || target.includes(norm(i.title)));
  return (exact || list[0]).slug;
}

async function boot() {
  await loadSources();
  if ($('#app')) {
    $('#app').innerHTML = `<div class="detail"><div class="skel" style="aspect-ratio:2/3"></div><div><div class="skel" style="aspect-ratio:16/6"></div></div></div>`;
  }
  if (!slug) {
    if ($('#app')) $('#app').innerHTML = `<div class="empty"><b>Anime não informado</b></div>`;
    return;
  }

  let a = await fetchAnimeBySource(source, slug);
  let loadedTitle = a?.title || '';

  $('#app').innerHTML = `<section class="detail">
    <div>
      <div class="poster">${a && !a.error ? img(a.poster, a.title) : ''}</div>
    </div>
    <div>
      <div style="margin-bottom:12px">
        <label style="display:block;font-size:12px;color:#8f8f9c;margin-bottom:6px">Servidor / Fonte (troque para testar em todos)</label>
        <div id="serverBar" style="display:flex;gap:8px;flex-wrap:wrap">
          ${allSources.map(s => `
            <button type="button" class="tag ${s.id === source ? 'on' : ''}" data-src="${s.id}">${s.name}</button>
          `).join('')}
        </div>
      </div>

      ${(!a || a.error) ? `
        <div class="empty"><b>Falha ao carregar neste servidor</b>${a?.error || 'Tente outro servidor acima.'}</div>
      ` : `
        <h1>${a.title}</h1>
        <div class="chips">
          ${a.year ? `<span class="chip">${a.year}</span>` : ''}
          ${a.type ? `<span class="chip red">${a.type}</span>` : ''}
          ${a.status ? `<span class="chip">${a.status}</span>` : ''}
          ${a.score ? `<span class="chip">★ ${a.score}</span>` : ''}
          ${(a.genres || []).map(g => `<span class="chip">${g}</span>`).join('')}
        </div>
        <p class="syn">${a.synopsis || 'Sem sinopse.'}</p>
        ${(a.seasons || []).length ? `
          <h3 style="margin-bottom:10px;font-size:15px">Episódios</h3>
          <div class="seasons" id="seasonTabs">
            ${a.seasons.map((s, i) => `<button type="button" data-i="${i}" class="${i === 0 ? 'on' : ''}">${s.title}</button>`).join('')}
          </div>
          <div class="eps" id="eps"></div>
        ` : `<div class="empty"><b>Nenhum episódio</b>Esta fonte não expôs episódios. Troque o servidor acima.</div>`}
      `}
    </div>
  </section>`;

  const seasons = a?.seasons || [];
  const drawEps = i => {
    const s = seasons[i];
    if (!$('#eps')) return;
    $('#eps').innerHTML = (s?.episodes || []).map(e => {
      const audioVal = e.ids?.leg ? 'leg' : (e.audio?.[0] || 'leg');
      const q = new URLSearchParams({
        source,
        slug,
        ep: e.id ?? e.number,
        n: e.number,
        season: s?.number || 1,
        audio: audioVal,
      }).toString();
      return `<a href="player.html?${q}">EP ${e.number}</a>`;
    }).join('') || `<div class="empty">Sem episódios nesta temporada.</div>`;
  };

  if (seasons.length) {
    drawEps(0);
    $('#seasonTabs').onclick = ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      [...$('#seasonTabs').children].forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      drawEps(Number(b.dataset.i));
    };
  }

  // Trocar servidor direto na tela de detalhes, buscando o mesmo anime no novo servidor se necessário
  $('#serverBar').onclick = async ev => {
    const btn = ev.target.closest('button[data-src]');
    if (!btn) return;
    const nextSrc = btn.dataset.src;
    if (nextSrc === source) return;

    source = nextSrc;
    saveSource(source);
    if ($('#app')) $('#app').innerHTML = `<div class="empty"><b>Trocando servidor para ${nextSrc}...</b></div>`;

    let nextData = await fetchAnimeBySource(source, slug);
    if ((!nextData || nextData.error) && loadedTitle) {
      const matchedSlug = await findSlugInSource(source, loadedTitle);
      if (matchedSlug) {
        slug = matchedSlug;
        nextData = await fetchAnimeBySource(source, slug);
      }
    }

    const url = new URL(location.href);
    url.searchParams.set('source', source);
    url.searchParams.set('slug', slug);
    history.replaceState(null, '', url.toString());
    boot();
  };
}

boot();