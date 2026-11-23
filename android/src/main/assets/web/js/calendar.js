import { $, skeletons } from './ui.js';

const y = new Date().getFullYear();
$('#year').innerHTML = [y - 1, y, y + 1].map(n => `<option value="${n}" ${n === y ? 'selected' : ''}>${n}</option>`).join('');

async function load() {
  $('#grid').innerHTML = skeletons(8);
  const d = await fetch(`/api/seasons/${$('#year').value}/${$('#season').value}`).then(r => r.json()).catch(() => null);
  if (!d?.items?.length) return ($('#grid').outerHTML = `<div class="empty"><b>Sem dados</b>Temporada vazia ou API indisponível.</div>`);
  $('#grid').innerHTML = d.items.map(a => `
    <a class="card" href="/search.html?q=${encodeURIComponent(a.title)}">
      <div class="ph">${a.poster ? `<img loading="lazy" src="/img?u=${encodeURIComponent(a.poster)}" alt="">` : ''}</div>
      ${a.score ? `<span class="rate">★ ${a.score}</span>` : ''}
      <div class="meta"><b>${a.title}</b><small>${[a.year, a.type].filter(Boolean).join(' • ')}</small></div>
    </a>`).join('');
}

$('#season').onchange = load;
$('#year').onchange = load;
load();