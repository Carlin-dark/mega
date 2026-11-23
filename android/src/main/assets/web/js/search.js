import { $, apiUrl, cardHTML, skeletons, savedSource } from './ui.js';

const p = new URLSearchParams(location.search);
const q = p.get('q') || '';
const source = p.get('source') || '';
if ($('#title')) $('#title').textContent = `Resultados para "${q}"`;
if ($('#grid')) $('#grid').innerHTML = skeletons(8);

const qs = new URLSearchParams({ q });
if (source) qs.set('source', source);

const data = await fetch(apiUrl(`/api/search?${qs.toString()}`)).then(r => r.json()).catch(() => null);
const results = Array.isArray(data) ? data : (data?.results || []);

if (!results.length) {
  if ($('#grid')) $('#grid').outerHTML = `<div class="empty"><b>Nada encontrado</b>O site pode não indexar este título. Tente outro nome ou outra fonte.</div>`;
} else if ($('#grid')) {
  $('#grid').innerHTML = results.map(i => cardHTML(i, i.source || source || savedSource())).join('');
}