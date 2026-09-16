const CACHE="personal-workbench-v052-ai-timeout";
const ASSETS=["./","./index.html","./style.css?v=052","./app.js?v=052","./manifest.json"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener("fetch",e=>{
  const req=e.request;
  if(req.mode==="navigate"){
    e.respondWith(fetch(req).then(resp=>{const copy=resp.clone();caches.open(CACHE).then(c=>c.put("./index.html",copy));return resp;}).catch(()=>caches.match("./index.html")));
    return;
  }
  e.respondWith(caches.match(req).then(r=>r||fetch(req).then(resp=>{const copy=resp.clone();caches.open(CACHE).then(c=>c.put(req,copy));return resp;})));
});
