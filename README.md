# Mega Anime

App de catálogo/player do animesonline.blue (scraper próprio, sem API de terceiros).

## Rodar
npm install
npm start           # http://localhost:8787

## Endpoints
GET /api/home
GET /api/catalog?page=1
GET /api/search?q=naruto
GET /api/anime/:slug
GET /api/streams/:slug/:ep?season=1&audio=leg|dub
GET /img?u=<url_encoded>

## APK
1. Copie web/* + assets/config.js para android/src/main/assets/web/
2. Ajuste API_BASE (10.0.2.2 no emulador, IP da LAN no celular)
3. ./gradlew assembleDebug

## Notas
- Player é iframe do blogger: o mp4 expira (~30 min), resolva no toque do play.
- `?t=` é a temporada; sem ele volta sempre à T1.
- Se o site mudar de layout, só `scraper-utils.js` muda.