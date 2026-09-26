const CACHE='personal-workbench-v151t',FILES=['./v151t.html?v=1510926','./app-v151t.js?v=1510926','./style.css?v=1510926'];
self.addEventListener('install',function(event){event.waitUntil(caches.open(CACHE).then(function(cache){return cache.addAll(FILES)}).then(function(){return self.skipWaiting()}))});
self.addEventListener('activate',function(event){event.waitUntil(self.clients.claim())});
self.addEventListener('fetch',function(event){if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;event.respondWith(fetch(event.request).then(function(response){if(response.ok){var copy=response.clone();caches.open(CACHE).then(function(cache){cache.put(event.request,copy)})}return response}).catch(function(){return caches.match(event.request)}))});

