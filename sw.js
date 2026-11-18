// Scope-relative caching supports both https://USER.github.io/REPO/ and localhost/.
const VERSION='moy-budget-pages-v4.12.1';
const FILES=['./','./index.html','./styles.css','./src/app.mjs','./src/core.mjs','./src/storage.mjs','./src/finance.mjs','./src/debts.mjs','./src/xlsx.mjs','./src/bank.mjs','./icon.svg','./apple-touch-icon.png','./manifest.webmanifest'];
const root=new URL(self.registration.scope);
const asset=part=>new URL(part,root).href;
self.addEventListener('install',event=>event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(FILES.map(asset))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('moy-budget-')&&k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==root.origin||!url.href.startsWith(root.href))return;
  event.respondWith(fetch(request).then(response=>{
    if(response.ok){const copy=response.clone();event.waitUntil(caches.open(VERSION).then(cache=>cache.put(request,copy)));}
    return response;
  }).catch(async()=> (await caches.match(request)) || (request.mode==='navigate' ? await caches.match(asset('./index.html')) : Response.error())));
});
