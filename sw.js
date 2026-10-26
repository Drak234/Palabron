/* Palabrón service worker
   - The page itself is network-first, so every deploy shows up on the next visit.
   - Heavy, rarely-changing files (dictionary, creatures, fonts, icons) are cache-first:
     the game opens instantly and works offline once it has been visited.
   Bump VERSION whenever dic.txt, a sprite or a font changes. */
const VERSION='palabron-v12';
const CORE=['./','index.html','manifest.webmanifest','dic.txt','comunes.txt','icon-180.png','icon-192.png','icon-512.png',
  'fonts/lilita-one.woff2','fonts/nunito-700.woff2','fonts/nunito-800.woff2','fonts/nunito-900.woff2','vendor/peerjs.min.js'];
const LINES=['fuego','agua','planta','rayo','hielo','bicho','viento','sombra','tierra','normal','fantasma','planta2','fuego2'];
const SPRITES=LINES.flatMap(n=>Array.from({length:8},(_,i)=>`criaturas/${n}-${i+1}.webp`));
self.addEventListener('install',e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(CORE).then(()=>Promise.all(SPRITES.map(u=>c.add(u).catch(()=>{}))))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const url=new URL(req.url);if(url.origin!==location.origin||url.pathname.startsWith('/api/'))return;
  const isPage=req.mode==='navigate'||url.pathname.endsWith('/')||url.pathname.endsWith('.html');
  if(isPage){
    e.respondWith(fetch(req).then(r=>{if(r.ok){const cp=r.clone();caches.open(VERSION).then(c=>c.put(req,cp))}return r}).catch(()=>caches.match(req).then(m=>m||caches.match('index.html'))));
    return;
  }
  e.respondWith(caches.match(req).then(m=>m||fetch(req).then(r=>{if(r.ok&&r.type==='basic'){const cp=r.clone();caches.open(VERSION).then(c=>c.put(req,cp))}return r})));
});
