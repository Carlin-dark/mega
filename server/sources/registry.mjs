import animesonline from './animesonline.mjs';
import animefire from './animefire.mjs';
import betteranime from './betteranime.mjs';
import animesroll from './animesroll.mjs';
import anitube from './anitube.mjs';

export const SOURCES = new Map(
  [animesonline, animefire, betteranime, animesroll, anitube].map(s => [s.meta.id, s])
);

export const DEFAULT_SOURCE = 'animesonline';

export function getSource(id) {
  return SOURCES.get(id || DEFAULT_SOURCE) || SOURCES.get(DEFAULT_SOURCE);
}

export const listSources = () => [...SOURCES.values()].map(s => s.meta);