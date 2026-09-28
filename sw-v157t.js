const CACHE='personal-workbench-v157t-pwa1',VERSION='1570927pwa1';
const CORE=['v157t.html','index.html','manifest.json','style.css','app-v157t.js'];
const urls=CORE.map(function(file){return './'+file+'?v='+VERSION});
self.addEventListener('install',function(event){event.waitUntil(caches.open(CACHE).then(function(cache){return cache.addAll(urls)}).then(function(){return self.skipWaiting()}))});
self.addEventListener('activate',function(event){event.waitUntil(caches.keys().then(function(keys){return Promise.all(keys.filter(function(key){return key.startsWith('personal-workbench-')&&key!==CACHE}).map(function(key){return caches.delete(key)}))}).then(function(){return self.clients.claim()}))});
self.addEventListener('fetch',function(event){if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;event.respondWith(fetch(event.request).then(function(response){if(response.ok){var copy=response.clone();caches.open(CACHE).then(function(cache){cache.put(event.request,copy)})}return response}).catch(function(){return caches.match(event.request).then(function(cached){if(cached)return cached;if(event.request.mode==='navigate')return caches.match('./v157t.html?v='+VERSION);return Response.error()})}))});

