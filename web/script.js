/* Mega Anime — Refactored & Optimized with Jikan Fallback, Servidores 1-5, Fast Home, Calendar 2030 & Preferences */
const API = (window.API_BASE || 'https://mega-la8q.onrender.com').replace(/\/+$/, '');
const SITE_BASE = 'https://carlin-dark.github.io/Mega-Anime/';
const SHARE_BASE = SITE_BASE + 'share.html';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s = '') => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const img = (u) => (u ? `${API}/img?u=${encodeURIComponent(u)}` : '');

/* FIX: bg.mp4 / assets de tema não são episódio */
const JUNK_RE = /(?:^|[/_\-.])(bg|background|banner|poster|thumb|thumbnail|trailer|placeholder|preview|sprite)(?:[-_.][\w-]+)?\.(?:mp4|webm|m4v|ogv)(?:[?#]|$)/i;
const ASSET_RE = /(?:\/wp-content\/|\/assets\/|\/static\/|\/tema\/|\/themes\/|\/img\/|\/images\/)[^?#]*\.(?:mp4|webm|m4v)(?:[?#]|$)/i;
const isJunkMedia = (u = '') => {
  const s = String(u || '');
  if (!s) return true;
  return /\/bg\.mp4/i.test(s) || JUNK_RE.test(s) || ASSET_RE.test(s);
};
const isBloggerEmbed = (u = '') => /blogger\.com\/video\.g|video\.g\?token=/i.test(String(u || ''));

/* FIX: item sem capa quebrando a home */
const JUJUTSU_RE = /jujutsu/i;
const isJujutsu = (a = {}) => JUJUTSU_RE.test(`${a.title || ''} ${a.slug || ''} ${a.id || ''}`);
const dropJujutsu = (list = []) => (Array.isArray(list) ? list : []).filter(a => a && !isJujutsu(a));
const PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450"><rect width="300" height="450" fill="#15151c"/><text x="150" y="230" fill="#5a5a6a" font-family="sans-serif" font-size="18" text-anchor="middle">Sem capa</text></svg>');

const DEFAULT_SOURCES = [
  { id: 'animesonlinecc', name: 'Servidor 1' },
  { id: 'animesonline', name: 'Servidor 2' },
  { id: 'animefire', name: 'Servidor 3' },
  { id: 'betteranime', name: 'Servidor 4' },
  { id: 'animesroll', name: 'Servidor 5' }
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

/* ===== link público de compartilhamento (abre no site, que tenta abrir o app) ===== */
function shareUrl(params = {}) {
  const q = new URLSearchParams();
  ['source', 'slug', 'season', 'ep', 'audio'].forEach((k) => {
    const v = params[k];
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  });
  return `${SHARE_BASE}?${q.toString()}`;
}

async function copyShare(url, title) {
  if (navigator.share) {
    try { await navigator.share({ title: title || 'MEGA ANIME', text: title || '', url }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(url); toast('Link copiado'); }
  catch { window.prompt('Copie o link:', url); }
}

/* Robust Poster Fallback via Jikan API & AniList */
const posterFallbackCache = {};
async function getPosterFallback(title) {
  if (!title) return null;
  const clean = String(title).replace(/\b(dub\w*|leg\w*|temporada\w*|\d+ª?|eps?\.?\s*\d+)\b/gi, '').trim();
  if (posterFallbackCache[clean]) return posterFallbackCache[clean];

  try {
    const r = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(clean)}&limit=1`);
    const d = await r.json();
    const url = d?.data?.[0]?.images?.jpg?.large_image_url || d?.data?.[0]?.images?.jpg?.image_url;
    if (url) {
      posterFallbackCache[clean] = url;
      return url;
    }
  } catch {}

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

/* ===== Jikan como catálogo de apoio (busca e detalhe) ===== */
const cleanTitle = (t = '') => String(t).replace(/\b(dub\w*|leg\w*|temporada\w*|\d+ª?|eps?\.?\s*\d+)\b/gi, '').trim();

async function jikanSearch(q, limit = 12) {
  try {
    const r = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(cleanTitle(q))}&limit=${limit}&sfw`);
    const d = await r.json();
    return (d?.data || []).map((i) => ({
      title: i.title_english || i.title,
      cover: i.images?.jpg?.large_image_url || i.images?.jpg?.image_url || null,
      year: i.year || null,
      type: i.type || null,
      score: i.score || null,
      external: true
    }));
  } catch { return []; }
}

async function jikanLookup(q) {
  const list = await jikanSearch(q, 1);
  if (!list.length) return null;
  try {
    const r = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(cleanTitle(q))}&limit=1&sfw`);
    const d = await r.json();
    const hit = d?.data?.[0];
    if (!hit) return { ...list[0], synopsis: '', genres: [], malId: null };
    return {
      title: hit.title_english || hit.title,
      cover: hit.images?.jpg?.large_image_url || hit.images?.jpg?.image_url || null,
      year: hit.year || null,
      type: hit.type || null,
      score: hit.score || null,
      synopsis: hit.synopsis || '',
      genres: (hit.genres || []).map((g) => g.name),
      malId: hit.mal_id || null,
      external: true
    };
  } catch { return { ...list[0], synopsis: '', genres: [], malId: null }; }
}

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

/* FIX: rotação estável por dia (mesma ordem durante o dia, muda no dia seguinte) */
const daySeed = () => Math.floor(Date.now() / 86400000);
const rotateList = (arr = [], by = 0) => {
  if (!arr.length) return [];
  const n = ((by % arr.length) + arr.length) % arr.length;
  return arr.slice(n).concat(arr.slice(0, n));
};
const debounce = (fn, ms = 500) => {
  let t = null;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};
const normText = (s = '') => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

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
  const coverUrl = c ? (c.startsWith('http') ? esc(c) : img(c)) : PLACEHOLDER;
  el.innerHTML = `${ep ? `<span class="ep">EP ${esc(ep)}</span>` : ''}
    <img loading="lazy" src="${coverUrl}" alt="${titleEsc}" onerror="this.onerror=null; getPosterFallback('${titleEsc}').then(u=>{this.src=u||'${PLACEHOLDER}'});">
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

/* card de resultado externo (Jikan) — ao clicar procura nas fontes */
function extCard(m, onPick) {
  const el = document.createElement('a');
  el.className = 'card';
  el.href = '#';
  const titleEsc = esc(m.title || '');
  el.innerHTML = `<span class="ep">Externo</span>
    <img loading="lazy" src="${esc(m.cover || PLACEHOLDER)}" alt="${titleEsc}" onerror="this.onerror=null; this.src='${PLACEHOLDER}';">
    <div class="cap"><b>${titleEsc}</b><small>${esc([m.type, m.year].filter(Boolean).join(' • ') || 'Jikan')}</small></div>`;
  el.onclick = (e) => { e.preventDefault(); onPick(m); };
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
const json = (u) => jsonWithTimeout(u, 15000);

/* FIX: detalhe e busca podem ser lentos (o servidor tem budget maior) */
const jsonSlow = (u) => jsonWithTimeout(u, 30000);
const jsonSearch = (u) => jsonWithTimeout(u, 30000);

/* FIX: busca tolerante — nunca lança, sempre devolve algo (ou null) */
async function jsonSoft(url, ms = 30000) {
  try { return await jsonWithTimeout(url, ms); } catch { return null; }
}

/* FIX: requisição fresca — sem HTML/token/URL de vídeo em cache */
async function jsonFresh(url, ms = 14000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const r = await fetch(url, {
      cache: 'no-store',
      headers: { accept: 'application/json', 'cache-control': 'no-cache, no-store', pragma: 'no-cache' },
      signal: controller.signal
    });
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

  const fillRail = (sel, list, src) => {
    const el = $(sel);
    if (!el) return;
    el.innerHTML = '';
    list.forEach(a => el.appendChild(card(a, null, src)));
  };

  /* FIX: "Em Alta" com preenchimento garantido — nunca deixa a seção vazia */
  function paintTop(primary = [], fallbackPool = []) {
    const el = $('#top');
    if (!el) return;
    let list = dropJujutsu(primary.filter(Boolean));
    if (list.length < 8) {
      const pool = dropJujutsu(fallbackPool.filter(Boolean)).filter(a => !list.some(x => x.slug === a.slug));
      list = list.concat(rotateList(pool, daySeed()).slice(0, 24 - list.length));
    }
    if (!list.length) {
      el.innerHTML = '<p class="empty">Sem destaques agora.</p>';
      return;
    }
    el.innerHTML = '';
    list.slice(0, 24).forEach(a => el.appendChild(card(a, null, currentSource)));
  }

  async function loadHome() {
    /* FIX: Jujutsu Kaisen vem da API sem capa e quebra o visual da home */
    const cachedHome = dropJujutsu(store.get('cache_home_' + currentSource) || []);
    const cachedTop = dropJujutsu(store.get('cache_top_' + currentSource) || []);
    if (cachedHome.length) {
      heroPool = cachedHome.slice(0, 8);
      paintHero();
      startHero();
      fillRail('#latest', cachedHome.slice(0, 20), currentSource);
      paintTop(cachedTop, cachedHome);
      fillRail('#added', cachedHome.slice(0, 12), currentSource);
    } else {
      $('#latest').innerHTML = '<p class="empty">Carregando episódios…</p>';
    }

    const cont = dropJujutsu(store.get('continue', []));
    if (cont.length) {
      $('#continue-wrap').classList.remove('hide');
      $('#continue').innerHTML = '';
      cont.slice(0, 12).forEach(c => $('#continue').appendChild(card(c, c.ep, c.source || currentSource)));
    }

    try {
      /* FIX: timeouts compatíveis com o budget do servidor (5s abortava tudo) */
      const [sourcesRes, homeRes, topRes] = await Promise.allSettled([
        fetchSources(),
        jsonWithTimeout(`${API}/api/home?source=${encodeURIComponent(currentSource)}`, 15000),
        jsonWithTimeout(`${API}/api/trending?source=${encodeURIComponent(currentSource)}`, 12000)
      ]);

      if (sourcesRes.status === 'fulfilled' && sourcesRes.value) {
        availableSources = sourcesRes.value;
      }

      let list = [];
      let topList = [];
      if (homeRes.status === 'fulfilled' && homeRes.value) {
        const sections = homeRes.value.sections || [];
        const latestSec = sections.find(s => s.id === 'latest');
        list = dropJujutsu(latestSec?.items || asList(homeRes.value));
        topList = dropJujutsu(sections.find(s => s.id === 'top')?.items || []);
      }
      if (topRes.status === 'fulfilled' && topRes.value) {
        topList = dropJujutsu(topList.concat(asList(topRes.value)));
      }

      if (!list.length) {
        for (const s of availableSources) {
          if (s.id === currentSource) continue;
          try {
            const fallbackRes = await jsonWithTimeout(`${API}/api/home?source=${encodeURIComponent(s.id)}`, 12000);
            const secs = fallbackRes?.sections || [];
            list = dropJujutsu(secs.find(x => x.id === 'latest')?.items || asList(fallbackRes));
            topList = dropJujutsu(topList.concat(secs.find(x => x.id === 'top')?.items || []));
            if (list.length) {
              currentSource = s.id;
              store.set('source', currentSource);
              break;
            }
          } catch {}
        }
      }

      /* FIX: filtro por título, slug e id antes de qualquer render */
      const uniq = dropJujutsu([...new Map(list.map(a => [a.slug, a])).values()]);
      if (!uniq.length && !cachedHome.length) throw new Error('vazio');

      if (uniq.length) {
        store.set('cache_home_' + currentSource, uniq);
        heroPool = uniq.slice(0, 8);
        paintHero();
        startHero();
        if (!$('#hero').dataset.wired) { $('#hero').dataset.wired = '1'; heroSwipe(); }

        fillRail('#latest', uniq.slice(0, 20), currentSource);
        paintTop([...new Map(topList.map(a => [a.slug, a])).values()], uniq);
        if (topList.length) store.set('cache_top_' + currentSource, topList.slice(0, 24));
        fillRail('#added', uniq.slice(0, 20), currentSource);
      }
    } catch {
      if (!cachedHome.length) failBox($('#latest'), 'Falha ao carregar. Tentar de novo.', loadHome);
    }
  }
  loadHome();

  const loadMore = async () => {
    if (busy || done) return;
    busy = true;
    try {
      const list = dropJujutsu(asList(await jsonWithTimeout(`${API}/api/catalog?page=${++page}&source=${encodeURIComponent(currentSource)}`, 12000)));
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

    /* FIX: header e barra de busca continuam visíveis na busca (antes sumiam e travavam a tela) */
    const showTop = v === 'home' || v === 'search';
    $('.top')?.classList.toggle('hide', !showTop);
    $('#searchbar')?.classList.toggle('hide', v !== 'search');

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

  $('#btn-search').onclick = () => {
    const bar = $('#searchbar');
    bar.classList.toggle('hide');
    if (!bar.classList.contains('hide')) $('#q').focus();
  };
  $('#btn-bell').onclick = () => { show('home'); toast('Novos episódios na Home'); };

  /* ===== busca: agregado -> por fonte -> catálogo -> Jikan (nunca erro seco) ===== */
  let searchSeq = 0;

  const searchAcrossSources = async (q) => {
    const sources = await fetchSources();
    const settled = await Promise.allSettled(
      sources.map(s => jsonSoft(`${API}/api/search?q=${encodeURIComponent(q)}&source=${s.id}&_t=${Date.now()}`))
    );
    const out = [];
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value) {
        asList(r.value).forEach(item => out.push({ ...item, source: item.source || sources[i].id }));
      }
    });
    return out;
  };

  const searchCatalog = async (q) => {
    const nq = normText(q);
    const out = [];
    for (const p of [1, 2, 3]) {
      const d = await jsonSoft(`${API}/api/catalog?page=${p}&source=${encodeURIComponent(currentSource)}`, 20000);
      const items = asList(d);
      if (!items.length) break;
      items.forEach((i) => {
        const n = normText(i.title || i.slug);
        if (nq && (n.includes(nq) || nq.includes(n))) out.push({ ...i, source: currentSource });
      });
      if (out.length >= 12) break;
    }
    return out;
  };

  const openExternal = async (m) => {
    toast('Procurando nas fontes…');
    const hits = dropJujutsu(await searchAcrossSources(m.title));
    const best = hits[0];
    if (best?.slug) {
      location.href = `detail.html?source=${encodeURIComponent(best.source || currentSource)}&slug=${encodeURIComponent(best.slug)}`;
      return;
    }
    const local = dropJujutsu(await searchCatalog(m.title));
    if (local[0]?.slug) {
      location.href = `detail.html?source=${encodeURIComponent(currentSource)}&slug=${encodeURIComponent(local[0].slug)}`;
      return;
    }
    toast('Não disponível nas fontes');
  };

  const renderResults = (box, list) => {
    box.innerHTML = '';
    list.forEach(a => box.appendChild(a.external ? extCard(a, openExternal) : card(a, null, a.source || currentSource)));
  };

  const runSearch = async (raw) => {
    const q = String(raw || '').trim();
    if (q.length < 2) return;
    const seq = ++searchSeq;
    show('search');
    $('#searchbar').classList.remove('hide');
    $('#q').value = q;

    const box = $('#results');
    const cacheKey = 'cache_search_' + q.toLowerCase();
    const cached = store.get(cacheKey);
    if (cached && cached.length) renderResults(box, cached);
    else box.innerHTML = '<p class="empty">Buscando em todas as fontes…</p>';

    const step = (msg) => { if (seq === searchSeq) box.innerHTML = `<p class="empty">${esc(msg)}</p>`; };

    let list = [];

    /* 1) endpoint agregado (tolerante a falha) */
    const agg = await jsonSoft(`${API}/api/search?q=${encodeURIComponent(q)}&_t=${Date.now()}`);
    if (seq !== searchSeq) return;
    list = dropJujutsu(asList(agg));

    /* 2) fonte por fonte */
    if (!list.length) {
      step('Ainda buscando… tentando cada servidor.');
      list = dropJujutsu(await searchAcrossSources(q));
      if (seq !== searchSeq) return;
    }

    /* 3) varredura do catálogo local */
    if (!list.length) {
      step('Ainda buscando… varrendo o catálogo.');
      list = dropJujutsu(await searchCatalog(q));
      if (seq !== searchSeq) return;
    }

    list = [...new Map(list.map(i => [i.slug || i.title, i])).values()];

    /* 4) Jikan como último recurso — resultados externos clicáveis */
    if (!list.length) {
      step('Nada nas fontes. Buscando no catálogo externo…');
      const ext = await jikanSearch(q, 12);
      if (seq !== searchSeq) return;
      if (!ext.length) {
        return failBox(box, `Nada encontrado para "${q}".`, () => runSearch(q));
      }
      renderResults(box, ext);
      return;
    }

    store.set(cacheKey, list.slice(0, 60));
    renderResults(box, list);
  };

  $('#searchbar').addEventListener('submit', (e) => {
    e.preventDefault();
    runSearch($('#q').value);
  });
  $('#q').addEventListener('input', debounce((e) => {
    const v = e.target.value.trim();
    if (v.length >= 3) runSearch(v);
  }, 600));

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
  let currentSeasonReqId = 0;

  function initSeasons() {
    const sel = $('#s-year');
    if (sel) {
      if (!sel.options.length) {
        for (let i = 2030; i >= 2000; i--) sel.add(new Option(i, i));
        sel.value = Math.min(2030, new Date().getFullYear());
      }
      sel.classList.add('hide');
      buildYearPicker(sel);
      sel.onchange = () => { syncYearLabel(sel); loadSeason(); };
      $$('[data-s]').forEach(b => b.onclick = () => {
        $$('[data-s]').forEach(x => x.classList.toggle('on', x === b));
        loadSeason(b.dataset.s);
      });
    }
    if (!seasonsReady) { seasonsReady = true; loadSeason(); }
  }

  function buildYearPicker(sel) {
    if ($('#yearpick')) { syncYearLabel(sel); return; }
    const wrap = document.createElement('div');
    wrap.className = 'yearpick-wrap';
    wrap.innerHTML = `<button type="button" class="yearpick-btn" id="yearpick-btn" aria-haspopup="dialog">
        <span id="yearpick-label"></span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:14px;height:14px"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      <div class="yearpick" id="yearpick" role="dialog" aria-label="Escolher ano">
        <div class="yearpick-head"><b>Escolha o ano</b>
          <button type="button" class="yearpick-x" id="yearpick-x" aria-label="Fechar">${ICONS.x}</button>
        </div>
        <div class="yearpick-grid" id="yearpick-grid"></div>
      </div>`;
    sel.parentElement.insertBefore(wrap, sel.nextSibling);

    const grid = $('#yearpick-grid');
    for (let y = 2030; y >= 2000; y--) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'yearpick-i';
      b.textContent = y;
      b.dataset.y = String(y);
      b.onclick = () => {
        sel.value = String(y);
        syncYearLabel(sel);
        $('#yearpick').classList.remove('on');
        loadSeason();
      };
      grid.appendChild(b);
    }
    $('#yearpick-btn').onclick = () => { $('#yearpick').classList.toggle('on'); syncYearLabel(sel); };
    $('#yearpick-x').onclick = () => $('#yearpick').classList.remove('on');
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.yearpick-wrap')) $('#yearpick')?.classList.remove('on');
    });
    syncYearLabel(sel);
  }

  function syncYearLabel(sel) {
    const lbl = $('#yearpick-label');
    if (lbl) lbl.textContent = sel.value;
    $$('#yearpick-grid .yearpick-i').forEach(b => b.classList.toggle('on', b.dataset.y === String(sel.value)));
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
      list = asList(await jsonWithTimeout(`${API}/api/calendar?year=${y}&season=${s}`, 14000).catch(() => null));

      if (!list.length) {
        const j = await jsonWithTimeout(`https://api.jikan.moe/v4/seasons/${y}/${s}?limit=24&sfw`, 12000).catch(() => null);
        if (Array.isArray(j?.data)) {
          list = j.data.map(item => ({
            title: item.title,
            cover: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url,
            score: item.score,
            type: item.type,
            year: y
          }));
        }
      }

      if (!list.length) {
        const homeList = asList(await jsonWithTimeout(`${API}/api/home?source=${encodeURIComponent(currentSource)}`, 9000).catch(() => null));
        list = homeList.filter(a => !a.year || String(a.year) === String(y));
        if (!list.length) list = homeList;
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

  function renderProfile() {
    if ($('#p-stats')) $('#p-stats').textContent = `${favs().length} salvos · ${store.get('dls', []).length} downloads`;

    const prefAudio = store.get('audio', 'leg');
    $$('[data-pref-audio]').forEach(b => b.classList.toggle('on', b.dataset.prefAudio === prefAudio));

    const prefSrvIdx = store.get('srv_idx', '0');
    $$('[data-pref-srv]').forEach(b => b.classList.toggle('on', b.dataset.prefSrv === String(prefSrvIdx)));

    const prefQual = store.get('quality_pref', 'auto');
    $$('[data-pref-qual]').forEach(b => b.classList.toggle('on', b.dataset.prefQual === prefQual));

    const prefAutoNext = store.get('auto_next', 'on');
    $$('[data-pref-autonext]').forEach(b => b.classList.toggle('on', b.dataset.prefAutonext === prefAutoNext));

    const prefAutoFs = store.get('auto_fs', 'on');
    $$('[data-pref-autofs]').forEach(b => b.classList.toggle('on', b.dataset.prefAutofs === prefAutoFs));
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

  $$('[data-pref-autofs]').forEach(b => b.onclick = () => {
    store.set('auto_fs', b.dataset.prefAutofs);
    renderProfile();
    toast('Tela Cheia Automática atualizada');
  });

  if ($('#wipe')) {
    $('#wipe').onclick = () => {
      if (confirm('Deseja realmente apagar todo o histórico, salvos e preferências localmente?')) {
        localStorage.clear();
        toast('Dados limpos');
        renderProfile();
      }
    };
  }
}

/* ================= DETALHE ================= */
if (document.body.dataset.page === 'detail') {
  /* FIX: aceita detail.html?... , megaanime://detail?... e share.html?... */
  const normalizeParams = () => {
    const fromSearch = new URLSearchParams(location.search);
    if (fromSearch.get('slug')) return fromSearch;
    const fromHash = new URLSearchParams(String(location.hash || '').replace(/^#\??/, ''));
    if (fromHash.get('slug')) return fromHash;
    const raw = String(location.href || '');
    const qs = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
    return new URLSearchParams(qs.replace(/#.*$/, ''));
  };

  const params = normalizeParams();
  let source = params.get('source') || store.get('source', 'animesonline');
  let slug = params.get('slug');
  let data = null, season = +(params.get('season') || 1), audio = params.get('audio') || store.get('audio', 'leg');
  let sourcesList = DEFAULT_SOURCES;
  const initialSlug = slug;

  $('#back').onclick = () => history.length > 1 ? history.back() : location.href = 'index.html';

  function detailError() {
    $('#title').textContent = 'Anime não encontrado';
    $('#badges').innerHTML = '<span class="red">indisponível</span>';
    $('#syn').textContent = 'Não foi possível carregar os detalhes deste anime em nenhum servidor.';
  }

  function renderDetail(raw, opts = {}) {
    if (!raw) return;
    try {
      data = normAnime({ ...raw, source });
      document.title = data.title;
      $('#title').textContent = data.title;

      let posterUrl = data.cover ? (data.cover.startsWith('http') ? data.cover : img(data.cover)) : null;
      if (!posterUrl) {
        getPosterFallback(data.title).then(u => {
          if (u) {
            $('#poster').src = u;
            $('#blur').innerHTML = `<img src="${u}" alt="">`;
          }
        });
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

      /* FIX: sinopse/gêneros/episódios sempre do scrape — Jikan só entra em capa e personagens */
      $('#syn').textContent = data.synopsis || 'Sem sinopse.';
      $('#genres').innerHTML = `<b>Gênero:</b> ${esc(data.genres.join(', ') || '—')}`;

      const score = data.score ? Number(data.score).toFixed(1) : (7 + ((data.episodeCount || 12) % 20) / 10).toFixed(1);
      $('#badges').innerHTML = `
        <span class="star">${ICONS.star} ${score}</span>
        <span>${esc(data.year || '—')}</span>
        <span>${data.audios.includes('dub') ? 'DUB' : 'LEG'}</span>
        <span class="red">HD</span>
        <span>${data.episodeCount} eps</span>`;

      if (data.seasons.length) season = data.seasons[0]?.season || 1;
      paintEps();
      $('#fav').classList.toggle('on', isFav(data.slug));

      if (!opts.similarDone) {
        loadSimilar();
        loadChars();
      }
    } catch {
      $('#title').textContent = 'Falha ao carregar';
      $('#badges').innerHTML = '<span class="red">erro</span>';
    }
  }

  /* FIX: quando o scrape falha de vez, a página é preenchida com o catálogo externo */
  function renderExternal(ext) {
    data = null;
    document.title = ext.title || initialSlug;
    $('#title').textContent = ext.title || initialSlug;
    $('#syn').textContent = ext.synopsis || 'Sinopse indisponível no catálogo externo.';
    $('#genres').innerHTML = `<b>Gênero:</b> ${esc((ext.genres || []).join(', ') || '—')}`;
    $('#badges').innerHTML = `
      <span class="red">catálogo externo</span>
      ${ext.year ? `<span>${esc(ext.year)}</span>` : ''}
      ${ext.type ? `<span>${esc(ext.type)}</span>` : ''}
      ${ext.score ? `<span class="star">${ICONS.star} ${Number(ext.score).toFixed(1)}</span>` : ''}`;

    if (ext.cover) {
      $('#poster').src = esc(ext.cover);
      $('#blur').innerHTML = `<img src="${esc(ext.cover)}" alt="">`;
    } else {
      $('#poster').src = PLACEHOLDER;
    }

    $('#tab-eps').innerHTML = '<p class="empty">Episódios indisponíveis neste servidor. Tente outra fonte abaixo.</p>';
    $('#tab-rel').innerHTML = '<div class="grid"></div>';

    const box = $('#tab-eps');
    const retry = document.createElement('button');
    retry.className = 'btn dark';
    retry.style.margin = '0 0 20px';
    retry.textContent = 'Procurar em outras fontes';
    retry.onclick = async () => {
      retry.textContent = 'Procurando…';
      const hits = await scrapeByTitle([source, ...sourcesList.map(s => s.id).filter(id => id !== source)], ext.title);
      if (!hits.length) { retry.textContent = 'Procurar em outras fontes'; toast('Nada encontrado nas fontes'); return; }
      applyHit(hits[0]);
    };
    box.appendChild(retry);

    if (ext.malId) loadCharsFor(ext.malId, ext.title);
    else $('#tab-chars').innerHTML = '<p class="empty">Personagens indisponíveis.</p>';
  }

  async function scrapeAll(order, sl) {
    const settled = await Promise.allSettled(
      order.map(src => jsonSlow(`${API}/api/anime/${encodeURIComponent(sl)}?source=${encodeURIComponent(src)}&_t=${Date.now()}`)
        .then(res => ({ src, res })))
    );
    return settled
      .filter(x => x.status === 'fulfilled' && x.value?.res && !x.value.res.error &&
        (((x.value.res.seasons || []).length) || x.value.res.title))
      .map(x => x.value);
  }

  async function scrapeByTitle(order, title) {
    const hits = [];
    for (const src of order) {
      const found = asList(await jsonSoft(`${API}/api/search?q=${encodeURIComponent(title)}&source=${encodeURIComponent(src)}`, 20000));
      const n = normText(title);
      const match = found.find((i) => {
        const it = normText(i.title || i.slug);
        return it === n || it.includes(n) || n.includes(it);
      }) || found[0];
      if (!match?.slug) continue;
      const res = await jsonSoft(`${API}/api/anime/${encodeURIComponent(match.slug)}?source=${encodeURIComponent(src)}`, 25000);
      if (res && !res.error && ((res.seasons || []).length || res.title)) hits.push({ src, res });
      if (hits.length) break;
    }
    return hits;
  }

  function applyHit(hit) {
    source = hit.src;
    store.set('source', source);
    slug = hit.res.slug || slug;
    store.set('cache_detail_' + source + ':' + slug, hit.res);
    store.set('cache_detail_' + source + ':' + (initialSlug || slug), hit.res);
    history.replaceState(null, '', `detail.html?source=${encodeURIComponent(source)}&slug=${encodeURIComponent(slug)}`);
    renderDetail(hit.res);
  }

  async function loadDetail() {
    sourcesList = await fetchSources();
    const order = [source, ...sourcesList.map(s => s.id).filter(id => id !== source)];

    /* FIX: mostra o scrape já salvo na hora, sem esperar rede */
    const cacheKey = 'cache_detail_' + source + ':' + initialSlug;
    const cached = store.get(cacheKey);
    if (cached) renderDetail(cached);

    /* 1) scrape em paralelo, 30s */
    let hits = await scrapeAll(order, initialSlug);
    if (hits.length) { applyHit(order.map(id => hits.find(h => h.src === id)).find(Boolean) || hits[0]); return; }

    /* 2) usa o título canônico do Jikan para procurar de novo nas fontes */
    const guess = String(initialSlug || '').replace(/[-_]+/g, ' ');
    const ext = await jikanLookup(guess);

    if (ext?.title) {
      const retryHits = await scrapeByTitle(order, ext.title);
      if (retryHits.length) { applyHit(retryHits[0]); return; }
    }

    /* 3) sem scrape: preenche com o catálogo externo em vez de "não encontrado" */
    if (ext) { renderExternal(ext); return; }
    if (cached) { toast('Mostrando dados salvos'); return; }
    detailError();
  }

  loadDetail();

  async function loadSimilar() {
    try {
      const settled = await Promise.allSettled(
        sourcesList.map(s => jsonWithTimeout(`${API}/api/home?source=${s.id}`, 8000))
      );
      const allSimilar = [];
      settled.forEach(r => { if (r.status === 'fulfilled') allSimilar.push(...asList(r.value)); });
      const uniq = [...new Map(allSimilar.map(a => [a.slug, a])).values()].filter(a => a.slug !== slug);
      const matching = uniq.filter(a => {
        const aGenres = a.genres || [];
        return aGenres.some(g => (data?.genres || []).includes(g));
      });
      const finalSimilar = dropJujutsu(matching.length ? matching : uniq).slice(0, 12);
      const g = $('#tab-rel .grid');
      g.innerHTML = '';
      if (!finalSimilar.length) g.innerHTML = '<p class="empty">Sem semelhantes.</p>';
      else finalSimilar.forEach(a => g.appendChild(card(a, null, a.source || source)));
    } catch {
      const g = $('#tab-rel .grid');
      if (g) g.innerHTML = '<p class="empty">Sem semelhantes.</p>';
    }
  }

  async function loadChars() {
    const title = data?.title || String(slug || '').replace(/-/g, ' ');
    try {
      const r = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(cleanTitle(title))}&limit=1`).then(res => res.json());
      const malId = r?.data?.[0]?.mal_id;
      if (!malId) { $('#tab-chars').innerHTML = '<p class="empty">Personagens indisponíveis.</p>'; return; }
      loadCharsFor(malId);
    } catch {
      $('#tab-chars').innerHTML = '<p class="empty">Personagens indisponíveis.</p>';
    }
  }

  async function loadCharsFor(malId) {
    try {
      const charRes = await fetch(`https://api.jikan.moe/v4/anime/${malId}/characters`).then(res => res.json());
      const charsList = charRes?.data || [];
      $('#tab-chars').innerHTML = '';
      if (!charsList.length) {
        $('#tab-chars').innerHTML = '<p class="empty">Personagens não encontrados.</p>';
        return;
      }
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
    } catch {
      $('#tab-chars').innerHTML = '<p class="empty">Personagens indisponíveis.</p>';
    }
  }

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
    if (!ep) return toast(data ? 'Sem episódios' : 'Episódios indisponíveis neste servidor');
    const n = ep.number || 1;
    location.href = `player.html?source=${encodeURIComponent(source)}&slug=${encodeURIComponent(data.slug)}&ep=${n}&season=${season}&audio=${ep.audio}`;
  };

  $('#dls').onclick = async () => {
    const ep = currentEp();
    if (!ep) return toast(data ? 'Sem episódios' : 'Episódios indisponíveis neste servidor');
    toast('Preparando download…');
    try {
      const n = ep.number || 1;
      const d = await jsonFresh(`${API}/api/streams/${encodeURIComponent(slug)}/${n}?source=${encodeURIComponent(source)}&season=${season}&audio=${ep.audio}&_t=${Date.now()}`);
      const list = (d.streams || d.sources || []).filter(s => s.url && !isSiteAnimePage(s.url) && !isJunkMedia(s.url));
      const best = list[list.length - 1];
      if (!best) return toast('Sem arquivo direto para baixar');
      const realUrl = unwrapOEmbed(best.url) || best.url;
      const name = `${slug}-T${season}E${n}-${best.quality}.mp4`.replace(/\s+/g, '_');
      saveFile(realUrl, name);
      store.set('dls', [...store.get('dls', []), { title: data.title, ep: n, quality: best.quality, url: realUrl }].slice(-40));
    } catch { toast('Falha ao preparar download'); }
  };

  $('#fav').onclick = () => {
    const item = data || { slug, source, title: $('#title')?.textContent || slug, cover: $('#poster')?.src };
    const on = toggleFav(item);
    $('#fav').classList.toggle('on', on);
    toast(on ? 'Salvo na lista' : 'Removido');
  };

  $('#like').onclick = () => { $('#like').classList.toggle('on'); toast('Curtido'); };

  /* FIX: compartilha link público HTTPS (abre no site e tenta abrir o app) */
  $('#share').onclick = () => {
    const url = shareUrl({ source, slug: data?.slug || slug, season: data ? season : '', audio });
    copyShare(url, data?.title || $('#title')?.textContent || slug);
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
  const autoFsPref = store.get('auto_fs', 'on');
  let info = null, plyr = null, sourcesList = DEFAULT_SOURCES;

  const LOAD_TIMEOUT = 12000;
  const STALE_MS = 20 * 60 * 1000;
  const MAX_SRC = 3;
  const NEXT_AT = 15;

  let loadGuard = null;
  let nextTimer = null;
  let nextWatch = null;
  let nextShown = false;
  let lastEmbed = null;
  let candidates = [];
  let candIdx = 0;
  let resolvedAt = 0;
  let busy = false;

  $('#back').onclick = () => history.length > 1 ? history.back() : location.href = 'index.html';

  async function loadInfo() {
    sourcesList = await fetchSources();
    const order = [source, ...sourcesList.map(s => s.id).filter(id => id !== source)];
    const settled = await Promise.allSettled(
      order.map(src => jsonSlow(`${API}/api/anime/${encodeURIComponent(slug)}?source=${encodeURIComponent(src)}&_t=${Date.now()}`)
        .then(raw => ({ src, raw })))
    );
    const hits = settled
      .filter(x => x.status === 'fulfilled' && x.value?.raw && !x.value.raw.error)
      .map(x => x.value);
    const chosen = order.map(id => hits.find(h => h.src === id)).find(Boolean) || hits[0];
    if (!chosen) {
      $('#stage').innerHTML = '<p class="empty">Falha ao carregar informações do anime.</p>';
      return;
    }
    source = chosen.src;
    store.set('source', source);
    info = normAnime({ ...chosen.raw, source });
    $('#ptitle').textContent = `${info.title} — EP ${ep}`;
    document.title = $('#ptitle').textContent;
    buildStrip();
    updateServerButtons();
  }

  (async () => { await loadInfo(); await load(); })();

  function buildStrip() {
    const se = info?.seasons.find(s => s.season === season) || info?.seasons[0];
    $('#strip').innerHTML = '';
    (se?.episodes || []).filter(e => e.audio === audio).forEach((e, idx) => {
      const n = e.number || idx + 1;
      const a = document.createElement('a');
      a.textContent = n;
      a.href = '#';
      a.className = n === ep ? 'on' : '';
      a.onclick = (ev) => { ev.preventDefault(); ep = n; buildStrip(); load(); };
      $('#strip').appendChild(a);
    });
  }

  const epLabel = () => {
    const t = String(info?.type || '').toLowerCase();
    const n = String(ep).padStart(2, '0');
    if (/ova/.test(t)) return `T${season} • OVA ${n}`;
    if (/especial/.test(t)) return `T${season} • Especial ${n}`;
    if (/filme|movie/.test(t)) return `T${season} • Filme ${n}`;
    return `T${season} • Episódio ${n}`;
  };

  const titleOverlay = () => `<div class="player-title">${esc(epLabel())}</div>`;

  /* FIX: bridge real do Android para tela cheia */
  function requestFs(el) {
    try { if (window.Android && window.Android.fullscreen) { window.Android.fullscreen(); return; } } catch {}
    const target = el || $('#stage');
    try {
      if (target?.requestFullscreen) target.requestFullscreen().catch(() => {});
      else if (target?.webkitRequestFullscreen) target.webkitRequestFullscreen();
    } catch {}
  }

  function clearNextCard() {
    clearInterval(nextTimer);
    nextTimer = null;
    nextShown = false;
    $('#next-card')?.remove();
  }

  function unmountStage() {
    clearTimeout(loadGuard);
    clearInterval(nextWatch);
    nextWatch = null;
    clearNextCard();
    try { plyr?.destroy(); } catch {}
    plyr = null;
    candidates = [];
    candIdx = 0;
  }

  function nextEpisode() {
    const se = info?.seasons.find(s => s.season === season) || info?.seasons[0];
    const list = (se?.episodes || []).filter(e => e.audio === audio);
    const i = list.findIndex(e => (e.number || 0) === ep);
    return i >= 0 ? list[i + 1] : null;
  }

  /* FIX: gatilho por duração — funciona também no iframe, onde não há timeupdate */
  function episodeDuration() {
    const se = info?.seasons.find(s => s.season === season) || info?.seasons[0];
    const e = (se?.episodes || []).find(x => Number(x.number) === Number(ep) && x.audio === audio);
    const m = String(e?.duration || '').match(/(?:(\d{1,2}):)?(\d{1,2}):(\d{2})/);
    if (!m) return 0;
    return m[1] ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : (+m[2]) * 60 + (+m[3]);
  }

  function armNextByDuration() {
    clearInterval(nextWatch);
    const total = episodeDuration();
    if (!total || autoNextPref === 'off') return;
    const t0 = Date.now();
    nextWatch = setInterval(() => {
      if (nextShown) return clearInterval(nextWatch);
      if ((Date.now() - t0) / 1000 >= total - NEXT_AT) {
        clearInterval(nextWatch);
        const n = nextEpisode();
        if (n) { nextShown = true; showNextCard(n); }
      }
    }, 1000);
  }

  function showNextCard(nextEp) {
    if (!nextEp || $('#next-card')) return;
    let left = 10;
    const card = document.createElement('div');
    card.id = 'next-card';
    card.className = 'next-card';
    card.innerHTML = `<b>Próximo episódio</b>
      <span>EP ${String(nextEp.number).padStart(2, '0')}</span>
      <small>Começando em <i id="next-count">10</i>s</small>
      <div class="row">
        <button class="btn" id="next-go" type="button">Ir agora</button>
        <button class="btn dark" id="next-cancel" type="button">Cancelar</button>
      </div>`;
    $('#stage').appendChild(card);
    $('#next-go').onclick = () => { clearNextCard(); next(); };
    $('#next-cancel').onclick = () => clearNextCard();
    nextTimer = setInterval(() => {
      left -= 1;
      const c = $('#next-count');
      if (c) c.textContent = String(left);
      if (left <= 0) { clearNextCard(); next(); }
    }, 1000);
  }

  /* FIX: retry só quando não existe fonte válida */
  function errorScreen(msg = 'Erro ao carregar episódio, tente novamente mais tarde.', opts = {}) {
    const retry = opts.retry !== false;
    unmountStage();
    $('#stage').innerHTML = `<div class="player-error">
      <p>${esc(msg)}</p>
      <div class="row">
        ${retry ? '<button class="btn" id="err-retry" type="button">Tentar novamente</button>' : ''}
        ${lastEmbed ? '<button class="btn dark" id="err-embed" type="button">Usar player alternativo</button>' : ''}
      </div>
    </div>`;
    if (retry) $('#err-retry').onclick = () => load();
    const eb = $('#err-embed');
    if (eb) eb.onclick = () => { if (!lastEmbed || !mountFrame(lastEmbed)) errorScreen('Nenhum player alternativo disponível.', { retry: false }); };
  }

  function mountFrame(src) {
    const realSrc = unwrapOEmbed(src) || src;
    if (!realSrc || isSiteAnimePage(realSrc)) return false;
    unmountStage();
    $('#stage').innerHTML = `<iframe id="player-frame" src="${esc(realSrc)}"
      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
      allowfullscreen referrerpolicy="no-referrer-when-downgrade"
      style="width:100%;height:100%;border:0;display:block"></iframe>${titleOverlay()}`;
    $('#qbox').innerHTML = '';
    const alt = document.createElement('button');
    alt.className = 'tag';
    alt.textContent = 'Tentar vídeo direto';
    alt.onclick = () => { server = 'native'; store.set('srv', 'native'); load(); };
    $('#qbox').appendChild(alt);
    if (autoFsPref !== 'off') requestFs($('#stage'));
    armNextByDuration();
    return true;
  }

  async function resolveStreamWithFallback() {
    sourcesList = await fetchSources();
    const order = [source, ...sourcesList.map(s => s.id).filter(id => id !== source)].slice(0, MAX_SRC);
    for (const src of order) {
      try {
        const qs = new URLSearchParams({ source: src, audio, season: String(season), n: String(ep) }).toString();
        /* FIX: sempre fresco — cache: 'no-store' + anti-cache _t= (token/URL do vídeo são temporários) */
        const d = await jsonFresh(`${API}/api/streams/${encodeURIComponent(slug)}/${ep}?${qs}&_t=${Date.now()}`, 18000);
        if (!d || d.ok === false) continue;
        const list = (d.sources || d.streams || []).filter(s => (s.url || s.proxyUrl) && !isSiteAnimePage(s.url || s.proxyUrl) && !isJunkMedia(s.url || s.proxyUrl));
        const validIframes = (d.iframes || []).filter(u => u && !isSiteAnimePage(u));
        const blogger = validIframes.find(u => isBloggerEmbed(u));
        const embedUrl = unwrapOEmbed(blogger || (!isSiteAnimePage(d.iframe) ? d.iframe : null) || validIframes[0] || null);
        if (list.length || embedUrl) {
          source = src;
          store.set('source', source);
          updateServerButtons();
          return { d, list, embedUrl, blogger: Boolean(blogger) };
        }
      } catch {}
    }
    return null;
  }

  function buildCandidates(list) {
    const out = [];
    for (const s of list) {
      const direct = unwrapOEmbed(s.url) || s.url;
      if (direct && !isSiteAnimePage(direct) && !isJunkMedia(direct)) out.push({ ...s, src: direct });
    }
    for (const s of list) if (s.proxyUrl) out.push({ ...s, src: `${API}${s.proxyUrl}` });
    return out;
  }

  async function load() {
    if (busy) return;
    busy = true;
    unmountStage();
    $('#stage').innerHTML = '<p class="empty">Resolvendo episódio…</p>';
    $('#qbox').innerHTML = '';
    try {
      const resolved = await resolveStreamWithFallback();
      if (!resolved) {
        errorScreen('Episódio sem stream disponível em nenhum servidor. Tente outro áudio.');
        return;
      }
      const { list, embedUrl, blogger } = resolved;
      lastEmbed = embedUrl || null;
      resolvedAt = Date.now();

      /* FIX: quando existe embed do Blogger, ele reproduz de verdade — vai direto no iframe do stage */
      if (embedUrl && blogger && server !== 'native' && mountFrame(embedUrl)) {
        toast('Player do episódio carregado');
        return;
      }
      if (server === 'iframe' && embedUrl && mountFrame(embedUrl)) return;

      let ordered = list.slice().sort((a, b) => (Number(b.itag) || 0) - (Number(a.itag) || 0));
      if (qualityPref !== 'auto') {
        const hit = ordered.filter(s => String(s.quality || s.label || '').includes(qualityPref));
        if (hit.length) ordered = [...hit, ...ordered.filter(s => !hit.includes(s))];
      }
      candidates = buildCandidates(ordered);

      if (!candidates.length) {
        if (embedUrl && mountFrame(embedUrl)) return;
        errorScreen('Episódio sem stream disponível. Tente outro áudio.');
        return;
      }

      $('#stage').innerHTML = `<div class="adv-player-wrapper" style="position:relative;width:100%;height:100%;background:#000">
        <video id="v" autoplay playsinline controls preload="metadata" style="width:100%;height:100%;display:block"></video>
        ${titleOverlay()}
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
      if (info?.cover) video.poster = info.cover.startsWith('http') ? info.cover : img(info.cover);

      const tryCandidate = (i) => {
        clearTimeout(loadGuard);
        if (i >= candidates.length) {
          if (lastEmbed && mountFrame(lastEmbed)) { toast('Trocando para player embed'); return; }
          errorScreen();
          return;
        }
        candIdx = i;
        video.src = candidates[i].src;
        video.load();
        video.play().catch(() => {});
        loadGuard = setTimeout(() => { if (video.readyState < 2) tryCandidate(i + 1); }, LOAD_TIMEOUT);
      };

      video.addEventListener('loadeddata', () => clearTimeout(loadGuard));
      video.addEventListener('playing', () => clearTimeout(loadGuard));
      video.addEventListener('error', () => { clearTimeout(loadGuard); tryCandidate(candIdx + 1); });

      video.addEventListener('loadedmetadata', () => {
        const saved = Number(store.get('pos:' + slug + ':' + ep, 0));
        if (saved > 5 && saved < (video.duration || Infinity) - 10) video.currentTime = saved;
        if (video.paused && autoFsPref !== 'off') requestFs(video);
      }, { once: true });

      video.addEventListener('play', () => {
        if (autoFsPref !== 'off') requestFs(video);
        if (Date.now() - resolvedAt > STALE_MS) load();
      });

      if (window.Plyr) {
        plyr = new Plyr(video, {
          controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'settings', 'pip', 'fullscreen'],
          settings: ['quality', 'speed'],
          speed: { selected: 1, options: [0.5, 1, 1.25, 1.5, 2] },
          storage: { enabled: true, key: 'ma-plyr' }
        });
      } else {
        video.controls = true;
      }

      let lastSave = 0;
      video.addEventListener('timeupdate', () => {
        if (Date.now() - lastSave > 5000) { lastSave = Date.now(); saveProgress(); }
        const d = video.duration;
        if (!d || autoNextPref === 'off' || nextShown) return;
        if (d - video.currentTime <= NEXT_AT) {
          const n = nextEpisode();
          if (n) { nextShown = true; showNextCard(n); }
        }
      });
      if (autoNextPref !== 'off') video.addEventListener('ended', () => { clearNextCard(); next(); });

      $('#btn-10s')?.addEventListener('click', () => { video.currentTime = Math.max(0, video.currentTime - 10); });
      $('#btn+10s')?.addEventListener('click', () => { video.currentTime = Math.min(video.duration || 0, video.currentTime + 10); });
      const ppBtn = $('#btn-playpause');
      if (ppBtn) {
        ppBtn.onclick = () => { if (video.paused) video.play(); else video.pause(); };
        video.onplay = () => ppBtn.textContent = '⏸';
        video.onpause = () => ppBtn.textContent = '▶';
      }
      $('#range-vol')?.addEventListener('input', (e) => { video.volume = e.target.value; });
      $('#range-bright')?.addEventListener('input', (e) => { video.style.filter = `brightness(${e.target.value})`; });

      ordered.slice().reverse().forEach(s => {
        const b = document.createElement('button');
        b.className = 'tag';
        b.textContent = s.quality || s.label || 'HD';
        b.onclick = () => {
          const idx = candidates.findIndex(c => c.src === (unwrapOEmbed(s.url) || s.url));
          if (idx >= 0) tryCandidate(idx);
          $$('#qbox .tag').forEach(x => x.classList.toggle('on', x === b));
        };
        $('#qbox').appendChild(b);
      });
      $('#qbox').firstChild?.classList.add('on');

      const dl = document.createElement('button');
      dl.className = 'tag dl';
      dl.innerHTML = `${ICONS.dl}Baixar`;
      dl.onclick = () => {
        const best = ordered.find(s => !isJunkMedia(s.url)) || ordered[0];
        saveFile(unwrapOEmbed(best.url) || best.url, `${slug}-T${season}E${ep}-${best.quality}.mp4`.replace(/\s+/g, '_'));
        store.set('dls', [...store.get('dls', []), { title: info?.title || slug, ep, quality: best.quality, url: best.url }].slice(-40));
      };
      $('#qbox').appendChild(dl);

      tryCandidate(0);
      armNextByDuration();

      store.set('continue', [{ slug, source, title: info?.title || slug, cover: info?.cover, ep },
        ...store.get('continue', []).filter(x => x.slug !== slug)].slice(0, 12));
    } catch {
      errorScreen();
    } finally {
      busy = false;
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
      b.classList.toggle('on', Boolean(sObj && sObj.id === source));
      b.onclick = () => {
        if (!sObj) return;
        source = sObj.id;
        store.set('source', source);
        $('#overlay').classList.remove('on');
        updateServerButtons();
        toast(`Servidor ${idx + 1} selecionado`);
        load();
      };
    });
  }

  $('#dim').onclick = () => $('#overlay').classList.remove('on');
  $('#opts').onclick = () => { updateServerButtons(); $('#overlay').classList.add('on'); };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && resolvedAt && Date.now() - resolvedAt > STALE_MS && $('#v')) load();
  });
}