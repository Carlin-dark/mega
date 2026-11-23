import { $, img } from './ui.js';

const p = new URLSearchParams(location.search);
const source = p.get('source') || 'animesonline';
const slug = p.get('slug');

async function boot() {
  $('#app').innerHTML = `<div class="detail"><div class="skel" style="aspect-ratio:2/3"></div><div><div class="skel" style="aspect-ratio:16/6"></div></div></div>`;
  if (!slug) return ($('#app').innerHTML = `<div class="empty"><b>Anime não informado</b></div>`);

  const a = await fetch(`/api/anime/${source}/${encodeURIComponent(slug)}`).then(r => r.json()).catch(() => null);
  if (!a || a.error) return ($('#app').innerHTML = `<div class="empty"><b>Falha ao carregar</b>${a?.error || ''}</div>`);

  document.title = `${a.title} — MEGA`;
  const seasons = a.seasons || [];
  $('#app').innerHTML = `<section class="detail">
    <div>
      <div class="poster">${img(a.poster, a.title)}</div>
    </div>
    <div>
      <h1>${a.title}</h1>
      <div class="chips">
        ${a.year ? `<span class="chip">${a.year}</span>` : ''}
        ${a.type ? `<span class="chip red">${a.type}</span>` : ''}
        ${a.status ? `<span class="chip">${a.status}</span>` : ''}
        ${a.score ? `<span class="chip">★ ${a.score}</span>` : ''}
        ${(a.genres || []).map(g => `<span class="chip">${g}</span>`).join('')}
      </div>
      <p class="syn">${a.synopsis || 'Sem sinopse.'}</p>
      ${seasons.length ? `<h3 style="margin-bottom:10px;font-size:15px">Episódios</h3>
      <div class="seasons" id="seasonTabs">
        ${seasons.map((s, i) => `<button data-i="${i}" class="${i === 0 ? 'on' : ''}">${s.title}</button>`).join('')}
      </div>
      <div class="eps" id="eps"></div>` : `<div class="empty"><b>Nenhum episódio</b>Esta fonte não expôs episódios.</div>`}
    </div>
  </section>`;

  const drawEps = i => {
    const s = seasons[i];
    $('#eps').innerHTML = (s?.episodes || []).map(e => {
      const q = new URLSearchParams({ source, slug, ep: e.id, n: e.number, audio: e.ids?.leg ? 'leg' : (e.audio?.[0] || 'leg') }).toString();
      return `<a href="/player.html?${q}">EP ${e.number}</a>`;
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
}

boot();