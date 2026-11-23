import { $ } from './ui.js';

const p = new URLSearchParams(location.search);
const source = p.get('source') || 'animesonline';
const slug = p.get('slug');
const ep = p.get('ep');
let audio = p.get('audio') || 'leg';
let current = Number(p.get('n') || 0);

const player = new Plyr('#video', { controls: ['play','progress','current-time','duration','mute','volume','settings','fullscreen'] });
const status = t => ($('#status').textContent = t);

async function resolveStream() {
  status('Resolvendo links...');
  $('#quality').innerHTML = '';
  const data = await fetch(`/api/streams/${source}/${encodeURIComponent(slug)}/${encodeURIComponent(ep)}?audio=${audio}`)
    .then(r => r.json()).catch(() => null);

  const list = (data?.sources || []).filter(s => s.url);
  if (!list.length) { status('Nenhum link jogável encontrado. Tente o outro áudio ou recarregue.'); return; }

  $('#quality').innerHTML = list.map((s, i) => `<option value="${i}">${s.label}</option>`).join('');
  $('#quality').onchange = () => play(list[Number($('#quality').value)]);
  play(list[0]);
  status(`Links resolvidos às ${new Date().toLocaleTimeString('pt-BR')} — expiram em ~30 min.`);
}

function play(s) {
  if (!s) return;
  const proxied = `/api/proxy-stream?u=${encodeURIComponent(s.url)}&ref=${encodeURIComponent(s.referer || '')}`;
  player.source = { type: 'video', sources: [{ src: proxied, type: s.mime || 'video/mp4' }] };
  player.play().catch(() => {});
}

async function loadList() {
  const a = await fetch(`/api/anime/${source}/${encodeURIComponent(slug)}`).then(r => r.json()).catch(() => null);
  const eps = (a?.seasons || []).flatMap(s => s.episodes || []).sort((x, y) => x.number - y.number);
  $('#eps').innerHTML = eps.map(e => {
    const q = new URLSearchParams({ source, slug, ep: e.id, n: e.number, audio }).toString();
    return `<a href="/player.html?${q}" class="${e.number === current ? 'on' : ''}"><span>EP ${e.number}</span></a>`;
  }).join('');
  const idx = eps.findIndex(e => e.number === current);
  const next = eps[idx + 1];
  if (next) player.on('ended', () => {
    const q = new URLSearchParams({ source, slug, ep: next.id, n: next.number, audio }).toString();
    location.href = `/player.html?${q}`;
  });
  if (a?.title) { document.title = `${a.title} — EP ${current}`; $('#back').href = `/detail.html?source=${source}&slug=${encodeURIComponent(slug)}`; }
}

$('#audio').value = audio;
$('#audio').onchange = () => { audio = $('#audio').value; resolveStream(); };
$('#retry').onclick = resolveStream;

resolveStream();
loadList();