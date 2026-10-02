// Service worker do match.IA — estratégia "network-first" (sempre busca a versão
// mais nova primeiro; só usa o cache se a rede falhar). Isso dá suporte offline
// básico sem esconder alterações recentes.
//
// Guarda só o que é do próprio site e leve: páginas, CSS, JS e imagens da
// interface. Fica de fora a API (sempre ao vivo), outros domínios (CDNs: cada
// resposta opaca ocupa vários MB da cota do navegador) e mídia pesada (3D,
// áudio), que encheriam o armazenamento do visitante sem necessidade.
// Mudou a lista acima? Troque CACHE_NAME para os navegadores descartarem o antigo.
const CACHE_NAME = 'matchia-v2';
const APP_SHELL = [
  './index.html',
  './assets/css/style.css',
  './assets/js/api.js',
  './assets/js/site.js',
  './assets/js/theme.js',
  './assets/img/icon-192.png',
  './assets/img/icon-512.png',
  './manifest.json',
];
const SKIP = /\/api\/|\/assets\/(3d|audio)\/|\.(glb|hdr|mp3|wasm)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || SKIP.test(url.pathname)) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
