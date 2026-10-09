const cacheName = 'workbench-v2-isolated-offline-1';
const files = ['business.html', 'business.css', 'business-core.js', 'business-store.js', 'offline-sync.js', 'business-ui.js', 'sync-panel.js'];
self.addEventListener('install', event => event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(files)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !files.some(file => url.pathname === new URL(file, self.location).pathname)) return;
  event.respondWith(fetch(event.request).then(response => { if (response.ok) { const copied = response.clone(); event.waitUntil(caches.open(cacheName).then(cache => cache.put(event.request, copied))); } return response; }).catch(() => caches.open(cacheName).then(cache => cache.match(event.request))));
});
