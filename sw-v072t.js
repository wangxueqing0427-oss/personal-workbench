const CACHE_NAME="personal-workbench-v072t-tomorrow-plan";
const ASSETS=["./v072t.html","./app-v067t.js","./app-v068t.js","./app-v069t.js","./app-v070t.js","./app-v071t.js","./app-v072t.js","./style.css?v=072","./manifest.json"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("personal-workbench-")&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));return response}))));
