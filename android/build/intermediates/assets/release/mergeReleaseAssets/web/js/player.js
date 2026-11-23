import { $, apiUrl, savedSource, saveSource } from './ui.js';

const p = new URLSearchParams(location.search);
let source = p.get('source') || savedSource();
let slug = p.get('slug');
let ep = p.get('ep') || p.get('n') || '1';
let season = Number(p.get('season') || 1);
let audio = p.get('audio') || 'leg';
let current = Number(p.get('n') || ep || 1);

const plyrEl = $('#video');
const player = plyrEl
  ? new Plyr(plyrEl, { controls: ['play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'settings', 'fullscreen'] })
  : null;

const status = t => { if ($('#status')) $('#status').textContent = t; };

function isSiteAnimePage(u = '') {
  try {
    const parsed = new URL(u);
    return /\/anime\/[^/]+$/i.test(parsed.pathname) && !parsed.searchParams.get('ep');
  } catch {
    return false;
  }
}

function renderIframePlayer(iframeUrl) {
  if (!iframeUrl || isSiteAnimePage(iframeUrl)) return false;
  const stage = $('#stage') || plyrEl?.parentElement;
  if (!stage) return false;
  if (player) {
    try { player.pause(); } catch {}
  }
  stage.innerHTML = `<iframe
    src="${iframeUrl}"
    allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
    allowfullscreen
    referrerpolicy="no-referrer-when-downgrade"
    style="width:100%;height:100%;border:0;display:block"
  ></iframe>`;
  return true;
}

function playDirectStream(s) {
  if (!s?.url || isSiteAnimePage(s.url)) return false;
  const proxied = apiUrl(`/api/proxy-stream?u=${encodeURIComponent(s.url)}&ref=${encodeURIComponent(s.referer || '')}`);

  if (player && plyrEl) {
    player.source = {
      type: 'video',
      sources: [{ src: proxied, type: s.mime || 'video/mp4' }],
    };
    player.play().catch(() => {});
    return true;
  }

  const stage = $('#stage');
  if (stage) {
    stage.innerHTML = `<video controls autoplay playsinline src="${proxied}" style="width:100%;height:100%;display:block"></video>`;
    return true;
  }
  return false;
}

async function resolveStream() {
  status('Resolvendo episódio...');
  if ($('#quality')) $('#quality').innerHTML = '';

  const qs = new URLSearchParams({
    source,
    audio,
    season: String(season),
    n: String(current),
  }).toString();

  const data = await fetch(apiUrl(`/api/streams/${encodeURIComponent(slug)}/${encodeURIComponent(ep)}?${qs}`))
    .then(r => r.json())
    .catch(() => null);

  const list = (data?.sources || data?.streams || []).filter(s => (s.url || s.proxyUrl) && !isSiteAnimePage(s.url || s.proxyUrl));
  const iframe = data?.iframe && !isSiteAnimePage(data.iframe) ? data.iframe : null;

  if (list.length) {
    if ($('#quality')) {
      $('#quality').innerHTML = list.map((s, i) => `<option value="${i}">${s.label || s.quality || `Qualidade ${i + 1}`}</option>`).join('');
      $('#quality').onchange = () => {
        const chosen = list[Number($('#quality').value)];
        if (!playDirectStream(chosen) && iframe) renderIframePlayer(iframe);
      };
    }
    const okPlay = playDirectStream(list[0]);
    if (okPlay) {
      status(`Stream resolvido (${source}) — expira em ~30 min.`);
      return;
    }
  }

  if (iframe && renderIframePlayer(iframe)) {
    status(`Player embed carregado (${source}).`);
    return;
  }

  status('Nenhum stream de vídeo encontrado para este episódio. Troque o servidor ou o áudio.');
}

async function loadSourcesSelect() {
  const meta = await fetch(apiUrl('/api/sources')).then(r => r.json()).catch(() => null);
  const sources = meta?.sources || [];
  if (!sources.length || $('#srvSelect')) return;

  const sel = document.createElement('select');
  sel.id = 'srvSelect';
  sel.className = 'tag';
  sel.innerHTML = sources.map(s => `<option value="${s.id}" ${s.id === source ? 'selected' : ''}>${s.name}</option>`).join('');
  sel.onchange = () => {
    source = sel.value;
    saveSource(source);
    resolveStream();
    loadList();
  };
  ($('#ctrl') || document.body).prepend(sel);
}

async function loadList() {
  const a = await fetch(apiUrl(`/api/anime/${encodeURIComponent(slug)}?source=${encodeURIComponent(source)}`))
    .then(r => r.json())
    .catch(() => null);

  const eps = (a?.seasons || []).flatMap(s => s.episodes || []).sort((x, y) => x.number - y.number);
  if ($('#eps')) {
    $('#eps').innerHTML = eps.map(e => {
      const q = new URLSearchParams({
        source,
        slug,
        ep: e.id ?? e.number,
        n: e.number,
        season,
        audio,
      }).toString();
      return `<a href="player.html?${q}" class="${e.number === current ? 'on' : ''}"><span>EP ${e.number}</span></a>`;
    }).join('');
  }

  const idx = eps.findIndex(e => e.number === current);
  const next = eps[idx + 1];
  if (next && player) {
    player.on('ended', () => {
      const q = new URLSearchParams({
        source,
        slug,
        ep: next.id ?? next.number,
        n: next.number,
        season,
        audio,
      }).toString();
      location.href = `player.html?${q}`;
    });
  }

  if (a?.title) {
    document.title = `${a.title} — EP ${current}`;
    if ($('#back')) $('#back').href = `detail.html?source=${encodeURIComponent(source)}&slug=${encodeURIComponent(slug)}`;
  }
}

if ($('#audio')) {
  $('#audio').value = audio;
  $('#audio').onchange = () => {
    audio = $('#audio').value;
    resolveStream();
  };
}
if ($('#retry')) $('#retry').onclick = resolveStream;

loadSourcesSelect();
resolveStream();
loadList();