import { $, apiUrl, skeletons } from './ui.js';

const y = new Date().getFullYear();
if ($('#year')) {
  $('#year').innerHTML = [y - 1, y, y + 1].map(n => `<option value="${n}" ${n === y ? 'selected' : ''}>${n}</option>`).join('');
}

async function load() {
  if (!$('#grid')) return;
  $('#grid').innerHTML = skeletons(8);
  const yearVal = $('#year')?.value || y;
  const seasonVal = $('#season')?.value || 'winter';
  const d = await fetch(apiUrl(`/api/seasons/${yearVal}/${seasonVal}`)).then(r => r.json()).catch(() => null);
  const items = d?.items || (Array.isArray(d) ? d : []);
  if (!items.length) {
    $('#grid').innerHTML = `<div class="empty"><b>Sem dados</b>Temporada vazia ou API indisponível.</div>`;
    return;
  }
  $('#grid').innerHTML = items.map(a => `
    <a class="card" href="search.html?q=${encodeURIComponent(a.title)}">
      <div class="ph">${a.poster || a.cover ? `<img loading="lazy" src="${apiUrl(`/img?u=${encodeURIComponent(a.poster || a.cover)}`)}" alt="">` : ''}</div>
      ${a.score ? `<span class="rate">★ ${a.score}</span>` : ''}
      <div class="meta"><b>${a.title}</b><small>${[a.year, a.type].filter(Boolean).join(' • ')}</small></div>
    </a>`).join('');
}

if ($('#season')) $('#season').onchange = load;
if ($('#year')) $('#year').onchange = load;
load();