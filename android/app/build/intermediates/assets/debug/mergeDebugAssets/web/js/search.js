import { $, apiUrl, cardHTML, skeletons, savedSource } from './ui.js';

const p = new URLSearchParams(location.search);
const q = p.get('q') || '';
if ($('#title')) $('#title').textContent = `Resultados para "${q}"`;
if ($('#grid')) $('#grid').innerHTML = skeletons(8);

async function bootSearch() {
  let sources = [];
  try {
    const meta = await fetch(apiUrl('/api/sources')).then(r => r.json());
    sources = meta?.sources || [];
  } catch {}
  if (!sources.length) {
    allSources = meta?.sources || [
  { id: 'animesonlinecc', name: 'AnimesOnlineCC' },
  { id: 'animesonline', name: 'AnimesOnline' },
  { id: 'animefire', name: 'AnimeFire' },
  { id: 'betteranime', name: 'BetterAnime' },
  { id: 'animesroll', name: 'AnimesRoll' },
];
  }

  const promises = sources.map(s => fetch(apiUrl(`/api/search?q=${encodeURIComponent(q)}&source=${s.id}`)).then(r => r.json()).catch(() => null));
  const settled = await Promise.allSettled(promises);
  let allResults = [];
  settled.forEach(res => {
    if (res.status === 'fulfilled' && res.value) {
      const list = Array.isArray(res.value) ? res.value : (res.value?.results || []);
      allResults.push(...list);
    }
  });

  const uniq = [...new Map(allResults.map(i => [i.slug || i.title, i])).values()];

  if (!uniq.length) {
    if ($('#grid')) $('#grid').outerHTML = `<div class="empty"><b>Nada encontrado</b>Nenhuma fonte encontrou este título. Tente outro nome.</div>`;
  } else if ($('#grid')) {
    $('#grid').innerHTML = uniq.map(i => cardHTML(i, i.source || savedSource())).join('');
  }
}

bootSearch();
