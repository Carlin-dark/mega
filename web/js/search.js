import { $, cardHTML, skeletons } from './ui.js';

const p = new URLSearchParams(location.search);
const q = p.get('q') || '';
const source = p.get('source') || '';
$('#title').textContent = `Resultados para "${q}"`;
$('#grid').innerHTML = skeletons(8);

const url = `/api/search${source ? `/${source}` : ''}?q=${encodeURIComponent(q)}`;
const data = await fetch(url).then(r => r.json()).catch(() => null);

if (!data?.results?.length) {
  $('#grid').outerHTML = `<div class="empty"><b>Nada encontrado</b>O site pode não indexar este título. Tente outro nome ou outra fonte.</div>`;
} else {
  $('#grid').innerHTML = data.results.map(i => cardHTML(i, i.source)).join('');
}