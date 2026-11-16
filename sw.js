/* SkyPulse AU — release-specific offline shell and explicit update lifecycle.
 * Feed snapshots and version metadata are NETWORK ONLY: never return stale hazard information.
 */
const CACHE="skypulse-shell-__SKYPULSE_BUILD__";
const PREFIX="skypulse-shell-";
const SHELL=["./","./index.html","./offline.html","./assets/styles.css",
"./assets/leaflet.css","./assets/app.js","./assets/clouds.js","./assets/push.js","./assets/push-config.js",
"./assets/update.js","./assets/icon.svg","./manifest.webmanifest",
"./forecast.html","./radar.html","./hazards.html","./news.html","./settings.html","./privacy.html",
"./terms.html","./sources.html"];
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));
});
self.addEventListener("message",event=>{
  if(event.data&&event.data.type==="SKYPULSE_ACTIVATE_UPDATE")self.skipWaiting();
});
self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    const cacheNames=(await caches.keys()).filter(name=>name.startsWith(PREFIX));
    const preserved=new Set([CACHE,...cacheNames.filter(name=>name!==CACHE).slice(-1)]);
    await Promise.all(cacheNames.filter(name=>!preserved.has(name)).map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET")return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  const scope=new URL(self.registration.scope).pathname;
  if(!url.pathname.startsWith(scope))return;
  if(url.pathname.includes("/data/")||url.pathname.endsWith("/app-version.json")||
     url.pathname.endsWith("/sw.js"))return;
  if(request.mode==="navigate"){
    event.respondWith(fetch(request,{cache:"no-store"}).then(async res=>{
      if(res.ok&&res.type==="basic"){
        const cache=await caches.open(CACHE);
        await cache.put(request,res.clone());
      }
      return res;
    }).catch(async()=>await caches.match(request)||await caches.match("./offline.html")));
    return;
  }
  event.respondWith(fetch(request).then(async res=>{
    if(res.ok){
      const cache=await caches.open(CACHE);
      await cache.put(request,res.clone());
    }
    return res;
  }).catch(async()=>{
    const cached=await caches.match(request);
    if(cached)return cached;
    const bare=new URL(request.url);bare.search="";
    return caches.match(bare.href);
  }));
});
/* Push payloads intentionally contain no private data; cloud gateway sends empty pushes. */
self.addEventListener("push",event=>{
  const url=new URL("./hazards.html",self.registration.scope).href;
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
