import { $, apiUrl, savedSource, saveSource } from './ui.js';

const p = new URLSearchParams(location.search);
let source = p.get('source') || savedSource();
let slug = p.get('slug');
let ep = p.get('ep') || p.get('n') || '1';
let season = Number(p.get('season') || 1);
let audio = p.get('audio') || 'leg';
let current = Number(p.get('n') || ep || 1);
let tries = 0;
let guard = null;
let cardTimer = null;
let cardShown = false;

const LOAD_TIMEOUT = 12000;
const autoNextOn = () => (localStorage.getItem('ma:auto_next') || 'on') !== 'off';
const autoFsOn = () => (localStorage.getItem('ma:auto_fs') || 'on') !== 'off';

const isBloggerEmbed = (u = '') => /blogger\.com\/video\.g|video\.g\?token=/i.test(String(u || ''));

const plyrEl = $('#video');
const player = plyrEl ? new Plyr(plyrEl, {
  controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'settings', 'pip', 'fullscreen'],
  settings: ['quality', 'speed'],
  storage: { enabled: true, key: 'ma-plyr' },
}) : null;

const status = (t) => { if ($('#status')) $('#status').textContent = t; };

function isSiteAnimePage(u = '') {
  try {
    const parsed = new URL(u);
    return /\/anime\/[^/]+$/i.test(parsed.pathname) && !parsed.searchParams.get('ep');
  } catch { return false; }
}

function epLabel() {
  return `T${season} • Episódio ${String(current).padStart(2, '0')}`;
}

function titleOverlay() {
  return `<div class="player-title">${epLabel()}</div>`;
}

function requestFs(el) {
  const target = el || $('#stage');
  try { if (window.Android && window.Android.fullscreen) { window.Android.fullscreen(); return; } } catch {}
  try {
    if (target?.requestFullscreen) target.requestFullscreen().catch(() => {});
    else if (target?.webkitRequestFullscreen) target.webkitRequestFullscreen();
  } catch {}
}

function clearNextCard() {
  clearInterval(cardTimer);
  cardTimer = null;
  cardShown = false;
  $('#next-card')?.remove();
}

function errorScreen(msg = 'Erro ao carregar episódio, tente novamente mais tarde.') {
  const stage = $('#stage');
  if (!stage) return;
  stage.innerHTML = `<div class="player-error">
    <p>${msg}</p>
    <div class="row">
      <button class="btn" id="err-retry" type="button">Tentar novamente</button>
      <button class="btn dark" id="err-embed" type="button">Usar player alternativo</button>
    </div>
  </div>`;
  $('#err-retry').onclick = () => { tries = 0; resolveStream(); };
  $('#err-embed').onclick = () => { tries = 0; loadIframeFallback(); };
}

function renderIframePlayer(iframeUrl) {
  if (!iframeUrl || isSiteAnimePage(iframeUrl)) return false;
  const stage = $('#stage') || plyrEl?.parentElement;
  if (!stage) return false;
  try { player?.pause(); } catch {}
  clearNextCard();
  stage.innerHTML = `<iframe
    src="${iframeUrl}"
    allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
    allowfullscreen
    referrerpolicy="no-referrer-when-downgrade"
    style="width:100%;height:100%;border:0;display:block"
  ></iframe>${titleOverlay()}`;
  if (autoFsOn()) requestFs(stage);
  return true;
}

let lastIframe = null;
function loadIframeFallback() {
  if (lastIframe && renderIframePlayer(lastIframe)) return true;
  errorScreen('Nenhum player alternativo disponível para este episódio.');
  return false;
}

function playDirectStream(s) {
  if (!s?.url || isSiteAnimePage(s.url)) return false;
  const proxied = apiUrl(`/api/proxy-stream?u=${encodeURIComponent(s.url)}&ref=${encodeURIComponent(s.referer || '')}`);

  if (player && plyrEl) {
    clearTimeout(guard);
    player.source = { type: 'video', sources: [{ src: proxied, type: s.mime || 'video/mp4' }] };
    player.play().catch(() => {});
    const stage = $('#stage');
    if (stage && !stage.querySelector('.player-title')) stage.insertAdjacentHTML('beforeend', titleOverlay());
    if (autoFsOn()) requestFs(stage);
    guard = setTimeout(() => {
      if (plyrEl.readyState < 2) { if (!loadIframeFallback()) errorScreen(); }
    }, LOAD_TIMEOUT);
    plyrEl.addEventListener('loadeddata', () => clearTimeout(guard), { once: true });
    return true;
  }

  const stage = $('#stage');
  if (stage) {
    clearTimeout(guard);
    stage.innerHTML = `<video id="v" controls autoplay playsinline preload="metadata" src="${proxied}" style="width:100%;height:100%;display:block"></video>${titleOverlay()}`;
    const v = $('#v');
    v.addEventListener('error', () => { clearTimeout(guard); if (!loadIframeFallback()) errorScreen(); }, { once: true });
    guard = setTimeout(() => { if (v.readyState < 2) { if (!loadIframeFallback()) errorScreen(); } }, LOAD_TIMEOUT);
    if (autoFsOn()) requestFs(stage);
    return true;
  }
  return false;
}

function nextEpisodeOf(list) {
  const i = list.findIndex((e) => Number(e.number) === Number(current));
  return i >= 0 ? list[i + 1] : null;
}

function showNextCard(next) {
  if (!next || $('#next-card')) return;
  let left = 10;
  const card = document.createElement('div');
  card.id = 'next-card';
  card.className = 'next-card';
  card.innerHTML = `<b>Próximo episódio</b>
    <span>EP ${String(next.number).padStart(2, '0')}</span>
    <small>Começando em <i id="next-count">10</i>s</small>
    <div class="row">
      <button class="btn" id="next-go" type="button">Ir agora</button>
      <button class="btn dark" id="next-cancel" type="button">Cancelar</button>
    </div>`;
  $('#stage')?.appendChild(card);
  $('#next-go').onclick = () => { clearNextCard(); goTo(next.number); };
  $('#next-cancel').onclick = () => clearNextCard();
  cardTimer = setInterval(() => {
    left -= 1;
    const c = $('#next-count');
    if (c) c.textContent = String(left);
    if (left <= 0) { clearNextCard(); goTo(next.number); }
  }, 1000);
}

function goTo(n) {
  const q = new URLSearchParams({ source, slug, ep: String(n), n: String(n), season: String(season), audio }).toString();
  location.href = `player.html?${q}`;
}

async function resolveStream() {
  status('Resolvendo episódio...');
  if ($('#quality')) $('#quality').innerHTML = '';
  clearNextCard();
  const stage = $('#stage');
  if (stage) stage.innerHTML = '<p class="empty">Resolvendo episódio…</p>';

  const qs = new URLSearchParams({ source, audio, season: String(season), n: String(current) }).toString();

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  let data = null;
  try {
    /* FIX: requisição fresca — sem HTML/token em cache (links expiram) */
    const r = await fetch(apiUrl(`/api/streams/${encodeURIComponent(slug)}/${encodeURIComponent(ep)}?${qs}&_t=${Date.now()}`), {
      cache: 'no-store',
      headers: { accept: 'application/json', 'cache-control': 'no-cache, no-store', pragma: 'no-cache' },
      signal: ctrl.signal,
    });
    data = await r.json();
  } catch { data = null; } finally { clearTimeout(t); }

  if (!data) { errorScreen(); return; }

  const list = (data.sources || data.streams || []).filter((s) => (s.url || s.proxyUrl) && !isSiteAnimePage(s.url || s.proxyUrl));
  const blogger = (data.iframes || []).find((u) => u && isBloggerEmbed(u));
  lastIframe = blogger || (data.iframe && !isSiteAnimePage(data.iframe) ? data.iframe : null) || (data.iframes || []).find((u) => u && !isSiteAnimePage(u)) || null;

  /* FIX: embed do Blogger reproduz — vai direto no iframe do stage */
  if (blogger && renderIframePlayer(blogger)) {
    status(`Player embed carregado (${source}).`);
    return;
  }

  if (list.length) {
    list.sort((a, b) => (Number(b.itag) || 0) - (Number(a.itag) || 0));
    if ($('#quality')) {
      $('#quality').innerHTML = list.map((s, i) => `<option value="${i}">${s.label || s.quality || `Qualidade ${i + 1}`}</option>`).join('');
      $('#quality').onchange = () => playDirectStream(list[Number($('#quality').value)]);
    }
    if (playDirectStream(list[0])) {
      status(`Stream resolvido (${source}) — expira em ~30 min.`);
      return;
    }
  }

  if (lastIframe && renderIframePlayer(lastIframe)) {
    status(`Player embed carregado (${source}).`);
    return;
  }

  errorScreen();
}

async function loadSourcesSelect() {
  const meta = await fetch(apiUrl('/api/sources')).then((r) => r.json()).catch(() => null);
  const sources = meta?.sources || [];
  if (!sources.length || $('#srvSelect')) return;
  const sel = document.createElement('select');
  sel.id = 'srvSelect';
  sel.className = 'tag';
  sel.innerHTML = sources.map((s) => `<option value="${s.id}" ${s.id === source ? 'selected' : ''}>${s.name}</option>`).join('');
  sel.onchange = () => { source = sel.value; saveSource(source); resolveStream(); loadList(); };
  ($('#ctrl') || document.body).prepend(sel);
}

async function loadList() {
  const a = await fetch(apiUrl(`/api/anime/${encodeURIComponent(slug)}?source=${encodeURIComponent(source)}`))
    .then((r) => r.json()).catch(() => null);

  const eps = (a?.seasons || []).flatMap((s) => s.episodes || []).sort((x, y) => x.number - y.number);
  if ($('#eps')) {
    $('#eps').innerHTML = eps.map((e) => {
      const q = new URLSearchParams({ source, slug, ep: e.id ?? e.number, n: e.number, season, audio }).toString();
      return `<a href="player.html?${q}" class="${Number(e.number) === current ? 'on' : ''}"><span>EP ${e.number}</span></a>`;
    }).join('');
  }

  const next = nextEpisodeOf(eps);
  if (next && player) {
    player.on('timeupdate', () => {
      const d = player.duration;
      if (!d || !autoNextOn() || cardShown) return;
      if (d - player.currentTime <= 15) { cardShown = true; showNextCard(next); }
    });
    player.on('ended', () => { if (autoNextOn()) { clearNextCard(); goTo(next.number); } });
  }

  if (a?.title) {
    document.title = `${a.title} — EP ${current}`;
    if ($('#back')) $('#back').href = `detail.html?source=${encodeURIComponent(source)}&slug=${encodeURIComponent(slug)}`;
  }
}

if ($('#audio')) {
  $('#audio').value = audio;
  $('#audio').onchange = () => { audio = $('#audio').value; resolveStream(); };
}
if ($('#retry')) $('#retry').onclick = () => { tries = 0; resolveStream(); };

loadSourcesSelect();
resolveStream();
loadList();