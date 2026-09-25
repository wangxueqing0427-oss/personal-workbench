const CACHE='personal-workbench-v150t-c',FILES=['./v150t.html?v=1500925c','./app-v150t.js?v=1500925c','./style.css?v=1500925c'];
self.addEventListener('install',function(event){event.waitUntil(caches.open(CACHE).then(function(cache){return cache.addAll(FILES)}).then(function(){return self.skipWaiting()}))});
self.addEventListener('activate',function(event){event.waitUntil(caches.keys().then(function(keys){return Promise.all(keys.filter(function(key){return key.indexOf('personal-workbench-')===0&&key!==CACHE}).map(function(key){return caches.delete(key)}))}).then(function(){return self.clients.claim()}))});
self.addEventListener('fetch',function(event){if(event.request.method!=='GET')return;event.respondWith(fetch(event.request).then(function(response){if(response.ok){var copy=response.clone();caches.open(CACHE).then(function(cache){cache.put(event.request,copy)})}return response}).catch(function(){return caches.match(event.request)}))});

