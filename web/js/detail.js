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

async function getPosterFallback(title) {
  if (!title) return null;
  const clean = String(title).replace(/\b(dub\w*|leg\w*|temporada\w*|\d+ª?|eps?\.?\s*\d+)\b/gi, '').trim();
  try {
    const r = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(clean)}&limit=1`);
    const d = await r.json();
    const url = d?.data?.[0]?.images?.jpg?.large_image_url || d?.data?.[0]?.images?.jpg?.image_url;
    if (url) return url;
  } catch {}
  try {
    const query = `query ($search: String) { Media(search: $search, type: ANIME) { coverImage { extraLarge large } } }`;
    const r = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query, variables: { search: clean } })
    });
    const d = await r.json();
    const url = d?.data?.Media?.coverImage?.extraLarge || d?.data?.Media?.coverImage?.large;
    if (url) return url;
  } catch {}
  return null;
}

async function fetchAnimeWithFallback(targetSlug, initialSrc) {
  await loadSources();
  const order = [initialSrc, ...allSources.map(s => s.id).filter(id => id !== initialSrc)];
  for (const src of order) {
    try {
      const res = await fetch(apiUrl(`/api/anime/${encodeURIComponent(targetSlug)}?source=${encodeURIComponent(src)}`)).then(r => r.json()).catch(() => null);
      if (res && !res.error && (res.seasons || []).length) {
        source = src;
        saveSource(source);
        return res;
      }
    } catch {}
  }
  return null;
}

async function boot() {
  if ($('#app')) {
    $('#app').innerHTML = `<div class="detail"><div class="skel" style="aspect-ratio:2/3"></div><div><div class="skel" style="aspect-ratio:16/6"></div></div></div>`;
  }
  if (!slug) {
    if ($('#app')) $('#app').innerHTML = `<div class="empty"><b>Anime não informado</b></div>`;
    return;
  }

  let a = await fetchAnimeWithFallback(slug, source);

  $('#app').innerHTML = `<section class="detail">
    <div class="blur" id="blur"></div>
    <div class="dhead">
      <div class="poster"><img id="poster" alt=""></div>
      <div class="dinfo">
        <h1 id="title">${a && !a.error ? a.title : 'Carregando...'}</h1>
        <div class="badges" id="badges">
          ${a?.year ? `<span class="chip">${a.year}</span>` : ''}
          ${a?.type ? `<span class="chip red">${a.type}</span>` : ''}
          ${a?.status ? `<span class="chip">${a.status}</span>` : ''}
          ${a?.score ? `<span class="chip star">★ ${a.score}</span>` : ''}
        </div>
        <div class="genres" id="genres">${(a?.genres || []).join(', ')}</div>
      </div>
    </div>
    ${(!a || a.error) ? `
      <div class="empty"><b>Falha ao carregar anime</b>Tente novamente mais tarde.</div>
    ` : `
      <p class="syn" id="syn">${a.synopsis || 'Sem sinopse.'}</p>
      <div class="seasons" id="seasonTabs"></div>
      <div class="eps" id="eps"></div>
    `}
  </section>`;

  if (a && !a.error) {
    const posterUrl = a.poster || a.cover ? apiUrl(`/img?u=${encodeURIComponent(a.poster || a.cover)}`) : null;
    const imgEl = $('#poster');
    if (posterUrl) {
      imgEl.src = posterUrl;
      imgEl.onerror = async function() {
        this.onerror = null;
        const u = await getPosterFallback(a.title);
        if (u) {
          this.src = u;
          const blurEl = $('#blur');
          if (blurEl) blurEl.innerHTML = `<img src="${u}" alt="">`;
        }
      };
      const blurEl = $('#blur');
      if (blurEl) blurEl.innerHTML = `<img src="${posterUrl}" alt="">`;
    } else {
      const u = await getPosterFallback(a.title);
      if (u) {
        imgEl.src = u;
        const blurEl = $('#blur');
        if (blurEl) blurEl.innerHTML = `<img src="${u}" alt="">`;
      }
    }

    const seasons = a.seasons || [];
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

    if (seasons.length && $('#seasonTabs')) {
      $('#seasonTabs').innerHTML = seasons.map((s, i) => `<button type="button" data-i="${i}" class="${i === 0 ? 'on' : ''}">${s.title}</button>`).join('');
      $('#seasonTabs').onclick = ev => {
        const b = ev.target.closest('button');
        if (!b) return;
        [...$('#seasonTabs').children].forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        drawEps(Number(b.dataset.i));
      };
      drawEps(0);
    }
  }
}

boot();
