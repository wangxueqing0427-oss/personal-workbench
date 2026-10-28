const release = self.__WORKBENCH_RELEASE__;
if (!release) {
if (self.location.hostname !== '127.0.0.1') throw new Error('Missing verified release');
const cacheName = 'workbench-v2-local-development';
const files = ['business.html', 'business.css', 'business-core.js', 'business-store.js', 'offline-sync.js', 'business-ui.js', 'sync-panel.js', 'staging.webmanifest', 'staging-init.js', 'p0.html', 'p0-ui.js', 'safety-core.js'];
files.push('device-pair.js');
self.addEventListener('install', event => event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(files)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !files.some(file => url.pathname === new URL(file, self.location).pathname)) return;
  event.respondWith(fetch(event.request).then(response => { if (response.ok) { const copied = response.clone(); event.waitUntil(caches.open(cacheName).then(cache => cache.put(event.request, copied))); } return response; }).catch(() => caches.open(cacheName).then(cache => cache.match(event.request))));
});
} else {
  const cacheName = 'workbench-v2-release-' + release.id;
  const base = new URL('./', self.location.href);
  async function checked(url, expected) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('Incomplete release');
    const bytes = await response.clone().arrayBuffer();
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
    if (sha256 !== expected.sha256 || bytes.byteLength !== expected.bytes) throw new Error('Release integrity failure');
    return response;
  }
  self.addEventListener('install', event => event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    for (const [name, expected] of Object.entries(release.entries)) { const url = new URL(name, base); await cache.put(url, await checked(url, expected)); }
    await self.skipWaiting();
  })()));
  self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url); if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return;
    const name = url.pathname.slice(base.pathname.length), expected = release.entries[name];
    if (!expected) return;
    event.respondWith((async () => { const cache = await caches.open(cacheName); return await cache.match(new URL(name, base)) || checked(new URL(name, base), expected); })());
  });
}
