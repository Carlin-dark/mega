/* Mega Anime — front */
const API = (window.API_BASE || location.origin).replace(/\/$/, '');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const img = (u) => (u ? `${API}/img?u=${encodeURIComponent(u)}` : '');
const esc = (s = '') => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 3 6.5 7 1-5 5 1.2 7L12 18l-6.2 3.5L7 14.5l-5-5 7-1z"/></svg>'
};

/* ---------- favoritos ---------- */
const favs = () => store.get('favs', []);
const isFav = (slug) => favs().some(x => x.slug === slug);
function setFav(a, on) {
  const l = favs().filter(x => x.slug !== a.slug);
  if (on) l.unshift({ slug: a.slug, title: a.title, cover: a.cover });
  store.set('favs', l);
  return on;
}
const toggleFav = (a) => setFav(a, !isFav(a.slug));

/* ---------- download ---------- */
function saveFile(url, name) {
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

function card(a, ep) {
  const el = document.createElement('a');
  el.className = 'card';
  el.href = `detail.html?slug=${encodeURIComponent(a.slug)}`;
  el.innerHTML = `${ep ? `<span class="ep">EP ${ep}</span>` : ''}
    <img loading="lazy" src="${img(a.cover)}" alt="${esc(a.title)}">
    <div class="pl"><span>${ICONS.play}</span></div>
    <div class="cap"><b>${esc(a.title)}</b><small>${esc(a.type || a.year || '')}</small></div>`;
  return el;
}

async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

/* ================= HOME ================= */
if (document.body.dataset.page === 'home') {
  let heroPool = [], hi = 0, page = 1, busy = false, done = false;

  const paintHero = () => {
    const a = heroPool[hi % heroPool.length];
    if (!a) return;
    $('#hero').innerHTML = `<img src="${img(a.cover)}" alt="">
      <div class="inner">
        <div class="chips"><span class="chip red">Em destaque</span>
          ${a.type ? `<span class="chip">${esc(a.type)}</span>` : ''}
          ${a.year ? `<span class="chip star">${ICONS.star} ${esc(a.year)}</span>` : ''}</div>
        <h2>${esc(a.title)}</h2>
        <p>${esc(a.synopsis || 'Assista agora em HD, legendado ou dublado.')}</p>
        <div class="row">
          <a class="btn red" href="detail.html?slug=${encodeURIComponent(a.slug)}">${ICONS.play} Play</a>
          <button class="btn circle" id="hero-fav" aria-label="Salvar"></button>
          <span class="pager">${(hi % heroPool.length) + 1} / ${heroPool.length}</span>
        </div>
      </div>`;
    const fb = $('#hero-fav');
    fb.innerHTML = isFav(a.slug)
      ? '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>';
    fb.onclick = () => {
      const on = toggleFav(a);
      paintHero();
      toast(on ? 'Salvo na lista' : 'Removido');
    };
  };

  (async () => {
    try {
      const home = await json(`${API}/api/home`);
      const uniq = [...new Map(home.map(a => [a.slug, a])).values()];
      heroPool = uniq.slice(0, 8);
      paintHero();
      setInterval(() => { hi++; paintHero(); }, 6000);

      home.forEach(a => $('#latest').appendChild(card(a)));
      uniq.slice(8, 20).forEach(a => $('#top').appendChild(card(a)));

      const cat = await json(`${API}/api/catalog?page=1`);
      cat.forEach(a => $('#added').appendChild(card(a)));

      const cont = store.get('continue', []);
      if (cont.length) {
        $('#continue-wrap').classList.remove('hide');
        cont.slice(0, 12).forEach(c => $('#continue').appendChild(card(c, c.ep)));
      }
    } catch { $('#latest').innerHTML = '<p class="empty">Falha ao carregar.</p>'; }
  })();

  const loadMore = async () => {
    if (busy || done) return;
    busy = true;
    try {
      const list = await json(`${API}/api/catalog?page=${++page}`);
      if (!list.length) done = true;
      else list.forEach(a => $('#catalog').appendChild(card(a)));
    } catch {}
    busy = false;
  };
  new IntersectionObserver(([e]) => e.isIntersecting && loadMore()).observe($('#sentinel'));

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
    $('#results').innerHTML = '<p class="empty">Buscando…</p>';
    try {
      const r = await json(`${API}/api/search?q=${encodeURIComponent(q)}`);
      $('#results').innerHTML = '';
      if (!r.length) $('#results').innerHTML = '<p class="empty">Nada encontrado.</p>';
      r.forEach(a => $('#results').appendChild(card(a)));
    } catch { $('#results').innerHTML = '<p class="empty">Erro na busca.</p>'; }
  };

  function renderList() {
    const l = favs();
    $('#list').innerHTML = l.length ? '' : '<p class="empty">Sua lista está vazia. Abra um anime e toque no marcador.</p>';
    l.forEach(a => {
      const el = card(a);
      const b = document.createElement('button');
      b.className = 'card-x';
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
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
      el.innerHTML = `<div><b>${esc(x.title)}</b><small>EP ${x.ep} · ${esc(x.quality)}</small></div>
        <a class="btn red" style="margin-left:auto;padding:9px 14px" href="${x.url}" target="_blank" rel="noreferrer">Abrir</a>`;
      $('#downloads').appendChild(el);
    });
  }

  /* ---------- temporadas ---------- */
  let seasonsReady = false;
  function initSeasons() {
    const sel = $('#s-year');
    if (!sel.options.length) {
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
    const y = $('#s-year').value;
    $('#season-grid').innerHTML = '<p class="empty">Carregando…</p>';
    try {
      const list = await json(`${API}/api/seasons/${y}/${s}`);
      $('#season-grid').innerHTML = '';
      if (!list.length) $('#season-grid').innerHTML = '<p class="empty">Nada nesta temporada.</p>';
      list.forEach(m => {
        const el = document.createElement('a');
        el.className = 'card';
        el.href = '#';
        el.innerHTML = `<img loading="lazy" src="${img(m.cover)}" alt="${esc(m.title)}">
          ${m.score ? `<span class="ep">${ICONS.star} ${m.score.toFixed(1)}</span>` : ''}
          <div class="cap"><b>${esc(m.title)}</b><small>${esc(m.type || '')}</small></div>`;
        el.onclick = async (e) => {
          e.preventDefault();
          toast('Procurando no catálogo…');
          try {
            const r = await json(`${API}/api/search?q=${encodeURIComponent(m.title)}`);
            if (r[0]) location.href = `detail.html?slug=${encodeURIComponent(r[0].slug)}`;
            else toast('Não disponível no site');
          } catch { toast('Falha na busca'); }
        };
        $('#season-grid').appendChild(el);
      });
    } catch { $('#season-grid').innerHTML = '<p class="empty">Falha ao carregar temporada.</p>'; }
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
  const slug = new URLSearchParams(location.search).get('slug');
  let data = null, season = 1, audio = store.get('audio', 'leg');

  $('#back').onclick = () => history.length > 1 ? history.back() : location.href = 'index.html';

  (async () => {
    try {
      data = await json(`${API}/api/anime/${encodeURIComponent(slug)}`);
      document.title = data.title;
      $('#title').textContent = data.title;
      $('#poster').src = img(data.cover);
      $('#blur').innerHTML = `<img src="${img(data.cover)}" alt="">`;
      $('#syn').textContent = data.synopsis || 'Sem sinopse.';
      $('#genres').innerHTML = `<b>Gênero:</b> ${esc(data.genres.join(', ') || '—')}`;

      $('#badges').innerHTML = `
        <span class="star">${ICONS.star} ${(7 + (data.episodeCount % 20) / 10).toFixed(1)}</span>
        <span>${esc(data.year || '—')}</span>
        <span>${data.audios.includes('dub') ? 'DUB' : 'LEG'}</span>
        <span class="red">HD</span>
        <span>${data.episodeCount} eps</span>`;

      paintEps();
      if (isFav(data.slug)) $('#fav').classList.add('on');

      json(`${API}/api/similar/${encodeURIComponent(slug)}`)
        .then(r => {
          $('#tab-rel').innerHTML = '';
          if (!r.length) return $('#tab-rel').innerHTML = '<p class="empty">Sem semelhantes.</p>';
          r.forEach(a => $('#tab-rel').appendChild(card(a)));
        })
        .catch(() => { $('#tab-rel').innerHTML = '<p class="empty">Sem semelhantes.</p>'; });

      json(`${API}/api/characters/${encodeURIComponent(slug)}`)
        .then(r => {
          $('#tab-chars').innerHTML = '';
          if (!r.length) return $('#tab-chars').innerHTML = '<p class="empty">Personagens não encontrados.</p>';
          const g = document.createElement('div');
          g.className = 'grid chars';
          r.forEach(c => {
            const el = document.createElement('div');
            el.className = 'char';
            el.innerHTML = `<img loading="lazy" src="${img(c.image)}" alt="${esc(c.name)}"><b>${esc(c.name)}</b>`;
            g.appendChild(el);
          });
          $('#tab-chars').appendChild(g);
        })
        .catch(() => { $('#tab-chars').innerHTML = '<p class="empty">Personagens indisponíveis.</p>'; });
    } catch { $('#title').textContent = 'Falha ao carregar'; }
  })();

  function paintEps() {
    const box = $('#tab-eps');
    box.innerHTML = '';
    if (!data) return;
    const se = data.seasons.find(s => s.season === season) || data.seasons[0];
    if (!se) { box.innerHTML = '<p class="empty">Sem episódios disponíveis.</p>'; return; }

    if (data.seasons.length > 1) {
      const tabs = document.createElement('div');
      tabs.className = 'tabs';
      tabs.innerHTML = data.seasons.map(s =>
        `<button class="${s.season === season ? 'on' : ''}" data-s="${s.season}">T${s.season}</button>`).join('');
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
    eps.forEach(e => {
      const a = document.createElement('a');
      a.href = `player.html?slug=${encodeURIComponent(data.slug)}&ep=${e.number}&season=${season}&audio=${e.audio}`;
      a.innerHTML = `${e.number}${e.duration ? `<small>${esc(e.duration)}</small>` : ''}`;
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
    location.href = `player.html?slug=${encodeURIComponent(data.slug)}&ep=${ep.number}&season=${season}&audio=${ep.audio}`;
  };

  $('#dls').onclick = async () => {
    const ep = currentEp();
    if (!ep) return toast('Sem episódios');
    toast('Preparando download…');
    try {
      const d = await json(`${API}/api/streams/${encodeURIComponent(slug)}/${ep.number}?season=${season}&audio=${ep.audio}`);
      const best = d.streams[d.streams.length - 1];
      if (!best) return toast('Sem arquivo para baixar');
      const name = `${slug}-T${season}E${ep.number}-${best.quality}.mp4`.replace(/\s+/g, '_');
      saveFile(best.url, name);
      store.set('dls', [...store.get('dls', []), { title: data.title, ep: ep.number, quality: best.quality, url: best.url }].slice(-40));
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
    const url = `https://animesonline.blue/anime/${slug}`;
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
  const slug = p.get('slug');
  const season = +(p.get('season') || 1);
  let ep = +(p.get('ep') || 1);
  let audio = p.get('audio') === 'dub' ? 'dub' : store.get('audio', 'leg');
  let server = store.get('srv', 'native');
  let info = null, plyr = null;
  const cache = {};

  $('#back').onclick = () => history.length > 1 ? history.back() : location.href = 'index.html';

  (async () => {
    try {
      info = await json(`${API}/api/anime/${encodeURIComponent(slug)}`);
      $('#ptitle').textContent = `${info.title} — EP ${ep}`;
      document.title = $('#ptitle').textContent;
      buildStrip();
      await load();
    } catch { $('#stage').innerHTML = '<p class="empty">Falha ao carregar.</p>'; }
  })();

  function buildStrip() {
    const se = info.seasons.find(s => s.season === season);
    $('#strip').innerHTML = '';
    (se?.episodes || []).filter(e => e.audio === audio).forEach(e => {
      const a = document.createElement('a');
      a.textContent = e.number;
      a.href = '#';
      a.className = e.number === ep ? 'on' : '';
      a.onclick = (ev) => {
        ev.preventDefault();
        ep = e.number;
        $('#ptitle').textContent = `${info.title} — EP ${ep}`;
        buildStrip();
        load();
      };
      $('#strip').appendChild(a);
    });
  }

  async function load() {
    $('#stage').innerHTML = '<p class="empty">Resolvendo…</p>';
    $('#qbox').innerHTML = '';
    try {
      const d = cache[`${ep}|${audio}`] || await json(`${API}/api/streams/${encodeURIComponent(slug)}/${ep}?season=${season}&audio=${audio}`);
      cache[`${ep}|${audio}`] = d;

      if (server === 'iframe' || !d.streams.length) {
        if (!d.iframe) throw new Error('sem fonte');
        $('#stage').innerHTML = `<iframe src="${d.iframe}" allow="autoplay;fullscreen;encrypted-media" allowfullscreen></iframe>`;
      } else {
        const best = d.streams[d.streams.length - 1];
        $('#stage').innerHTML = '<video id="v" playsinline crossorigin></video>';
        const video = $('#v');
        video.src = best.url;
        video.poster = info?.cover ? img(info.cover) : '';

        if (window.Plyr) {
          plyr = new Plyr(video, {
            controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'settings', 'pip', 'fullscreen'],
            settings: ['quality', 'speed'],
            quality: { default: +best.itag, options: d.streams.map(s => +s.itag) },
            speed: { selected: 1, options: [0.75, 1, 1.25, 1.5, 2] },
            storage: { enabled: true, key: 'ma-plyr' }
          });
          video.addEventListener('timeupdate', saveProgress);
          video.addEventListener('ended', next);
        } else {
          video.controls = true;
          video.addEventListener('ended', next);
        }

        d.streams.slice().reverse().forEach(s => {
          const b = document.createElement('button');
          b.className = 'tag';
          b.textContent = s.quality;
          b.onclick = () => {
            if (plyr) { plyr.source = { type: 'video', sources: [{ src: s.url, type: 'video/mp4' }] }; plyr.play(); }
            else { video.src = s.url; video.play(); }
            $$('#qbox .tag').forEach(x => x.classList.toggle('on', x === b));
          };
          $('#qbox').appendChild(b);
        });
        $('#qbox').firstChild?.classList.add('on');

        const dl = document.createElement('button');
        dl.className = 'tag dl';
        dl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><path d="M4 19h16"/></svg> Baixar';
        dl.onclick = () => {
          saveFile(best.url, `${slug}-T${season}E${ep}-${best.quality}.mp4`.replace(/\s+/g, '_'));
          store.set('dls', [...store.get('dls', []), { title: info.title, ep, quality: best.quality, url: best.url }].slice(-40));
        };
        $('#qbox').appendChild(dl);
      }

      store.set('continue', [{ slug, title: info.title, cover: info.cover, ep },
        ...store.get('continue', []).filter(x => x.slug !== slug)].slice(0, 12));
    } catch {
      $('#stage').innerHTML = '<p class="empty">Episódio indisponível. Tente outro servidor.</p>';
    }
  }

  function saveProgress() {
    const v = $('#v');
    if (!v || !v.duration) return;
    store.set('pos:' + slug + ':' + ep, v.currentTime);
  }

  function next() {
    const se = info?.seasons.find(s => s.season === season);
    const list = (se?.episodes || []).filter(e => e.audio === audio);
    const i = list.findIndex(e => e.number === ep);
    if (i >= 0 && list[i + 1]) {
      ep = list[i + 1].number;
      $('#ptitle').textContent = `${info.title} — EP ${ep}`;
      buildStrip();
      load();
    }
  }

  $('#next').onclick = next;
  $('#prev').onclick = () => {
    const se = info?.seasons.find(s => s.season === season);
    const list = (se?.episodes || []).filter(e => e.audio === audio);
    const i = list.findIndex(e => e.number === ep);
    if (i > 0) {
      ep = list[i - 1].number;
      $('#ptitle').textContent = `${info.title} — EP ${ep}`;
      buildStrip();
      load();
    }
  };

  $$('#ctrl [data-audio]').forEach(b => {
    b.classList.toggle('on', b.dataset.audio === audio);
    b.onclick = () => {
      audio = b.dataset.audio;
      store.set('audio', audio);
      $$('#ctrl [data-audio]').forEach(x => x.classList.toggle('on', x === b));
      buildStrip();
      load();
    };
  });

  const srvLabel = () => `Servidor: ${server === 'native' ? 'nativo' : 'iframe'}`;
  $('#srv').innerHTML = `${ICONS.layers}<span>${srvLabel()}</span>`;
  $('#srv').onclick = () => {
    server = server === 'native' ? 'iframe' : 'native';
    store.set('srv', server);
    $('#srv').innerHTML = `${ICONS.layers}<span>${srvLabel()}</span>`;
    plyr?.destroy();
    load();
  };

  $('#dim').onclick = () => $('#overlay').classList.toggle('on');
}