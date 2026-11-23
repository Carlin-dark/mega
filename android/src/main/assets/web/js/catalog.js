import { $, cardHTML, skeletons, savedSource } from './ui.js';

const source = savedSource();
let page = 1;

async function load() {
  $('#grid').innerHTML = skeletons(12);
  const d = await fetch(`/api/catalog/${source}?page=${page}`).then(r => r.json()).catch(() => null);
  $('#grid').innerHTML = (d?.items || []).map(i => cardHTML(i, source)).join('') ||
    `<div class="empty"><b>Página vazia</b></div>`;
}

$('#next').onclick = () => { page++; load(); window.scrollTo(0, 0); };
$('#prev').onclick = () => { if (page > 1) { page--; load(); window.scrollTo(0, 0); } };
load();