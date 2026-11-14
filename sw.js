/* Network-first navigation, offline shell only. Hazard and warning data are NEVER cached. */
const CACHE="skypulse-shell-v5";
const SHELL=["./","./index.html","./offline.html","./assets/styles.css","./assets/leaflet.css","./assets/app.js","./assets/icon.svg","./manifest.webmanifest","./privacy.html","./terms.html","./sources.html"];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",event=>{
 if(event.request.method!=="GET")return;
 const u=new URL(event.request.url);
 if(u.origin!==self.location.origin)return;
 if(u.pathname.includes("/data/"))return;
 if(event.request.mode==="navigate"){event.respondWith(fetch(event.request).catch(async()=>await caches.match(event.request)||await caches.match("./offline.html")));return;}
 event.respondWith(fetch(event.request).then(response=>{if(response.ok&&u.pathname.startsWith(new URL(self.registration.scope).pathname)){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}return response;}).catch(()=>caches.match(event.request)));
});