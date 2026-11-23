/* Mega Anime — Refactored & Optimized with Jikan Fallback, Servidores 1-5, Fast Home, Calendar 2030 & Preferences */
const API = (window.API_BASE || 'https://mega-la8q.onrender.com').replace(/\/+$/, '');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s = '') => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const img = (u) => (u ? `${API}/img?u=${encodeURIComponent(u)}` : '');

const DEFAULT_SOURCES = [
  { id: 'animesonline', name: 'Servidor 1' },
  { id: 'animefire', name: 'Servidor 2' },
  { id: 'betteranime', name: 'Servidor 3' },
  { id: 'animesroll', name: 'Servidor 4' },
  { id: 'anitube', name: 'Servidor 5' }
];

const store = {
  get(k, d = null) { try { return JSON.parse(localStorage.getItem('ma:' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ma:' + k, JSON.stringify(v)); } catch {} },
  del(k) { localStorage.removeItem('ma:' + k); }
};

const toast = (t) => {
  const el = $('#toast'); if (!el) return;
  el.textContent = t; el.classList.add('on');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 1800);
};

const ICONS = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 3 6.5 7 1-5 5 1.2 7L12 18l-6.2 3.5L7 14.5l-5-5 7-1z"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  dl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:13px;height:13px;margin-right:4px"><path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><path d="M4 19h16"/></svg>',
  site: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:13px;height:13px;margin-right:4px"><path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6"/></svg>'
};

/* Robust Poster Fallback via Jikan API & AniList */
const posterFallbackCache = {};
async function getPosterFallback(title) {
  if (!title) return null;
  const clean = String(title).replace(/\b(dub\w*|leg\w*|temporada\w*|\d+ª?|eps?\.?\s*\d+)\b/gi, '').trim();
  if (posterFallbackCache[clean]) return posterFallbackCache[clean];

  // 1. Try Jikan API (handles Jujutsu Kaisen and others perfectly)
  try {
    const r = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(clean)}&limit=1`);
    const d = await r.json();
    const url = d?.data?.[0]?.images?.jpg?.large_image_url || d?.data?.[0]?.images?.jpg?.image_url;
    if (url) {
      posterFallbackCache[clean] = url;
      return url;
    }
  } catch {}

  // 2. Try AniList GraphQL API
  try {
    const query = `
      query ($search: String) {
        Media(search: $search, type: ANIME) {
          coverImage {
            extraLarge
            large
          }
        }
      }
    `;
    const r = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query, variables: { search: clean } })
    });
    const d = await r.json();
    const url = d?.data?.Media?.coverImage?.extraLarge || d?.data?.Media?.coverImage?.large;
    if (url) {
      posterFallbackCache[clean] = url;
      return url;
    }
  } catch {}

  return null;
}
const getJikanCover = getPosterFallback;

function unwrapOEmbed(data) {
  if (!data) return null;
  if (typeof data === 'object') {
    if (data.html) {
      const m = data.html.match(/src="([^"]+)"/);
      if (m) return m[1];
    }
    if (data.url) return data.url;
  }
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return unwrapOEmbed(parsed);
    } catch {
      const m = data.match(/src="([^"]+)"/);
      if (m) return m[1];
    }
  }
  return null;
}

function isSiteAnimePage(u = '') {
  const unwrapped = unwrapOEmbed(u) || u;
  if (!unwrapped) return true;
  if (unwrapped.trim().startsWith('{') || unwrapped.trim().startsWith('[')) return true;
  try {
    const parsed = new URL(unwrapped);
    const isAnimePath = /\/anime\/[^/]+\/?$/i.test(parsed.pathname) && !parsed.searchParams.get('ep');
    const isAnimesOnline = /(animesonline|animefire|betteranime|animesroll|anitube)/i.test(parsed.hostname) && /\/anime\//i.test(parsed.pathname) && !/video\.g|videoplayback|\.mp4|\.m3u8|\.webm/i.test(unwrapped);
    return isAnimePath || isAnimesOnline;
  } catch {
    return /\/anime\/[^/?#]+$/i.test(String(unwrapped));
  }
}

const asList = (d) => {
  if (Array.isArray(d)) return d;
  if (!d || typeof d !== 'object') return [];
  if (Array.isArray(d.items)) return d.items;
  if (Array.isArray(d.results)) return d.results;
  if (Array.isArray(d.hero)) return d.hero;
  if (Array.isArray(d.sections)) return d.sections.flatMap(s => s.items || []);
  return [];
};

const cover = (a) => a.cover || a.poster || a.banner || null;

function normAnime(a) {
  const seasons = (Array.isArray(a?.seasons) ? a.seasons : []).map((s, i) => {
    const num = s.season ?? s.number ?? i + 1;
    const eps = [];
    (s.episodes || []).forEach((e, idx) => {
      const list = Array.isArray(e.audio) ? e.audio : [e.audio || 'leg'];
      const n = e.number || idx + 1;
      list.forEach((au) => eps.push({
        number: n,
        audio: au,
        id: e.ids?.[au] ?? e.id ?? n,
        duration: e.duration || null
      }));
    });
    return { season: num, title: s.title || `Temporada ${num}`, episodes: eps };
  });
  const flat = seasons.flatMap(s => s.episodes);
  return {
    source: a?.source || store.get('source', 'animesonline'),
    slug: a?.slug || '',
    title: a?.title || 'Sem título',
    cover: cover(a || {}),
    synopsis: a?.synopsis || '',
    year: a?.year || null,
    type: a?.type || null,
    status: a?.status || null,
    score: a?.score || null,
    genres: Array.isArray(a?.genres) ? a.genres : [],
    audios: [...new Set(flat.map(e => e.audio))],
    episodeCount: a?.episodeCount ?? flat.length,
    seasons
  };
}

const favs = () => store.get('favs', []);
const isFav = (slug) => favs().some(x => x.slug === slug);
const setFav = (a, add) => {
  let list = favs();
  if (add) {
    if (!list.some(x => x.slug === a.slug)) list.unshift({ slug: a.slug, source: a.source, title: a.title, cover: a.cover, type: a.type, year: a.year });
  } else {
    list = list.filter(x => x.slug !== a.slug);
  }
  store.set('favs', list);
  return add;
};
const toggleFav = (a) => setFav(a, !isFav(a.slug));

function saveFile(url, name) {
  const realUrl = unwrapOEmbed(url) || url;
  if (!realUrl || isSiteAnimePage(realUrl)) {
    toast('Link direto de vídeo não disponível para download');
    return;
  }
  if (window.Android && window.Android.download) {
    window.Android.download(realUrl, name, 'video/mp4', 'https://www.blogger.com/');
    toast('Baixando em Downloads/MegaAnime');
    return;
  }
  const a = document.createElement('a');
  a.href = realUrl; a.download = name; a.target = '_blank'; a.rel = 'noreferrer';
  a.click();
  toast('Download iniciado');
}

function card(a, ep, srcOverride) {
  const src = a.source || srcOverride || store.get('source', 'animesonline');
  const el = document.createElement('a');
  el.className = 'card';
  el.href = `detail.html?source=${encodeURIComponent(src)}&slug=${encodeURIComponent(a.slug)}`;
  const c = cover(a);
  const titleEsc = esc(a.title || '');
  const subtitle = esc([a.type, a.year].filter(Boolean).join(' • '));
  const coverUrl = c ? (c.startsWith('http') ? esc(c) : img(c)) : '';
  el.innerHTML = `${ep ? `<span class="ep">EP ${esc(ep)}</span>` : ''}
    <img loading="lazy" src="${coverUrl}" alt="${titleEsc}" onerror="this.onerror=null; getPosterFallback('${titleEsc}').then(u=>{if(u) this.src=u;});">
    <div class="pl"><span>${ICONS.play}</span></div>
    <div class="cap"><b>${titleEsc}</b><small>${subtitle}</small></div>`;
  if (!c) {
    getPosterFallback(a.title).then(u => {
      if (u) {
        const im = el.querySelector('img');
        if (im) im.src = u;
      }
    });
  }
  return el;
}

async function jsonWithTimeout(url, ms = 5000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const r = await fetch(url, { headers: { accept: 'application/json' }, signal: controller.signal });
    clearTimeout(id);
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    if (!r.ok && data === null) throw new Error(`HTTP ${r.status}`);
    if (data && data.error && !Array.isArray(data)) throw new Error(data.error);
    return data;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}
const json = (u) => jsonWithTimeout(u, 6000);

async function fetchSources() {
  try {
    const r = await jsonWithTimeout(`${API}/api/sources`, 4000);
    const d = r;
    if (Array.isArray(d?.sources) && d.sources.length) {
      return d.sources.map((s, i) => ({ id: s.id, name: `Servidor ${i + 1}` }));
    }
  } catch {}
  return DEFAULT_SOURCES;
}

const failBox = (box, msg, retry) => {
  box.innerHTML = `<p class="empty">${esc(msg)}</p>`;
  if (retry) {
    const b = document.createElement('button');
    b.className = 'btn dark';
    b.textContent = 'Tentar de novo';
    b.style.margin = '0 auto 26px';
    b.style.display = 'block';
    b.onclick = retry;
    box.appendChild(b);
  }
};

/* ================= HOME ================= */
if (document.body.dataset.page === 'home') {
  let heroPool = [], hi = 0, page = 1, busy = false, done = false;
  let currentSource = store.get('source', 'animesonline');
  let availableSources = DEFAULT_SOURCES;

  const paintHero = () => {
    const a = heroPool[hi % heroPool.length];
    if (!a) return;
    let c = cover(a);
    const titleEsc = esc(a.title || '');
    const coverUrl = c ? (c.startsWith('http') ? esc(c) : img(c)) : '';
    $('#hero').innerHTML = `${coverUrl ? `<img src="${coverUrl}" alt="" onerror="this.onerror=null; getPosterFallback('${titleEsc}').then(u=>{if(u)this.src=u});">` : ''}
      <div class="inner">
        <div class="chips"><span class="chip red">Em destaque</span>
          ${a.type ? `<span class="chip">${esc(a.type)}</span>` : ''}
          ${a.year ? `<span class="chip star">${ICONS.star} ${esc(a.year)}</span>` : ''}</div>
        <h2>${titleEsc}</h2>
        <p>${esc(a.synopsis || 'Assista agora, legendado ou dublado.')}</p>
        <div class="row">
          <a class="btn" href="detail.html?source=${encodeURIComponent(currentSource)}&slug=${encodeURIComponent(a.slug)}">${ICONS.play} Play</a>
          <button class="btn circle" id="hero-fav" aria-label="Salvar"></button>
          <span class="pager">${(hi % heroPool.length) + 1} / ${heroPool.length}</span>
        </div>
      </div>
      <div class="dots">${heroPool.map((_, k) => `<b class="${k === hi % heroPool.length ? 'on' : ''}"></b>`).join('')}</div>
      <div class="bar"><i class="run"></i></div>`;
    const fb = $('#hero-fav');
    fb.innerHTML = isFav(a.slug)
      ? '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>';
    fb.onclick = () => {
      const on = toggleFav({ ...a, source: currentSource });
      paintHero();
      toast(on ? 'Salvo na lista' : 'Removido');
    };
    if (!c) {
      getPosterFallback(a.title).then(u => {
        if (u) { a.cover = u; paintHero(); }
      });
    }
  };

  const heroGo = (dir) => { hi = (hi + dir + heroPool.length) % heroPool.length; paintHero(); startHero(); };

  function startHero() {
    clearInterval(window.__hero);
    window.__hero = setInterval(() => { hi++; paintHero(); }, 6000);
  }

  function heroSwipe() {
    const el = $('#hero');
    let x0 = null, t0 = 0;
    el.addEventListener('pointerdown', (e) => { x0 = e.clientX; t0 = Date.now(); });
    el.addEventListener('pointerup', (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0;
      if (Math.abs(dx) > 40 && Date.now() - t0 < 600) heroGo(dx < 0 ? 1 : -1);
      x0 = null;
    });
    el.addEventListener('pointerenter', () => clearInterval(window.__hero));
    el.addEventListener('pointerleave', startHero);
  }

  /* Fast Cached & Parallel Home Loader */
  async function loadHome() {
    const cachedHome = store.get('cache_home_' + currentSource);
    if (cachedHome && cachedHome.length) {
      heroPool = cachedHome.slice(0, 8);
      paintHero();
      startHero();
      $('#latest').innerHTML = '';
      cachedHome.slice(0, 20).forEach(a => $('#latest').appendChild(card(a, null, currentSource)));
      cachedHome.slice(20, 32).forEach(a => $('#top').appendChild(card(a, null, currentSource)));
      cachedHome.slice(0, 12).forEach(a => $('#added').appendChild(card(a, null, currentSource)));
    } else {
      $('#latest').innerHTML = '<p class="empty">Carregando episódios…</p>';
    }

    const cont = store.get('continue', []);
    if (cont.length) {
      $('#continue-wrap').classList.remove('hide');
      $('#continue').innerHTML = '';
      cont.slice(0, 12).forEach(c => $('#continue').appendChild(card(c, c.ep, c.source || currentSource)));
    }

    try {
      const [sourcesRes, homeRes] = await Promise.allSettled([
        fetchSources(),
        jsonWithTimeout(`${API}/api/home?source=${encodeURIComponent(currentSource)}`, 5000)
      ]);

      if (sourcesRes.status === 'fulfilled' && sourcesRes.value) {
        availableSources = sourcesRes.value;
      }

      let list = [];
      if (homeRes.status === 'fulfilled' && homeRes.value) {
        list = asList(homeRes.value);
      }

      if (!list.length) {
        for (const s of availableSources) {
          if (s.id === currentSource) continue;
          try {
            const fallbackRes = await jsonWithTimeout(`${API}/api/home?source=${encodeURIComponent(s.id)}`, 4000);
            list = asList(fallbackRes);
            if (list.length) {
              currentSource = s.id;
              store.set('source', currentSource);
              break;
            }
          } catch {}
        }
      }

      const uniq = [...new Map(list.map(a => [a.slug, a])).values()];
      if (!uniq.length && !cachedHome) throw new Error('vazio');

      if (uniq.length) {
        store.set('cache_home_' + currentSource, uniq);
        heroPool = uniq.slice(0, 8);
        paintHero();
        startHero();
        if (!$('#hero').dataset.wired) { $('#hero').dataset.wired = '1'; heroSwipe(); }

        $('#latest').innerHTML = '';
        uniq.slice(0, 20).forEach(a => $('#latest').appendChild(card(a, null, currentSource)));
        $('#top').innerHTML = '';
        uniq.slice(20, 32).forEach(a => $('#top').appendChild(card(a, null, currentSource)));
        if (!$('#top').children.length) uniq.slice(0, 12).forEach(a => $('#top').appendChild(card(a, null, currentSource)));

        $('#added').innerHTML = '';
        uniq.slice(0, 20).forEach(a => $('#added').appendChild(card(a, null, currentSource)));
      }
    } catch {
      if (!cachedHome) failBox($('#latest'), 'Falha ao carregar. Tentar de novo.', loadHome);
    }
  }
  loadHome();

  const loadMore = async () => {
    if (busy || done) return;
    busy = true;
    try {
      const list = asList(await jsonWithTimeout(`${API}/api/catalog?page=${++page}&source=${encodeURIComponent(currentSource)}`, 5000));
      if (!list.length) done = true;
      else list.forEach(a => $('#catalog').appendChild(card(a, null, currentSource)));
    } catch {}
    busy = false;
  };
  if ($('#sentinel')) new IntersectionObserver(([e]) => e.isIntersecting && loadMore()).observe($('#sentinel'));

  const views = ['home', 'search', 'catalog', 'seasons', 'list', 'downloads', 'profile'];
  const show = (v) => {
    views.forEach(x => $('#view-' + x)?.classList.toggle('hide', x !== v));
    $$('.nav a').forEach(a => a.classList.toggle('on', a.dataset.tab === v));

    // REQUIREMENT 5: Top Header restricted ONLY to Home view
    const isHome = v === 'home';
    $('.top')?.classList.toggle('hide', !isHome);
    $('#searchbar')?.classList.add('hide');

    window.scrollTo(0, 0);
    if (v === 'list') renderList();
    if (v === 'downloads') renderDownloads();
    if (v === 'seasons') initSeasons();
    if (v === 'profile') renderProfile();
  };

  $$('.nav a, .see').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    show(a.dataset.tab || 'catalog');
  }));

  $('#btn-search').onclick = () => { $('#searchbar').classList.toggle('hide'); $('#q').focus(); };
  $('#btn-bell').onclick = () => { show('home'); toast('Novos episódios na Home'); };

  /* UNIFIED PARALLEL MULTI-SOURCE SEARCH */
  $('#searchbar').onsubmit = async (e) => {
    e.preventDefault();
    const q = $('#q').value.trim();
    if (!q) return;
    show('search');
    const box = $('#results');
    box.innerHTML = '<p class="empty">Buscando em todas as fontes em paralelo…</p>';
    try {
      const sources = await fetchSources();
      const promises = sources.map(s => jsonWithTimeout(`${API}/api/search?q=${encodeURIComponent(q)}&source=${s.id}`, 4500).catch(() => null));
      const settled = await Promise.allSettled(promises);
      let allResults = [];
      settled.forEach((res, idx) => {
        if (res.status === 'fulfilled' && res.value) {
          const items = asList(res.value);
          items.forEach(item => {
            if (!item.source) item.source = sources[idx].id;
          });
          allResults.push(...items);
        }
      });
      const uniq = [...new Map(allResults.map(item => [item.slug || item.title, item])).values()];
      box.innerHTML = '';
      if (!uniq.length) return failBox(box, `Nada encontrado para "${q}" em nenhuma fonte.`);
      uniq.forEach(a => box.appendChild(card(a, null, a.source || sources[0]?.id)));
    } catch {
      failBox(box, 'Erro na busca.', () => $('#searchbar').requestSubmit());
    }
  };

  function renderList() {
    const l = favs();
    $('#list').innerHTML = l.length ? '' : '<p class="empty">Sua lista está vazia. Abra um anime e toque no marcador.</p>';
    l.forEach(a => {
      const el = card(a, null, a.source || currentSource);
      const b = document.createElement('button');
      b.className = 'card-x';
      b.innerHTML = ICONS.x;
      b.onclick = (e) => { e.preventDefault(); setFav(a, false); renderList(); toast('Removido'); };
      el.appendChild(b);
      $('#list').appendChild(el);
    });
  }

  function renderDownloads() {
    const d = store.get('dls', []);
    $('#downloads').innerHTML = d.length ? '' : '<p class="empty">Nada baixado. Use o botão Baixar no episódio.</p>';
    d.slice().reverse().forEach(x => {
      const el = document.createElement('div');
      el.className = 'box';
      el.innerHTML = `<div><b>${esc(x.title)}</b><small>EP ${esc(x.ep)} · ${esc(x.quality)}</small></div>
        <a class="btn" style="margin-left:auto;padding:9px 14px" href="${esc(x.url)}" target="_blank" rel="noreferrer">Abrir</a>`;
      $('#downloads').appendChild(el);
    });
  }

  /* CALENDAR UP TO 2030 WITH UNBLOCKABLE PARALLEL & TIMEOUT FALLBACK */
  let seasonsReady = false;
  let currentSeasonReqId = 0;

  function initSeasons() {
    const sel = $('#s-year');
    if (sel && !sel.options.length) {
      const curYear = new Date().getFullYear();
      for (let i = 2030; i >= 2000; i--) sel.add(new Option(i, i));
      sel.value = curYear;
      sel.onchange = () => loadSeason();
      $$('[data-s]').forEach(b => b.onclick = () => {
        $$('[data-s]').forEach(x => x.classList.toggle('on', x === b));
        loadSeason(b.dataset.s);
      });
    }
    if (!seasonsReady) { seasonsReady = true; loadSeason(); }
  }

  function renderSeasonCards(box, list) {
    box.innerHTML = '';
    list.forEach(m => {
      const titleEsc = esc(m.title || '');
      const el = document.createElement('a');
      el.className = 'card';
      el.href = '#';
      const coverSrc = m.cover ? (m.cover.startsWith('http') ? esc(m.cover) : img(m.cover)) : '';
      el.innerHTML = `${coverSrc ? `<img loading="lazy" src="${coverSrc}" alt="${titleEsc}" onerror="this.onerror=null; getPosterFallback('${titleEsc}').then(u=>{if(u)this.src=u});">` : '<div style="aspect-ratio:2/3;background:#1b1b22"></div>'}
        ${m.score ? `<span class="ep">${ICONS.star} ${Number(m.score).toFixed(1)}</span>` : ''}
        <div class="cap"><b>${titleEsc}</b><small>${esc(m.type || m.day || m.year || '')}</small></div>`;
      el.onclick = async (e) => {
        e.preventDefault();
        if (m.slug) return location.href = `detail.html?source=${encodeURIComponent(currentSource)}&slug=${encodeURIComponent(m.slug)}`;
        toast('Procurando no catálogo…');
        try {
          const r = asList(await json(`${API}/api/search?q=${encodeURIComponent(m.title)}`));
          if (r[0]) location.href = `detail.html?source=${encodeURIComponent(r[0].source || currentSource)}&slug=${encodeURIComponent(r[0].slug)}`;
          else toast('Não disponível nas fontes');
        } catch { toast('Falha na busca'); }
      };
      box.appendChild(el);
    });
  }

  async function loadSeason(season) {
    const reqId = ++currentSeasonReqId;
    const s = season || $('[data-s].on')?.dataset.s || 'winter';
    const y = $('#s-year')?.value || new Date().getFullYear();
    const box = $('#season-grid');

    const cacheKey = `cache_season_${y}_${s}`;
    const cached = store.get(cacheKey);
    if (cached && cached.length) {
      renderSeasonCards(box, cached);
    } else {
      box.innerHTML = '<p class="empty">Carregando lançamentos da temporada…</p>';
    }

    try {
      let list = [];
      const p1 = jsonWithTimeout(`${API}/api/seasons/${y}/${s}`, 4000).catch(() => null);
      const p2 = jsonWithTimeout(`https://api.jikan.moe/v4/seasons/${y}/${s}`, 4000).then(res => {
        if (Array.isArray(res?.data)) {
          return res.data.map(item => ({
            title: item.title,
            cover: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url,
            score: item.score,
            type: item.type,
            year: y
          }));
        }
        return null;
      }).catch(() => null);

      const [res1, res2] = await Promise.allSettled([p1, p2]);
      if (res1.status === 'fulfilled' && res1.value) {
        list = asList(res1.value);
      }
      if ((!list || !list.length) && res2.status === 'fulfilled' && res2.value) {
        list = res2.value;
      }

      if (!list || !list.length) {
        try {
          list = asList(await jsonWithTimeout(`${API}/api/calendar`, 3000));
        } catch {}
      }

      if (reqId !== currentSeasonReqId) return;

      if (list && list.length) {
        store.set(cacheKey, list.slice(0, 50));
        renderSeasonCards(box, list);
      } else if (!cached || !cached.length) {
        failBox(box, `Nenhum anime encontrado para ${s.toUpperCase()} / ${y}.`, () => loadSeason(s));
      }
    } catch {
      if (reqId !== currentSeasonReqId) return;
      if (!cached || !cached.length) {
        failBox(box, 'Falha ao carregar temporada. Tente novamente.', () => loadSeason(s));
      }
    }
  }

  /* PROFILE PREFERENCES SAVING */
  function renderProfile() {
    $('#p-stats').textContent = `${favs().length} salvos · ${store.get('dls', []).length} downloads`;

    const prefAudio = store.get('audio', 'leg');
    $$('[data-pref-audio]').forEach(b => b.classList.toggle('on', b.dataset.prefAudio === prefAudio));

    const prefSrvIdx = store.get('srv_idx', '0');
    $$('[data-pref-srv]').forEach(b => b.classList.toggle('on', b.dataset.prefSrv === String(prefSrvIdx)));

    const prefQual = store.get('quality_pref', 'auto');
    $$('[data-pref-qual]').forEach(b => b.classList.toggle('on', b.dataset.prefQual === prefQual));

    const prefAutoNext = store.get('auto_next', 'on');
    $$('[data-pref-autonext]').forEach(b => b.classList.toggle('on', b.dataset.prefAutonext === prefAutoNext));
  }

  $$('[data-pref-audio]').forEach(b => b.onclick = () => {
    store.set('audio', b.dataset.prefAudio);
    renderProfile();
    toast('Áudio padrão salvo');
  });

  $$('[data-pref-srv]').forEach(b => b.onclick = () => {
    const idx = +b.dataset.prefSrv;
    store.set('srv_idx', idx);
    if (DEFAULT_SOURCES[idx]) store.set('source', DEFAULT_SOURCES[idx].id);
    renderProfile();
    toast(`Servidor ${idx + 1} definido como padrão`);
  });

  $$('[data-pref-qual]').forEach(b => b.onclick = () => {
    store.set('quality_pref', b.dataset.prefQual);
    renderProfile();
    toast('Qualidade preferida salva');
  });

  $$('[data-pref-autonext]').forEach(b => b.onclick = () => {
    store.set('auto_next', b.dataset.prefAutonext);
    renderProfile();
    toast('Auto Próximo Episódio atualizado');
  });

  $('#wipe').onclick = () => {
    if (confirm('Deseja realmente apagar todo o histórico, salvos e preferências localmente?')) {
      localStorage.clear();
      toast('Dados limpos');
      renderProfile();
    }
  };
}

/* ================= DETALHE ================= */
if (document.body.dataset.page === 'detail') {
  const params = new URLSearchParams(location.search);
  let source = params.get('source') || store.get('source', 'animesonline');
  let slug = params.get('slug');
  let data = null, season = 1, audio = store.get('audio', 'leg'), sourcesList = DEFAULT_SOURCES;

  $('#back').onclick = () => history.length > 1 ? history.back() : location.href = 'index.html';

  async function findBestSlugInSource(srcId, titleText) {
    if (!titleText) return null;
    try {
      const list = asList(await json(`${API}/api/search?q=${encodeURIComponent(titleText)}&source=${encodeURIComponent(srcId)}`));
      if (!list.length) return null;
      const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const target = norm(titleText);
      const exact = list.find(i => norm(i.title) === target || norm(i.title).includes(target) || target.includes(norm(i.title)));
      return (exact || list[0]).slug;
    } catch {
      return null;
    }
  }

  async function loadDetail() {
    sourcesList = await fetchSources();
    const order = [source, ...sourcesList.map(s => s.id).filter(id => id !== source)];
    let raw = null;

    for (const src of order) {
      try {
        const res = await json(`${API}/api/anime/${encodeURIComponent(slug)}?source=${encodeURIComponent(src)}`).catch(() => null);
        if (res && !res.error && (res.seasons || []).length) {
          source = src;
          store.set('source', source);
          raw = res;
          break;
        }
      } catch {}
    }

    if (!raw || raw.error) {
      for (const src of order) {
        try {
          const altSlug = await findBestSlugInSource(src, slug.replace(/-/g, ' '));
          if (altSlug) {
            const res = await json(`${API}/api/anime/${encodeURIComponent(altSlug)}?source=${encodeURIComponent(src)}`).catch(() => null);
            if (res && !res.error && (res.seasons || []).length) {
              source = src;
              slug = altSlug;
              store.set('source', source);
              raw = res;
              break;
            }
          }
        } catch {}
      }
    }

    if (!raw || raw.error) {
      $('#title').textContent = 'Anime não encontrado';
      $('#badges').innerHTML = '<span class="red">indisponível</span>';
      $('#syn').textContent = 'Não foi possível carregar os detalhes deste anime em nenhum servidor.';
      return;
    }

    try {
      data = normAnime({ ...raw, source });
      document.title = data.title;
      $('#title').textContent = data.title;

      let posterUrl = data.cover ? (data.cover.startsWith('http') ? data.cover : img(data.cover)) : null;
      if (!posterUrl) {
        const u = await getPosterFallback(data.title);
        if (u) posterUrl = u;
      }

      if (posterUrl) {
        $('#poster').src = posterUrl;
        $('#poster').onerror = async function() {
          this.onerror = null;
          const u = await getPosterFallback(data.title);
          if (u) {
            this.src = u;
            $('#blur').innerHTML = `<img src="${u}" alt="">`;
          }
        };
        $('#blur').innerHTML = `<img src="${posterUrl}" alt="">`;
      }

      $('#syn').textContent = data.synopsis || 'Sem sinopse.';
      $('#genres').innerHTML = `<b>Gênero:</b> ${esc(data.genres.join(', ') || '—')}`;

      const score = data.score ? Number(data.score).toFixed(1) : (7 + ((data.episodeCount || 12) % 20) / 10).toFixed(1);
      $('#badges').innerHTML = `
        <span class="star">${ICONS.star} ${score}</span>
        <span>${esc(data.year || '—')}</span>
        <span>${data.audios.includes('dub') ? 'DUB' : 'LEG'}</span>
        <span class="red">HD</span>
        <span>${data.episodeCount} eps</span>`;

      season = data.seasons[0]?.season || 1;
      paintEps();
      $('#fav').classList.toggle('on', isFav(data.slug));

      /* Animes Semelhantes por gênero */
      try {
        const allSimilar = [];
        for (const s of sourcesList) {
          const r = await json(`${API}/api/home?source=${s.id}`).catch(() => null);
          if (r) allSimilar.push(...asList(r));
        }
        const uniq = [...new Map(allSimilar.map(a => [a.slug, a])).values()].filter(a => a.slug !== slug);
        const matching = uniq.filter(a => {
          const aGenres = a.genres || [];
          return aGenres.some(g => (data.genres || []).includes(g));
        });
        const finalSimilar = matching.length ? matching : uniq.slice(0, 12);
        const g = $('#tab-rel .grid');
        g.innerHTML = '';
        if (!finalSimilar.length) g.innerHTML = '<p class="empty">Sem semelhantes.</p>';
        else finalSimilar.forEach(a => g.appendChild(card(a, null, source)));
      } catch {
        $('#tab-rel .grid').innerHTML = '<p class="empty">Sem semelhantes.</p>';
      }

      /* Personagens via Jikan API */
      try {
        const jikanSearch = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(data.title)}&limit=1`).then(r => r.json());
        const animeMalId = jikanSearch?.data?.[0]?.mal_id;
        if (animeMalId) {
          const charRes = await fetch(`https://api.jikan.moe/v4/anime/${animeMalId}/characters`).then(r => r.json());
          const charsList = charRes?.data || [];
          $('#tab-chars').innerHTML = '';
          if (!charsList.length) {
            $('#tab-chars').innerHTML = '<p class="empty">Personagens não encontrados.</p>';
          } else {
            const g = document.createElement('div');
            g.className = 'chars';
            charsList.forEach(c => {
              const el = document.createElement('div');
              el.className = 'char';
              const imgUrl = c.character?.images?.jpg?.image_url || '';
              const name = c.character?.name || 'Personagem';
              const role = c.role || '';
              el.innerHTML = `${imgUrl ? `<img loading="lazy" src="${esc(imgUrl)}" alt="${esc(name)}">` : ''}<b>${esc(name)}</b><small>${esc(role)}</small>`;
              g.appendChild(el);
            });
            $('#tab-chars').appendChild(g);
          }
        } else {
          $('#tab-chars').innerHTML = '<p class="empty">Personagens indisponíveis.</p>';
        }
      } catch {
        $('#tab-chars').innerHTML = '<p class="empty">Personagens indisponíveis.</p>';
      }
    } catch {
      $('#title').textContent = 'Falha ao carregar';
      $('#badges').innerHTML = '<span class="red">erro</span>';
    }
  }

  loadDetail();

  function paintEps() {
    const box = $('#tab-eps');
    box.innerHTML = '';
    if (!data) return;
    const se = data.seasons.find(s => s.season === season) || data.seasons[0];
    if (!se) { box.innerHTML = '<p class="empty">Sem episódios disponíveis.</p>'; return; }

    if (data.seasons.length > 1) {
      const tabs = document.createElement('div');
      tabs.className = 'ctrl';
      tabs.innerHTML = data.seasons.map(s =>
        `<button class="tag ${s.season === season ? 'on' : ''}" data-s="${s.season}">T${s.season}</button>`).join('');
      tabs.onclick = (e) => {
        const b = e.target.closest('[data-s]');
        if (!b) return;
        season = +b.dataset.s;
        paintEps();
      };
      box.appendChild(tabs);
    }

    const row = document.createElement('div');
    row.className = 'ctrl';
    row.innerHTML = `<button class="tag ${audio === 'leg' ? 'on' : ''}" data-a="leg">LEG</button>
      <button class="tag ${audio === 'dub' ? 'on' : ''}" data-a="dub">DUB</button>`;
    row.onclick = (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      audio = b.dataset.a;
      store.set('audio', audio);
      paintEps();
    };
    box.appendChild(row);

    const grid = document.createElement('div');
    grid.className = 'eps';
    const eps = se.episodes.filter(e => e.audio === audio);
    if (!eps.length) grid.innerHTML = '<p class="empty">Sem episódios neste áudio.</p>';
    eps.forEach((e, idx) => {
      const n = e.number || idx + 1;
      const a = document.createElement('a');
      a.href = `player.html?source=${encodeURIComponent(source)}&slug=${encodeURIComponent(data.slug)}&ep=${n}&season=${season}&audio=${e.audio}`;
      a.innerHTML = `${n}${e.duration ? `<small>${esc(e.duration)}</small>` : ''}`;
      grid.appendChild(a);
    });
    box.appendChild(grid);
  }

  const currentEp = () => {
    const se = data?.seasons.find(s => s.season === season) || data?.seasons[0];
    return se?.episodes.find(e => e.audio === audio) || se?.episodes[0];
  };

  $('#play').onclick = () => {
    const ep = currentEp();
    if (!ep) return toast('Sem episódios');
    const n = ep.number || 1;
    location.href = `player.html?source=${encodeURIComponent(source)}&slug=${encodeURIComponent(data.slug)}&ep=${n}&season=${season}&audio=${ep.audio}`;
  };

  $('#dls').onclick = async () => {
    const ep = currentEp();
    if (!ep) return toast('Sem episódios');
    toast('Preparando download…');
    try {
      const n = ep.number || 1;
      const d = await json(`${API}/api/streams/${encodeURIComponent(slug)}/${n}?source=${encodeURIComponent(source)}&season=${season}&audio=${ep.audio}`);
      const list = (d.streams || d.sources || []).filter(s => s.url && !isSiteAnimePage(s.url));
      const best = list[list.length - 1];
      if (!best) return toast('Sem arquivo direto para baixar');
      const realUrl = unwrapOEmbed(best.url) || best.url;
      const name = `${slug}-T${season}E${n}-${best.quality}.mp4`.replace(/\s+/g, '_');
      saveFile(realUrl, name);
      store.set('dls', [...store.get('dls', []), { title: data.title, ep: n, quality: best.quality, url: realUrl }].slice(-40));
    } catch { toast('Falha ao preparar download'); }
  };

  $('#fav').onclick = () => {
    if (!data) return;
    const on = toggleFav(data);
    $('#fav').classList.toggle('on', on);
    toast(on ? 'Salvo na lista' : 'Removido');
  };

  $('#like').onclick = () => { $('#like').classList.toggle('on'); toast('Curtido'); };

  $('#share').onclick = async () => {
    const url = location.href;
    try { await navigator.share({ title: data?.title || slug, url }); }
    catch { try { await navigator.clipboard.writeText(url); toast('Link copiado'); } catch { toast(url); } }
  };

  $('#more').onclick = () => {
    const s = $('#syn');
    const open = s.classList.toggle('open');
    $('#more').classList.toggle('up', open);
    $('#more').firstChild.textContent = open ? 'Ver menos ' : 'Ver mais ';
  };

  $$('.tabs [data-tab]').forEach(b => b.onclick = () => {
    $$('.tabs [data-tab]').forEach(x => x.classList.toggle('on', x === b));
    ['eps', 'rel', 'chars'].forEach(t => $('#tab-' + t).classList.toggle('hide', t !== b.dataset.tab));
  });
}

/* ================= PLAYER ================= */
if (document.body.dataset.page === 'player') {
  const p = new URLSearchParams(location.search);
  let source = p.get('source') || store.get('source', 'animesonline');
  let slug = p.get('slug');
  const season = +(p.get('season') || 1);
  let ep = +(p.get('ep') || 1);
  let audio = p.get('audio') || store.get('audio', 'leg');
  let server = store.get('srv', 'native');
  let qualityPref = store.get('quality_pref', 'auto');
  let autoNextPref = store.get('auto_next', 'on');
  let info = null, plyr = null, tries = 0, sourcesList = DEFAULT_SOURCES;

  $('#back').onclick = () => history.length > 1 ? history.back() : location.href = 'index.html';

  async function loadInfo() {
    sourcesList = await fetchSources();
    const order = [source, ...sourcesList.map(s => s.id).filter(id => id !== source)];
    for (const src of order) {
      try {
        const raw = await json(`${API}/api/anime/${encodeURIComponent(slug)}?source=${encodeURIComponent(src)}`);
        if (raw && !raw.error) {
          source = src;
          store.set('source', source);
          info = normAnime({ ...raw, source });
          $('#ptitle').textContent = `${info.title} — EP ${ep}`;
          document.title = $('#ptitle').textContent;
          buildStrip();
          updateServerButtons();
          return;
        }
      } catch {}
    }
    $('#stage').innerHTML = '<p class="empty">Falha ao carregar informações do anime.</p>';
  }

  (async () => {
    await loadInfo();
    await load();
  })();

  function buildStrip() {
    const se = info?.seasons.find(s => s.season === season) || info?.seasons[0];
    $('#strip').innerHTML = '';
    (se?.episodes || []).filter(e => e.audio === audio).forEach((e, idx) => {
      const n = e.number || idx + 1;
      const a = document.createElement('a');
      a.textContent = n;
      a.href = '#';
      a.className = n === ep ? 'on' : '';
      a.onclick = (ev) => {
        ev.preventDefault();
        ep = n;
        tries = 0;
        $('#ptitle').textContent = `${info?.title || slug} — EP ${ep}`;
        buildStrip();
        load();
      };
      $('#strip').appendChild(a);
    });
  }

  function mountFrame(src) {
    const realSrc = unwrapOEmbed(src) || src;
    if (!realSrc || isSiteAnimePage(realSrc)) return false;
    $('#stage').innerHTML = `<iframe src="${esc(realSrc)}" allow="autoplay;fullscreen;encrypted-media;picture-in-picture" allowfullscreen referrerpolicy="no-referrer-when-downgrade" style="width:100%;height:100%;border:0"></iframe>`;
    $('#qbox').innerHTML = '';
    const retry = document.createElement('button');
    retry.className = 'tag';
    retry.textContent = 'Tentar vídeo direto';
    retry.onclick = () => { server = 'native'; store.set('srv', 'native'); tries = 0; load(); };
    $('#qbox').appendChild(retry);
    return true;
  }

  async function resolveStreamWithFallback() {
    sourcesList = await fetchSources();
    const order = [source, ...sourcesList.map(s => s.id).filter(id => id !== source)];
    for (const src of order) {
      try {
        const qs = new URLSearchParams({ source: src, audio, season: String(season), n: String(ep) }).toString();
        const d = await json(`${API}/api/streams/${encodeURIComponent(slug)}/${ep}?${qs}`);
        const list = (d.streams || d.sources || []).filter(s => (s.url || s.proxyUrl) && !isSiteAnimePage(s.url || s.proxyUrl));
        const validIframes = (d.iframes || []).filter(u => u && !isSiteAnimePage(u));
        const embedUrl = unwrapOEmbed((!isSiteAnimePage(d.iframe) ? d.iframe : null) || validIframes[0] || null);
        if (list.length || embedUrl) {
          source = src;
          store.set('source', source);
          updateServerButtons();
          return { d, list, embedUrl };
        }
      } catch {}
    }
    return null;
  }

  async function load() {
    $('#stage').innerHTML = '<p class="empty">Resolvendo episódio…</p>';
    $('#qbox').innerHTML = '';
    try {
      const resolved = await resolveStreamWithFallback();
      if (!resolved) {
        $('#stage').innerHTML = '<p class="empty">Episódio sem stream disponível em nenhum servidor. Tente outro áudio.</p>';
        return;
      }
      const { d, list, embedUrl } = resolved;

      if (server === 'iframe' && embedUrl) {
        if (mountFrame(embedUrl)) {
          store.set('continue', [{ slug, source, title: info?.title || slug, cover: info?.cover, ep },
            ...store.get('continue', []).filter(x => x.slug !== slug)].slice(0, 12));
          return;
        }
      }

      if (!list.length) {
        if (embedUrl && mountFrame(embedUrl)) {
          store.set('continue', [{ slug, source, title: info?.title || slug, cover: info?.cover, ep },
            ...store.get('continue', []).filter(x => x.slug !== slug)].slice(0, 12));
          return;
        }
        $('#stage').innerHTML = '<p class="empty">Episódio sem stream disponível. Tente outro áudio.</p>';
        return;
      }

      let best = list[list.length - 1];
      if (qualityPref !== 'auto') {
        const match = list.find(s => String(s.quality || s.label || '').includes(qualityPref));
        if (match) best = match;
      }

      const rawBestSrc = best.proxyUrl ? `${API}${best.proxyUrl}` : best.url;
      const bestSrc = unwrapOEmbed(rawBestSrc) || rawBestSrc;

      $('#stage').innerHTML = `<div class="adv-player-wrapper" style="position:relative;width:100%;height:100%;background:#000">
        <video id="v" playsinline crossorigin style="width:100%;height:100%;display:block"></video>
        <div class="adv-overlay" style="position:absolute;inset:0;pointer-events:none;display:flex;flex-direction:column;justify-content:space-between;padding:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;pointer-events:auto">
            <span class="ep-badge" style="background:var(--red);color:#fff;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:900">EP ${ep}</span>
          </div>
          <div class="center-btns" style="display:flex;justify-content:center;align-items:center;gap:24px;pointer-events:auto">
            <button id="btn-10s" class="btn dark circle" style="background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.2)" title="-10s">↺ 10</button>
            <button id="btn-playpause" class="btn circle" style="width:52px;height:52px;background:var(--red)" title="Play/Pause">▶</button>
            <button id="btn+10s" class="btn dark circle" style="background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.2)" title="+10s">10 ↻</button>
          </div>
          <div style="display:flex;justify-content:flex-end;align-items:center;gap:12px;pointer-events:auto">
            <label style="font-size:11px;color:#fff;background:rgba(0,0,0,.6);padding:4px 8px;border-radius:6px;display:flex;align-items:center;gap:4px">
              Vol <input id="range-vol" type="range" min="0" max="1" step="0.05" value="1" style="width:60px">
            </label>
            <label style="font-size:11px;color:#fff;background:rgba(0,0,0,.6);padding:4px 8px;border-radius:6px;display:flex;align-items:center;gap:4px">
              Brilho <input id="range-bright" type="range" min="0.3" max="1.7" step="0.05" value="1" style="width:60px">
            </label>
          </div>
        </div>
      </div>`;

      const video = $('#v');
      video.src = bestSrc;
      if (info?.cover) video.poster = info.cover.startsWith('http') ? info.cover : img(info.cover);

      const triggerFullscreen = () => {
        try {
          if (video.requestFullscreen) video.requestFullscreen().catch(() => {});
          else if (video.webkitRequestFullscreen) video.webkitRequestFullscreen();
        } catch {}
      };
      video.addEventListener('play', triggerFullscreen, { once: true });

      video.addEventListener('error', () => {
        if (tries++ < 2) { toast('Link expirou, resolvendo de novo'); load(); return; }
        if (embedUrl && mountFrame(embedUrl)) toast('Trocando para player embed');
        else $('#stage').innerHTML = '<p class="empty">Não foi possível reproduzir este stream.</p>';
      });

      if (window.Plyr) {
        plyr = new Plyr(video, {
          controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'settings', 'pip', 'fullscreen'],
          settings: ['quality', 'speed'],
          quality: { default: +best.itag || 720, options: list.map(s => +s.itag || 720) },
          speed: { selected: 1, options: [0.5, 1, 1.25, 1.5, 2] },
          storage: { enabled: true, key: 'ma-plyr' }
        });
        video.addEventListener('timeupdate', saveProgress);
        if (autoNextPref !== 'off') video.addEventListener('ended', next);
      } else {
        video.controls = true;
        if (autoNextPref !== 'off') video.addEventListener('ended', next);
      }

      $('#btn-10s')?.addEventListener('click', () => { video.currentTime = Math.max(0, video.currentTime - 10); });
      $('#btn+10s')?.addEventListener('click', () => { video.currentTime = Math.min(video.duration || 0, video.currentTime + 10); });
      const ppBtn = $('#btn-playpause');
      if (ppBtn) {
        ppBtn.onclick = () => {
          if (video.paused) { video.play(); ppBtn.textContent = '⏸'; }
          else { video.pause(); ppBtn.textContent = '▶'; }
        };
        video.onplay = () => ppBtn.textContent = '⏸';
        video.onpause = () => ppBtn.textContent = '▶';
      }

      $('#range-vol')?.addEventListener('input', (e) => {
        video.volume = e.target.value;
      });
      $('#range-bright')?.addEventListener('input', (e) => {
        video.style.filter = `brightness(${e.target.value})`;
      });

      list.slice().reverse().forEach(s => {
        const b = document.createElement('button');
        b.className = 'tag';
        b.textContent = s.quality || s.label || 'HD';
        b.onclick = () => {
          const rawSrc = s.proxyUrl ? `${API}${s.proxyUrl}` : s.url;
          const srcUrl = unwrapOEmbed(rawSrc) || rawSrc;
          if (plyr) { plyr.source = { type: 'video', sources: [{ src: srcUrl, type: s.mime || 'video/mp4' }] }; plyr.play(); }
          else { video.src = srcUrl; video.play(); }
          $$('#qbox .tag').forEach(x => x.classList.toggle('on', x === b));
        };
        $('#qbox').appendChild(b);
      });
      $('#qbox').firstChild?.classList.add('on');

      const dl = document.createElement('button');
      dl.className = 'tag dl';
      dl.innerHTML = `${ICONS.dl}Baixar`;
      dl.onclick = () => {
        saveFile(best.url, `${slug}-T${season}E${ep}-${best.quality}.mp4`.replace(/\s+/g, '_'));
        store.set('dls', [...store.get('dls', []), { title: info?.title || slug, ep, quality: best.quality, url: best.url }].slice(-40));
      };
      $('#qbox').appendChild(dl);

      store.set('continue', [{ slug, source, title: info?.title || slug, cover: info?.cover, ep },
        ...store.get('continue', []).filter(x => x.slug !== slug)].slice(0, 12));
    } catch {
      $('#stage').innerHTML = '<p class="empty">Episódio indisponível.</p>';
    }
  }

  function saveProgress() {
    const v = $('#v');
    if (!v || !v.duration) return;
    store.set('pos:' + slug + ':' + ep, v.currentTime);
  }

  function next() {
    const se = info?.seasons.find(s => s.season === season) || info?.seasons[0];
    const list = (se?.episodes || []).filter(e => e.audio === audio);
    const i = list.findIndex(e => (e.number || 0) === ep);
    if (i >= 0 && list[i + 1]) {
      ep = list[i + 1].number || ep + 1;
      tries = 0;
      $('#ptitle').textContent = `${info?.title || slug} — EP ${ep}`;
      buildStrip();
      load();
    }
  }

  $('#next').onclick = next;
  $('#prev').onclick = () => {
    const se = info?.seasons.find(s => s.season === season) || info?.seasons[0];
    const list = (se?.episodes || []).filter(e => e.audio === audio);
    const i = list.findIndex(e => (e.number || 0) === ep);
    if (i > 0) {
      ep = list[i - 1].number || ep - 1;
      tries = 0;
      $('#ptitle').textContent = `${info?.title || slug} — EP ${ep}`;
      buildStrip();
      load();
    }
  };

  $$('#ctrl [data-audio]').forEach(b => {
    b.classList.toggle('on', b.dataset.audio === audio);
    b.onclick = () => {
      audio = b.dataset.audio;
      store.set('audio', audio);
      $$('#ctrl [data-audio]').forEach(x => x.classList.toggle('on', x.dataset.audio === audio));
      buildStrip();
      load();
    };
  });

  function updateServerButtons() {
    if (!sourcesList || !sourcesList.length) sourcesList = DEFAULT_SOURCES;
    $$('#srv-options [data-source-idx]').forEach(b => {
      const idx = +b.dataset.sourceIdx;
      const sObj = sourcesList[idx] || DEFAULT_SOURCES[idx];
      const isCurrent = sObj && sObj.id === source;
      b.classList.toggle('on', isCurrent);
      b.onclick = () => {
        if (!sObj) return;
        source = sObj.id;
        store.set('source', source);
        $('#overlay').classList.remove('on');
        updateServerButtons();
        toast(`Servidor ${idx + 1} selecionado`);
        plyr?.destroy();
        load();
      };
    });
  }

  $('#dim').onclick = () => $('#overlay').classList.remove('on');
  $('#opts').onclick = () => {
    updateServerButtons();
    $('#overlay').classList.add('on');
  };
}
