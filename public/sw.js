// Офлайн-режим: файлы приложения и рецепты берём с сервера, а без интернета — из кэша (только чтение).
const CACHE = 'knizhechka-v3';
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon.svg',
  'js/app.js', 'js/state.js', 'js/store.js', 'js/ui.js', 'js/units.js',
  'js/parse.js', 'js/photos.js', 'js/recipe.js', 'js/edit.js', 'js/print.js', 'js/ai.js', 'js/aikey.js',
];
// Шрифты и библиотека Claude не меняются по одному адресу — их можно брать сразу из кэша
const IMMUTABLE = ['https://fonts.gstatic.com/', 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = req.url;

  if (IMMUTABLE.some((p) => url.startsWith(p))) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    })));
    return;
  }

  const sameOrigin = new URL(url).origin === self.location.origin;
  const fontsCss = url.startsWith('https://fonts.googleapis.com/');
  if (!sameOrigin && !fontsCss) return;

  // no-cache: браузер всегда сверяется с сайтом, чтобы после обновления не застрять на старых файлах
  e.respondWith(
    fetch(req, sameOrigin ? { cache: 'no-cache' } : undefined)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))),
  );
});
