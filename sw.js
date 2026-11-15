/* Network-first navigation, offline shell only. Hazard and warning data are NEVER cached. */
const CACHE="skypulse-shell-v7";
const SHELL=["./","./index.html","./offline.html","./assets/styles.css","./assets/leaflet.css","./assets/app.js","./assets/push.js","./assets/push-config.js","./assets/icon.svg","./manifest.webmanifest","./privacy.html","./terms.html","./sources.html"];
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
/* Push payloads intentionally contain no private data; cloud gateway sends empty pushes. */
self.addEventListener("push",event=>{
  const url=new URL("./#hazards",self.registration.scope).href;
  event.waitUntil(self.registration.showNotification("SkyPulse AU — NSW RFS Update",{
    body:"An RFS warning area or incident update may be relevant to your saved watch zone. Verify current details with NSW RFS.",
    icon:"./assets/icon.svg",badge:"./assets/icon.svg",tag:"skypulse-rfs-update",
    data:{url},requireInteraction:false
  }));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const target=event.notification.data?.url||new URL("./#hazards",self.registration.scope).href;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    for(const windowClient of windows){
      if(new URL(windowClient.url).origin===new URL(target).origin){
        if("navigate" in windowClient)await windowClient.navigate(target);
        return windowClient.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
