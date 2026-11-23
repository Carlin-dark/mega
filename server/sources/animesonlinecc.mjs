/* Servidor 1. Reaproveita o scraper do animesonline, mas com identidade própria
   (o registry.mjs importa este módulo como './animesonlinecc.mjs'). */
import base from './animesonline.mjs';

export const meta = {
  ...base.meta,
  id: 'animesonlinecc',
  name: 'AnimesOnlineCC',
};

export const home = base.home;
export const catalog = base.catalog;
export const search = base.search;
export const anime = base.anime;
export const streams = base.streams;

export default { meta, home, catalog, search, anime, streams };