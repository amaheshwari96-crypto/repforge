const CACHE='repforge-final-v6';
const CORE=['./','./index.html','./styles.css','./app.js','./manifest.json','./icon-192.png','./icon-512.png','./firebase-config.js','./sync.js','./libs/chart.umd.js','./libs/jspdf.umd.min.js','./libs/firebase-app-compat.js','./libs/firebase-auth-compat.js','./libs/firebase-firestore-compat.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(res=>{const copy=res.clone();if(e.request.url.startsWith(self.location.origin))caches.open(CACHE).then(c=>c.put(e.request,copy));return res}).catch(()=>caches.match('./index.html'))))});
self.addEventListener('message',e=>{if(e.data==='skipWaiting')self.skipWaiting()});
