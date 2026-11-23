/* Mega Anime — front completo */
const API = (window.API_BASE || 'https://mega-la8q.onrender.com').replace(/\/+$/, '');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s = '') => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const img = (u) => (u ? `${API}/img?u=${encodeURIComponent(u)}` : '');

const DEFAULT_SOURCES = [
  { id: 'animesonline', name: 'AnimesOnline' },
  { id: 'animefire', name: 'AnimeFire' },
  { id: 'betteranime', name: 'BetterAnime' },
  { id: 'animesroll', name: 'AnimesRoll' },
  { id: 'anitube', name: 'AniTube' }
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

/* Bloqueia qualquer URL que seja página de detalhes do site (/anime/slug) em vez de player/vídeo */
function isSiteAnimePage(u = '') {
  if (!u) return true;
  try {
    const parsed = new URL(u);
    const isAnimePath = /\/anime\/[^/]+\/?$/i.test(parsed.pathname) && !parsed.searchParams.get('ep');
    const isAnimesOnline = /animesonline/i.test(parsed.hostname) && /\/anime\//i.test(parsed.pathname) && !/video\.g|videoplayback|\.mp4|\.m3u8/i.test(u);
    return isAnimePath || isAnimesOnline;
  } catch {
    return /\/anime\/[^/?#]+$/i.test(String(u));
  }
}

/* ---------- normalizadores ---------- */
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
    genres: Array.isArray(a?.genres) ? a.genres : [],
    audios: [...new Set(flat.map(e => e.audio))],
    episodeCount: a?.episodeCount ?? flat.length,
    seasons
  };
}

async function fetchSources() {
  try {
    const r = await fetch(`${API}/api/sources`);
    const d = await r.json();
    if (Array.isArray(d?.sources) && d.sources.length) return d.sources;
  } catch {}
  return DEFAULT_SOURCES;
}

/* ---------- favoritos ---------- */
const favs = () => store.get('favs', []);
const isFav = (slug) => favs().some(x => x.slug === slug);
function setFav(a, on) {
  const l = favs().filter(x => x.slug !== a.slug);
  if (on) l.unshift({ slug: a.slug, source: a.source || store.get('source', 'animesonline'), title: a.title, cover: cover(a) });
  store.set('favs', l);
  return on;
}
const toggleFav = (a) => setFav(a, !isFav(a.slug));

/* ---------- download ---------- */
function saveFile(url, name) {
  if (!url || isSiteAnimePage(url)) {
    toast('Link direto de vídeo não disponível para download');
    return;
  }
  if (window.Android && window.Android.download) {
    window.Android.download(url, name, 'video/mp4', 'https://www.blogger.com/');
    toast('Baixando em Downloads/MegaAnime');
    return;
  }
  const a = document.createElement('a');
  a.href = url; a.download = name; a.target = '_blank'; a.rel = 'noreferrer';
  a.click();
  toast('Download iniciado');
}

function card(a, ep, srcOverride) {
  const src = a.source || srcOverride || store.get('source', 'animesonline');
  const el = document.createElement('a');
  el.className = 'card';
  el.href = `detail.html?source=${encodeURIComponent(src)}&slug=${encodeURIComponent(a.slug)}`;
  const c = cover(a);
  el.innerHTML = `${ep ? `<span class="ep">EP ${esc(ep)}</span>` : ''}
    ${c ? `<img loading="lazy" src="${img(c)}" alt="${esc(a.title)}">` : '<div style="aspect-ratio:2/3;background:#1b1b22"></div>'}
    <div class="pl"><span>${ICONS.play}</span></div>
    <div class="cap"><b>${esc(a.title)}</b><small>${esc([a.type, a.year].filter(Boolean).join(' • ') || src)}</small></div>`;
  return el;
}

async function json(url) {
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!r.ok && data === null) throw new Error(`HTTP ${r.status}`);
  if (data && data.error && !Array.isArray(data)) throw new Error(data.error);
  return data;
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
    const c = cover(a);
    $('#hero').innerHTML = `${c ? `<img src="${img(c)}" alt="">` : ''}
      <div class="inner">
        <div class="chips"><span class="chip red">Em destaque</span>
          ${a.type ? `<span class="chip">${esc(a.type)}</span>` : ''}
          ${a.year ? `<span class="chip star">${ICONS.star} ${esc(a.year)}</span>` : ''}</div>
        <h2>${esc(a.title)}</h2>
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

  function ensureSourceSelector() {
    if ($('#home-source-select') || !$('#view-home')) return;
    const bar = document.createElement('div');
    bar.className = 'ctrl';
    bar.style.padding = '12px 14px 0';
    bar.innerHTML = `<select id="home-source-select" class="tag">${availableSources.map(s =>
      `<option value="${esc(s.id)}" ${s.id === currentSource ? 'selected' : ''}>Fonte: ${esc(s.name)}</option>`
    ).join('')}</select>`;
    $('#view-home').prepend(bar);
    $('#home-source-select').onchange = (e) => {
      currentSource = e.target.value;
      store.set('source', currentSource);
      page = 1; done = false; busy = false;
      if ($('#catalog')) $('#catalog').innerHTML = '';
      loadHome();
    };
  }

  async function loadHome() {
    availableSources = await fetchSources();
    ensureSourceSelector();

    $('#latest').innerHTML = '<p class="empty">Carregando…</p>';
    $('#top').innerHTML = '';
    $('#added').innerHTML = '';
    try {
      const list = asList(await json(`${API}/api/home?source=${encodeURIComponent(currentSource)}`));
      const uniq = [...new Map(list.map(a => [a.slug, a])).values()];
      if (!uniq.length) throw new Error('vazio');

      heroPool = uniq.slice(0, 8);
      paintHero();
      startHero();
      if (!$('#hero').dataset.wired) { $('#hero').dataset.wired = '1'; heroSwipe(); }

      $('#latest').innerHTML = '';
      uniq.slice(0, 20).forEach(a => $('#latest').appendChild(card(a, null, currentSource)));
      uniq.slice(20, 32).forEach(a => $('#top').appendChild(card(a, null, currentSource)));
      if (!$('#top').children.length) uniq.slice(0, 12).forEach(a => $('#top').appendChild(card(a, null, currentSource)));

      const cat = asList(await json(`${API}/api/catalog?page=1&source=${encodeURIComponent(currentSource)}`));
      (cat.length ? cat : uniq).forEach(a => $('#added').appendChild(card(a, null, currentSource)));

      const cont = store.get('continue', []);
      if (cont.length) {
        $('#continue-wrap').classList.remove('hide');
        $('#continue').innerHTML = '';
        cont.slice(0, 12).forEach(c => $('#continue').appendChild(card(c, c.ep, c.source || currentSource)));
      }
    } catch {
      failBox($('#latest'), 'Falha ao carregar. Tente trocar a fonte no topo ou tentar de novo.', loadHome);
    }
  }
  loadHome();

  const loadMore = async () => {
    if (busy || done) return;
    busy = true;
    try {
      const list = asList(await json(`${API}/api/catalog?page=${++page}&source=${encodeURIComponent(currentSource)}`));
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

  $('#searchbar').onsubmit = async (e) => {
    e.preventDefault();
    const q = $('#q').value.trim();
    if (!q) return;
    show('search');
    const box = $('#results');
    box.innerHTML = '<p class="empty">Buscando em todas as fontes…</p>';
    try {
      const list = asList(await json(`${API}/api/search?q=${encodeURIComponent(q)}`));
      box.innerHTML = '';
      if (!list.length) return failBox(box, `Nada encontrado para "${q}".`);
      list.forEach(a => box.appendChild(card(a, null, a.source || currentSource)));
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

  let seasonsReady = false;
  function initSeasons() {
    const sel = $('#s-year');
    if (sel && !sel.options.length) {
      const y = new Date().getFullYear();
      for (let i = y + 1; i >= y - 6; i--) sel.add(new Option(i, i));
      sel.value = y;
      sel.onchange = () => loadSeason();
      $$('[data-s]').forEach(b => b.onclick = () => {
        $$('[data-s]').forEach(x => x.classList.toggle('on', x === b));
        loadSeason(b.dataset.s);
      });
    }
    if (!seasonsReady) { seasonsReady = true; loadSeason(); }
  }

  async function loadSeason(season) {
    const s = season || $('[data-s].on')?.dataset.s || 'winter';
    const y = $('#s-year')?.value || new Date().getFullYear();
    const box = $('#season-grid');
    box.innerHTML = '<p class="empty">Carregando…</p>';
    try {
      let list = asList(await json(`${API}/api/seasons/${y}/${s}`));
      if (!list.length) list = asList(await json(`${API}/api/calendar`));
      box.innerHTML = '';
      if (!list.length) return failBox(box, 'Nada nesta temporada.', () => loadSeason(s));
      list.forEach(m => {
        const el = document.createElement('a');
        el.className = 'card';
        el.href = '#';
        el.innerHTML = `${m.cover ? `<img loading="lazy" src="${img(m.cover)}" alt="${esc(m.title)}">` : '<div style="aspect-ratio:2/3;background:#1b1b22"></div>'}
          ${m.score ? `<span class="ep">${ICONS.star} ${Number(m.score).toFixed(1)}</span>` : ''}
          <div class="cap"><b>${esc(m.title)}</b><small>${esc(m.type || m.day || '')}</small></div>`;
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
    } catch {
      failBox(box, 'Falha ao carregar temporada.', () => loadSeason(s));
    }
  }

  function renderProfile() {
    $('#p-stats').textContent = `${favs().length} salvos · ${store.get('dls', []).length} downloads`;
    $$('[data-audio]').forEach(b => b.classList.toggle('on', b.dataset.audio === store.get('audio', 'leg')));
    $$('[data-srv]').forEach(b => b.classList.toggle('on', b.dataset.srv === store.get('srv', 'native')));
  }

  $$('[data-audio]').forEach(b => b.onclick = () => { store.set('audio', b.dataset.audio); renderProfile(); });
  $$('[data-srv]').forEach(b => b.onclick = () => { store.set('srv', b.dataset.srv); renderProfile(); });
  $('#wipe').onclick = () => { localStorage.clear(); toast('Dados limpos'); renderProfile(); };
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

  function renderSourceBar(currentTitle) {
    let bar = $('#detail-source-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'detail-source-bar';
      bar.className = 'ctrl';
      bar.style.padding = '10px 14px 4px';
      const anchor = $('.actions') || $('.dhead');
      anchor?.insertAdjacentElement('beforebegin', bar);
    }
    bar.innerHTML = sourcesList.map(s =>
      `<button type="button" class="tag ${s.id === source ? 'on' : ''}" data-src="${esc(s.id)}">${esc(s.name)}</button>`
    ).join('');

    bar.onclick = async (ev) => {
      const btn = ev.target.closest('[data-src]');
      if (!btn || btn.dataset.src === source) return;
      const nextSrc = btn.dataset.src;
      source = nextSrc;
      store.set('source', source);
      toast(`Buscando em ${nextSrc}…`);

      let res = await json(`${API}/api/anime/${encodeURIComponent(slug)}?source=${encodeURIComponent(source)}`).catch(() => null);
      if ((!res || res.error || !(res.seasons || []).length) && (currentTitle || data?.title)) {
        const altSlug = await findBestSlugInSource(source, currentTitle || data?.title);
        if (altSlug) {
          slug = altSlug;
          res = await json(`${API}/api/anime/${encodeURIComponent(slug)}?source=${encodeURIComponent(source)}`).catch(() => null);
        }
      }
      const u = new URL(location.href);
      u.searchParams.set('source', source);
      u.searchParams.set('slug', slug);
      history.replaceState(null, '', u.toString());
      await loadDetail(res);
    };
  }

  async function loadDetail(preloaded) {
    sourcesList = await fetchSources();
    try {
      const raw = preloaded || await json(`${API}/api/anime/${encodeURIComponent(slug)}?source=${encodeURIComponent(source)}`);
      data = normAnime({ ...raw, source });
      document.title = data.title;
      $('#title').textContent = data.title;
      if (data.cover) {
        $('#poster').src = img(data.cover);
        $('#blur').innerHTML = `<img src="${img(data.cover)}" alt="">`;
      }
      $('#syn').textContent = data.synopsis || 'Sem sinopse.';
      $('#genres').innerHTML = `<b>Gênero:</b> ${esc(data.genres.join(', ') || '—')}`;

      const score = (7 + ((data.episodeCount || 12) % 20) / 10).toFixed(1);
      $('#badges').innerHTML = `
        <span class="star">${ICONS.star} ${score}</span>
        <span>${esc(data.year || '—')}</span>
        <span>${data.audios.includes('dub') ? 'DUB' : 'LEG'}</span>
        <span class="red">HD</span>
        <span>${data.episodeCount} eps</span>`;

      renderSourceBar(data.title);
      season = data.seasons[0]?.season || 1;
      paintEps();
      $('#fav').classList.toggle('on', isFav(data.slug));

      json(`${API}/api/similar/${encodeURIComponent(slug)}?source=${encodeURIComponent(source)}`)
        .then(r => {
          const list = asList(r);
          const g = $('#tab-rel .grid');
          g.innerHTML = '';
          if (!list.length) return g.innerHTML = '<p class="empty">Sem semelhantes.</p>';
          list.forEach(a => g.appendChild(card(a, null, source)));
        })
        .catch(() => { $('#tab-rel .grid').innerHTML = '<p class="empty">Sem semelhantes.</p>'; });

      json(`${API}/api/characters/${encodeURIComponent(slug)}?source=${encodeURIComponent(source)}`)
        .then(r => {
          const list = asList(r);
          $('#tab-chars').innerHTML = '';
          if (!list.length) return $('#tab-chars').innerHTML = '<p class="empty">Personagens não encontrados.</p>';
          const g = document.createElement('div');
          g.className = 'chars';
          list.forEach(c => {
            const el = document.createElement('div');
            el.className = 'char';
            el.innerHTML = `${c.image ? `<img loading="lazy" src="${img(c.image)}" alt="${esc(c.name)}">` : ''}<b>${esc(c.name)}</b>`;
            g.appendChild(el);
          });
          $('#tab-chars').appendChild(g);
        })
        .catch(() => { $('#tab-chars').innerHTML = '<p class="empty">Personagens indisponíveis.</p>'; });
    } catch {
      $('#title').textContent = 'Falha ao carregar';
      $('#badges').innerHTML = '<span class="red">erro</span>';
      renderSourceBar('');
    }
  }

  loadDetail();

  function paintEps() {
    const box = $('#tab-eps');
    box.innerHTML = '';
    if (!data) return;
    const se = data.seasons.find(s => s.season === season) || data.seasons[0];
    if (!se) { box.innerHTML = '<p class="empty">Sem episódios disponíveis neste servidor. Troque a fonte acima.</p>'; return; }

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
      const name = `${slug}-T${season}E${n}-${best.quality}.mp4`.replace(/\s+/g, '_');
      saveFile(best.url, name);
      store.set('dls', [...store.get('dls', []), { title: data.title, ep: n, quality: best.quality, url: best.url }].slice(-40));
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
  let audio = p.get('audio') === 'dub' ? 'dub' : store.get('audio', 'leg');
  let server = store.get('srv', 'native');
  let info = null, plyr = null, tries = 0, sourcesList = DEFAULT_SOURCES;

  $('#back').onclick = () => history.length > 1 ? history.back() : location.href = 'index.html';

  function renderPlayerSourceBar() {
    if ($('#player-source-bar') || !$('#ctrl')) return;
    const bar = document.createElement('div');
    bar.id = 'player-source-bar';
    bar.className = 'ctrl';
    bar.style.padding = '0 14px 10px';
    bar.innerHTML = sourcesList.map(s =>
      `<button type="button" class="tag ${s.id === source ? 'on' : ''}" data-psrc="${esc(s.id)}">${esc(s.name)}</button>`
    ).join('');
    $('#ctrl').insertAdjacentElement('afterend', bar);

    bar.onclick = async (ev) => {
      const btn = ev.target.closest('[data-psrc]');
      if (!btn || btn.dataset.psrc === source) return;
      source = btn.dataset.psrc;
      store.set('source', source);
      [...bar.children].forEach(x => x.classList.toggle('on', x === btn));
      toast(`Trocando para ${source}…`);
      tries = 0;
      plyr?.destroy();
      await loadInfo();
      await load();
    };
  }

  async function loadInfo() {
    try {
      info = normAnime(await json(`${API}/api/anime/${encodeURIComponent(slug)}?source=${encodeURIComponent(source)}`));
      $('#ptitle').textContent = `${info.title} — EP ${ep}`;
      document.title = $('#ptitle').textContent;
      buildStrip();
    } catch {
      $('#stage').innerHTML = '<p class="empty">Falha ao carregar informações do anime.</p>';
    }
  }

  (async () => {
    sourcesList = await fetchSources();
    renderPlayerSourceBar();
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

  /* Só monta iframe se for embed de vídeo/player real e NUNCA página /anime/... do site */
  function mountFrame(src) {
    if (!src || isSiteAnimePage(src)) return false;
    $('#stage').innerHTML = `<iframe src="${esc(src)}" allow="autoplay;fullscreen;encrypted-media;picture-in-picture" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>`;
    $('#qbox').innerHTML = '';
    const retry = document.createElement('button');
    retry.className = 'tag';
    retry.textContent = 'Tentar vídeo direto';
    retry.onclick = () => { server = 'native'; store.set('srv', 'native'); tries = 0; load(); };
    $('#qbox').appendChild(retry);
    return true;
  }

  async function load() {
    $('#stage').innerHTML = '<p class="empty">Resolvendo episódio…</p>';
    $('#qbox').innerHTML = '';
    try {
      const d = await json(`${API}/api/streams/${encodeURIComponent(slug)}/${ep}?source=${encodeURIComponent(source)}&season=${season}&audio=${audio}`);
      const list = (d.streams || d.sources || []).filter(s => s.url && !isSiteAnimePage(s.url));
      const validIframes = (d.iframes || []).filter(u => u && !isSiteAnimePage(u));
      const embedUrl = (!isSiteAnimePage(d.iframe) ? d.iframe : null) || validIframes[0] || null;

      if (!list.length) {
        if (embedUrl && mountFrame(embedUrl)) {
          store.set('continue', [{ slug, source, title: info?.title || slug, cover: info?.cover, ep },
            ...store.get('continue', []).filter(x => x.slug !== slug)].slice(0, 12));
          return;
        }
        $('#stage').innerHTML = '<p class="empty">Episódio sem stream disponível nesta fonte. Troque o servidor acima ou tente outro áudio.</p>';
        return;
      }

      if (server === 'iframe' && embedUrl) {
        if (mountFrame(embedUrl)) return;
      }

      const best = list[list.length - 1];
      const bestSrc = best.proxyUrl ? `${API}${best.proxyUrl}` : best.url;
      $('#stage').innerHTML = '<video id="v" playsinline crossorigin></video>';
      const video = $('#v');
      video.src = bestSrc;
      if (info?.cover) video.poster = img(info.cover);

      video.addEventListener('error', () => {
        if (tries++ < 2) { toast('Link expirou, resolvendo de novo'); load(); return; }
        if (embedUrl && mountFrame(embedUrl)) toast('Trocando para player embed');
        else $('#stage').innerHTML = '<p class="empty">Não foi possível reproduzir este stream. Troque o servidor acima.</p>';
      });

      if (window.Plyr) {
        plyr = new Plyr(video, {
          controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'settings', 'pip', 'fullscreen'],
          settings: ['quality', 'speed'],
          quality: { default: +best.itag || 720, options: list.map(s => +s.itag || 720) },
          speed: { selected: 1, options: [0.75, 1, 1.25, 1.5, 2] },
          storage: { enabled: true, key: 'ma-plyr' }
        });
        video.addEventListener('timeupdate', saveProgress);
        video.addEventListener('ended', next);
      } else {
        video.controls = true;
        video.addEventListener('ended', next);
      }

      list.slice().reverse().forEach(s => {
        const b = document.createElement('button');
        b.className = 'tag';
        b.textContent = s.quality || s.label || 'HD';
        b.onclick = () => {
          const srcUrl = s.proxyUrl ? `${API}${s.proxyUrl}` : s.url;
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
      $('#stage').innerHTML = '<p class="empty">Episódio indisponível neste servidor. Troque a fonte acima.</p>';
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
      $$('[data-audio]').forEach(x => x.classList.toggle('on', x.dataset.audio === audio));
      $('#overlay').classList.remove('on');
      buildStrip();
      load();
    };
  });

  const srvLabel = () => `Servidor: ${server === 'native' ? 'nativo' : 'iframe'}`;
  $('#srv').innerHTML = `${ICONS.layers}`;
  $('#srv').title = srvLabel();
  $('#srv').onclick = () => {
    server = server === 'native' ? 'iframe' : 'native';
    store.set('srv', server);
    $('#srv').title = srvLabel();
    toast(srvLabel());
    plyr?.destroy();
    load();
  };

  $$('[data-srv]').forEach(b => {
    b.classList.toggle('on', b.dataset.srv === server);
    b.onclick = () => {
      server = b.dataset.srv;
      store.set('srv', server);
      $$('[data-srv]').forEach(x => x.classList.toggle('on', x === server));
      $('#overlay').classList.remove('on');
      plyr?.destroy();
      load();
    };
  });

  $('#dim').onclick = () => $('#overlay').classList.remove('on');
  $('#opts').onclick = () => $('#overlay').classList.add('on');
}