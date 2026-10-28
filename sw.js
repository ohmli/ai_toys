/* Service worker: lets the app shell and TensorFlow.js work offline after the first visit.
   Bump CACHE when you want every visitor to drop old copies. */
const CACHE='nst-v1';
const SHELL=['style_transfer.html','css/style.css','js/presets.js','js/model.js','js/pipeline.js','js/app.js','manifest.webmanifest','icons/icon.svg'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

function remember(req,res){
  if(res&&(res.ok||res.type==='opaque')){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy))}
  return res;
}
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  // TensorFlow.js from a CDN: cache-first (the version is pinned in the URL).
  if(/\/@tensorflow\/tfjs@/.test(url.pathname)){
    e.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(r=>remember(req,r))));
    return;
  }
  // Own files: network-first so deploys show up immediately, cache as the offline fallback.
  if(url.origin===location.origin){
    e.respondWith(fetch(req).then(r=>remember(req,r)).catch(()=>caches.match(req).then(h=>h||caches.match('style_transfer.html'))));
  }
});
