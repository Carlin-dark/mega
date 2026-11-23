/* Registro de fontes. A ORDEM aqui é a prioridade padrão do player.
   Pode ser reordenada em runtime por POST /api/priority (persistida em .priority.json). */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as animesonlinecc from './animesonlinecc.mjs';
import * as animesonline from './animesonline.mjs';
import * as animefire from './animefire.mjs';
import * as betteranime from './betteranime.mjs';
import * as animesroll from './animesroll.mjs';
import * as anitube from './anitube.mjs';

const ALL = [animesonlinecc, animesonline, animefire, betteranime, animesroll, anitube];
const byId = new Map(ALL.map((s) => [s.meta.id, s]));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', '.priority.json');

const DEFAULT_PRIORITY = ALL.map((s) => s.meta.id);

let PRIORITY = (() => {
  try {
    const saved = JSON.parse(readFileSync(FILE, 'utf8'));
    const clean = (Array.isArray(saved) ? saved : []).filter((id) => byId.has(id));
    if (clean.length) return [...new Set([...clean, ...DEFAULT_PRIORITY])];
  } catch {}
  return [...DEFAULT_PRIORITY];
})();

export const priorityIds = () => [...PRIORITY];

export const listSources = () =>
  PRIORITY.filter((id) => byId.has(id)).map((id) => ({ id, name: byId.get(id).meta.name }));

export const getSource = (id) => byId.get(String(id || '')) || byId.get(PRIORITY[0]) || ALL[0];

export const orderedSources = () => PRIORITY.map((id) => byId.get(id)).filter(Boolean);

export const setPriority = (ids = []) => {
  const clean = (Array.isArray(ids) ? ids : [])
    .map((x) => String(x || ''))
    .filter((id) => byId.has(id));
  const next = [...new Set([...clean, ...PRIORITY])];
  PRIORITY = next;
  try { writeFileSync(FILE, JSON.stringify(PRIORITY)); } catch {}
  return priorityIds();
};

export const defaultSourceId = () => PRIORITY[0] || ALL[0].meta.id;

export const DEFAULT_SOURCE = PRIORITY[0] || ALL[0].meta.id;

export const allSources = () => [...ALL];