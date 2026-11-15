#!/usr/bin/env node
/** Browser check of NSW warning areas, RFS fire extents, geofencing and stale feeds. */
import {chromium} from "playwright";
import {spawn} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";
const server=spawn("python",["-m","http.server","8768","--bind","127.0.0.1"],{stdio:"ignore",cwd:process.cwd()});
let browser;
try{
 await delay(1100);browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 await page.addInitScript(()=>{
  if(!localStorage.getItem("skypulse.preferences"))localStorage.setItem("skypulse.preferences",JSON.stringify({
   location:{name:"Cessnock",region:"New South Wales",lat:-32.8321,lon:151.3497},theme:"dark",radius:50,notify:false}));
  window.__fireLayers=[];window.__fireZooms=0;
  const layer=(kind,opts={})=>{
   const v={kind,opts,features:[],handlers:{},
    on(name,fn){this.handlers[name]=fn;return this;},
    addTo(target){if(target?.features)target.features.push(this);
     if(kind==="marker"&&opts.icon?.options?.html){
      const mapEl=document.querySelector("#fire-area-map");
      if(mapEl){const wrapper=document.createElement("div");wrapper.innerHTML=opts.icon.options.html;this.domNode=wrapper.firstElementChild;mapEl.append(this.domNode);}
     }
     return this;
    },
    bindPopup(s){this.popup=s;return this;},
    clearLayers(){this.features.forEach(x=>x.domNode?.remove());this.features=[];return this;},
    setLatLng(){return this;}
   };window.__fireLayers.push(v);return v;
  };
  let zoom=9;const mapEvents={};
  const map={
   setView(coords,z){if(Number.isFinite(z)&&z!==zoom){zoom=z;mapEvents.zoomend?.();}return this;},
   fitBounds(){window.__fireZooms++;return this;},
   on(events,cb){String(events).split(/\s+/).forEach(name=>{mapEvents[name]=cb;});return this;},
   invalidateSize(){return this;},removeLayer(){return this;},
   zoomIn(){zoom++;mapEvents.zoomend?.();return this;},
   zoomOut(){zoom--;mapEvents.zoomend?.();return this;},
   getCenter(){return {lat:-32.83,lng:151.35};},getZoom(){return zoom;},
   scrollWheelZoom:{enable(){},disable(){}}
  };
  window.__fireTestMap=map;
  window.L={map(){return map;},tileLayer(url,opts){return layer("tiles",opts||{});},layerGroup(){return layer("group");},
   polygon(v,opts){let z=layer("polygon",opts);z.coords=v;return z;},
   marker(v,opts){let z=layer("marker",opts);z.coords=v;return z;},
   divIcon(opts){return {options:opts}},
   circleMarker(v,opts){let z=layer("point",opts);z.coords=v;return z;},
   circle(v,opts){let z=layer("circle",opts);z.coords=v;return z;},latLngBounds(){return {pad(){return this;}}},
   control:{scale(){return layer("scale");}}};
 });
 let stale=false,dense=false;const now=new Date().toISOString(),old=new Date(Date.now()-4*3600000).toISOString();
 const poly=[[-32.86,151.31],[-32.86,151.38],[-32.81,151.38],[-32.81,151.31],[-32.86,151.31]];
 const footprint=[[151.32,-32.86],[151.37,-32.86],[151.37,-32.81],[151.32,-32.81],[151.32,-32.86]];
 await page.route("**/*",route=>{
  const u=new URL(route.request().url()),file=u.pathname.split("/").pop();
  if(u.hostname==="127.0.0.1"&&u.pathname.startsWith("/data/")){
   let payload={error:"Not available",retrieved_at:null};
   if(file==="rfs-alerts.json")payload={retrieved_at:stale?old:now,alerts:[
    {id:"warning1",headline:"Emergency Warning - Cessnock",alert_level:"Emergency Warning",
     sent:now,severity:"Severe",instruction:"Follow RFS advice",area_names:["Cessnock"],polygons:[poly]},
    {id:"warning2",headline:"Bushfire information",alert_level:"Unspecified",sent:now,polygons:[]}]};
   if(file==="rfs.json")payload={retrieved_at:stale?old:now,features:[
    {id:"fire1",properties:{title:"Test Fire",category:"Advice",details:{
      alert_level:"Advice",location:"MCFARLANE ST, CESSNOCK 2325",council_area:"Cessnock",
      status:"Under control",incident_type:"Bush Fire",fire:"Yes",size:"93 ha",
      responsible_agency:"Rural Fire Service",updated:"16 Nov 2026 09:50",
      updated_at:"2026-11-16T09:50:00+11:00"}},geometry:{type:"GeometryCollection",geometries:[
     {type:"Point",coordinates:[151.345,-32.83]},{type:"Polygon",coordinates:[footprint]}]}},
     {id:"fire2",properties:{title:"Remote Northern NSW Fire",category:"Advice",details:{alert_level:"Advice",status:"Being controlled",location:"Northern NSW"}},
      geometry:{type:"Point",coordinates:[153.15,-28.55]}},
    ...["Grass Fire","Hazardous Materials Spill","Flood Incident","Severe Storm","Road Crash","Rescue Incident"].map((name,i)=>({
      id:"typed-"+i,properties:{title:name,details:{incident_type:name,location:"Northern NSW"}},
      geometry:{type:"Point",coordinates:[153.1+i*.04,-28.6-i*.03]}
    })),
    ...(dense?[
      {id:"near-1",properties:{title:"Nearby Grass Fire",details:{incident_type:"Grass Fire",location:"Cessnock district"}},
       geometry:{type:"Point",coordinates:[151.3455,-32.8301]}},
      {id:"near-2",properties:{title:"Nearby Bush Fire",details:{incident_type:"Bush Fire",location:"Cessnock district"}},
       geometry:{type:"Point",coordinates:[151.3448,-32.8303]}}
    ]:[])]};
   if(file==="fdr.json")payload={retrieved_at:now,districts:[{name:"Greater Hunter",rating_today:"Moderate",rating_tomorrow:"Moderate"}]};
   return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(payload)});
  }
  if(u.hostname==="127.0.0.1")return route.continue();
  return route.abort();
 });
 await page.goto("http://127.0.0.1:8768/hazards.html",{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>document.querySelector("#fire-geofence-state")?.textContent.includes("contain your selected location"),{timeout:15000});
 // Original OpenStreetMap imagery must remain unfiltered; only the incident information panel is dark.
 const appearance=await page.evaluate(()=>{
  const map=document.querySelector("#fire-area-map");
  const base=document.createElement("img");base.className="leaflet-tile";map.append(base);
  const popup=document.createElement("div");popup.className="leaflet-popup-content-wrapper";
  popup.innerHTML='<div class="leaflet-popup-content"><div class="incident-popup"><div class="incident-popup-heading"><b>Fire details</b></div><dl class="incident-detail-list"><div class="incident-detail-row"><dt>Status</dt><dd>Under control</dd></div></dl></div></div>';
  map.append(popup);
  return {tile:getComputedStyle(base).filter,background:getComputedStyle(popup).backgroundColor,
    text:getComputedStyle(popup.querySelector(".incident-detail-row dd")).color,
    theme:document.documentElement.dataset.theme};
 });
 if(appearance.tile!=="none"||appearance.theme!=="dark"||
   appearance.background!=="rgb(17, 40, 62)"||appearance.text!=="rgb(239, 247, 255)")
  throw Error("Dark incident panel or original map image failed: "+JSON.stringify(appearance));
 await page.locator("#theme-button").click();
 const lightPanel=await page.evaluate(()=>getComputedStyle(document.querySelector("#fire-area-map .leaflet-popup-content-wrapper")).backgroundColor);
 if(lightPanel!=="rgb(255, 255, 255)")throw Error("Light site theme should use a light information panel, not change the map: "+lightPanel);
 await page.locator("#theme-button").click();
 console.log("Fire map panels PASSED: original map imagery, dark details in dark UI, light details in light UI.");
 const rows=await page.evaluate(()=>({
  polygons:window.__fireLayers.filter(x=>x.kind==="polygon").map(x=>({
   colour:x.opts.color,hasPopup:!!x.popup,clickable:typeof x.handlers.click==="function"})),
  markers:window.__fireLayers.filter(x=>x.kind==="marker").map(x=>({
   html:x.opts.icon?.options?.html||"",hasPopup:!!x.popup,clickable:typeof x.handlers.click==="function"})),
  health:document.querySelector("#fire-warning-feed-health").textContent,
  fire:document.querySelector("#fire-incident-feed-health").textContent,
  cards:document.querySelectorAll("[data-warning-index]").length,
  legend:document.querySelector("#fire-map-legend")?.textContent||""
 }));
 if(!rows.polygons.some(x=>x.colour==="#e9555c"&&x.clickable))
  throw Error("Warning boundary not selectable");
 if(!rows.polygons.some(x=>x.colour==="#bc94e7"&&x.clickable))
  throw Error("Incident extent not selectable");
 if(rows.polygons.some(x=>x.hasPopup)||rows.markers.some(x=>x.hasPopup))
  throw Error("Fire Explorer binds a duplicate Leaflet popup as well as the right details panel");
 if(!rows.markers.some(x=>x.html.includes('data-fire-marker-kind="incident"')&&x.html.includes("fire-map-pin-fire")&&x.clickable))
  throw Error("Bush Fire must use a semantic flame map icon with a click handler");
 if(!rows.markers.some(x=>x.html.includes("fire-map-pin-location")))
  throw Error("Monitoring location must use a distinct location pin");
 for(const value of ["Bush Fire","Grass Fire","Hazmat","Flood","Storm","Road","Advice","Watch and Act","Emergency Warning","Incident Extent"]){
   if(!rows.legend.includes(value))throw Error("Missing "+value+" in icon/area legend");
 }
 for(const kind of ["fire","grass","hazmat","flood","storm","road","rescue"]){
  if(!rows.markers.some(x=>x.html.includes("fire-map-pin-"+kind)))
   throw Error("Official incident-type marker missing symbol "+kind);
 }
 const listed=await page.locator("#incidents-list .incident-rich-card").first().textContent();
 for(const value of ["Advice","Under control","93 ha","MCFARLANE ST, CESSNOCK 2325"]){
   if(!listed.includes(value))throw Error("Nearby incident summary missing "+value);
 }
 await page.locator("#incidents-list .incident-details-panel summary").first().click();
 const expanded=await page.locator("#incidents-list .incident-details-panel").first().textContent();
 for(const value of ["Council area","Responsible agency","Rural Fire Service","Incident updated"]){
   if(!expanded.includes(value))throw Error("Expandable incident details missing "+value);
 }

 if(rows.cards!==1||!rows.health.includes("1 published polygon")||!rows.fire.includes("1 published mapped area"))throw Error("Polygon source status/count incorrect: "+JSON.stringify(rows));
 // The primary incident workspace should be compact, interactive and factually grounded.
 const kpis=await page.evaluate(()=>({
  near:document.querySelector("#fire-summary-incidents")?.textContent,
  warnings:document.querySelector("#fire-summary-warnings")?.textContent,
  extents:document.querySelector("#fire-summary-extents")?.textContent,
  location:document.querySelector("#fire-summary-location")?.textContent,
  list:document.querySelectorAll("#fire-directory-list [data-fire-dir-kind]").length
 }));
 if(kpis.near!=="1"||kpis.warnings!=="1"||kpis.extents!=="1"||kpis.location!=="Cessnock"||kpis.list!==1)
  throw Error("Incident intelligence summary or monitoring-area list wrong: "+JSON.stringify(kpis));
 await page.locator('#fire-directory-list [data-fire-dir-kind="incident"]').first().click();
 if(!(await page.locator("#fire-map-selection").isVisible()))throw Error("Map details panel didn't appear after selecting an incident");
 for(const val of ["Test Fire","Under control","93 ha","MCFARLANE ST","Rural Fire Service"]){
  if(!(await page.locator("#fire-map-selection-body").textContent()).includes(val))
   throw Error("Map details panel missing published field: "+val);
 }
 await page.locator("#fire-map-selection-close").click();
 if(await page.locator("#fire-map-selection").isVisible())throw Error("Close-map-details action failed");
 // Click the actual map marker in the Leaflet stub, not just the directory.
 const picked=await page.evaluate(()=>{
  const marker=window.__fireLayers.find(x=>x.kind==="marker"&&x.opts.icon?.options?.html?.includes('data-fire-marker-kind="incident"')&&x.opts.icon?.options?.html?.includes('data-fire-marker-index="0"'));
  if(!marker||typeof marker.handlers.click!=="function")return false;
  marker.handlers.click();
  return true;
 });
 if(!picked)throw Error("Fire marker click was not wired to the side-panel selection");
 if(!(await page.locator("#fire-map-selection").isVisible()))throw Error("Clicking a map marker didn't open the single side-panel");
 if(!(await page.locator("#fire-map-selection-body").textContent()).includes("Under control"))
  throw Error("Clicked map marker did not display the published incident detail");
 const markerSelected=await page.locator('[data-fire-marker-kind="incident"][data-fire-marker-index="0"]').first().getAttribute("class");
 if(!markerSelected.includes("is-selected"))throw Error("Selected map marker wasn't visually highlighted");
 const headline=await page.locator("#fire-map-selection-body .fire-map-selection-title").first().textContent();
 if(!headline.includes("Test Fire"))throw Error("One-panel incident heading is incorrect");
 await page.locator("#fire-map-selection-close").click();
 if(await page.locator('[data-fire-marker-kind="incident"][data-fire-marker-index="0"].is-selected').count())
  throw Error("Selected pin highlight was not cleared on panel close");
 // Click polygon: should use the SAME panel and no Leaflet popup.
 const areaClicked=await page.evaluate(()=>{
  const layer=window.__fireLayers.find(x=>x.kind==="polygon"&&x.opts.color==="#bc94e7"&&typeof x.handlers.click==="function");
  if(!layer)return false;layer.handlers.click();return true;
 });
 if(!areaClicked||!(await page.locator("#fire-map-selection").isVisible()))
  throw Error("Clicking an incident extent did not open the same details panel");
 await page.locator("#fire-map-selection-close").click();

 await page.locator("#fire-directory-scope").selectOption("statewide");
 if(await page.locator("#fire-directory-list [data-fire-dir-kind]").count()!==8)
  throw Error("All NSW reports filter didn't reveal published incident types");
 await page.locator("#fire-directory-search").fill("remote northern");
 if(await page.locator("#fire-directory-list [data-fire-dir-kind]").count()!==1)
  throw Error("Report search didn't filter by incident name");
 await page.locator("#fire-directory-search").fill("");
 await page.locator("#fire-directory-sort").selectOption("severity");
 await page.locator("#fire-directory-warnings").click();
 if((await page.locator("#fire-directory-warnings").getAttribute("aria-selected"))!=="true")
  throw Error("Warnings tab not selected");
 if(await page.locator('#fire-directory-list [data-fire-dir-kind="warning"]').count()!==2)
  throw Error("Official CAP warning directory missing entries");
 await page.locator('#fire-directory-list [data-fire-dir-kind="warning"][data-fire-dir-index="1"]').click();
 if(!(await page.locator("#fire-map-selection-body").textContent()).includes("Bushfire information"))
  throw Error("CAP warning with no polygon did not display its details");
 await page.locator("#fire-directory-incidents").click();
 await page.locator("#fire-directory-scope").selectOption("nearby");
 for(const width of [390,320]){
  await page.setViewportSize({width,height:844});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  if(overflow>2)throw Error("Fire Explorer horizontal mobile overflow at "+width+"px: "+overflow);
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('[data-warning-index="0"]').click();
 if(await page.evaluate(()=>window.__fireZooms)<1)throw Error("Warning focus didn't pan the map");
 await page.locator("#fire-map-warnings").uncheck();
 if(!(await page.locator("#fire-geofence-state").textContent()).includes("contain"))throw Error("Hidden layer incorrectly suppresses risk status");
 // Re-check with several source-accurate incident locations close together.
 // At NSW zoom, one number badge should replace the overlapping markers.
 dense=true;await page.locator("#hazards-refresh").click();
 await page.waitForFunction(()=>document.querySelector("#fire-summary-incidents")?.textContent==="3");
 const grouped=await page.evaluate(()=>{
  const all=window.__fireLayers.filter(x=>x.kind==="marker"&&x.domNode?.isConnected);
  const cluster=all.find(x=>x.opts.icon?.options?.html?.includes("data-fire-cluster-members")&&
    x.opts.icon.options.html.includes("0,8,9"));
  return {
   zoom:window.__fireTestMap.getZoom(),
   count:all.filter(x=>x.opts.icon?.options?.html?.includes("data-fire-cluster-members")).length,
   cluster:!!cluster,
   html:cluster?.opts.icon?.options?.html,
   clickable:typeof cluster?.handlers.click==="function",
   outlined:window.__fireLayers.filter(x=>x.kind==="polygon"&&x.opts.color==="#bc94e7"&&x.features).length>0
  };
 });
 if(!grouped.cluster||!grouped.clickable||grouped.zoom>=13||!grouped.html.includes(">3</span>"))
  throw Error("Three nearby RFS incidents must appear as a zoomable count cluster: "+JSON.stringify(grouped));
 if(!(await page.locator("#fire-map-legend").textContent()).includes("Grouped Incidents"))
  throw Error("Map legend must explain grouped markers and zoom interaction");
 // Clicking the cluster expands it; no fake 'combined incident' information panel.
 for(let i=0;i<3;i++){
  const result=await page.evaluate(()=>{
   const icon=window.__fireLayers.find(x=>x.kind==="marker"&&x.domNode?.isConnected&&
     x.opts.icon?.options?.html?.includes('data-fire-cluster-members="0,8,9"'));
   if(!icon)return null;
   const before=window.__fireTestMap.getZoom();
   icon.handlers.click();
   return {before,after:window.__fireTestMap.getZoom()};
  });
  if(!result)break;
  if(!(result.after>result.before))throw Error("Cluster click didn't zoom into grouped incidents");
 }
 const expandedClusters=await page.evaluate(()=>({
  zoom:window.__fireTestMap.getZoom(),
  markers:window.__fireLayers.filter(x=>x.kind==="marker"&&x.domNode?.isConnected&&
   x.opts.icon?.options?.html?.includes('data-fire-marker-kind="incident"')).length,
  cluster:window.__fireLayers.some(x=>x.kind==="marker"&&x.domNode?.isConnected&&
   x.opts.icon?.options?.html?.includes('data-fire-cluster-members="0,8,9"'))
 }));
 if(expandedClusters.zoom!==13||expandedClusters.cluster||expandedClusters.markers!==10)
  throw Error("Zooming into clusters didn't reveal all ten source records: "+JSON.stringify(expandedClusters));
 if(await page.locator("#fire-map-selection").isVisible())
  throw Error("Zooming a cluster must not open a misleading combined incident detail panel");
 const expandedDetails=await page.evaluate(()=>{
  const icon=window.__fireLayers.find(x=>x.kind==="marker"&&x.domNode?.isConnected&&
   x.opts.icon?.options?.html?.includes('data-fire-marker-index="8"'));
  if(!icon)return false;icon.handlers.click();return true;
 });
 if(!expandedDetails||!(await page.locator("#fire-map-selection").isVisible())||
   !(await page.locator("#fire-map-selection-body").textContent()).includes("Nearby Grass Fire"))
  throw Error("Expanded incident icon didn't open its individual RFS detail panel");
 await page.locator("#fire-map-selection-close").click();
 // Switch incident points off: no clusters or individual pins may remain.
 await page.locator("#fire-map-points").uncheck();
 const hidden=await page.evaluate(()=>window.__fireLayers.some(x=>x.kind==="marker"&&x.domNode?.isConnected&&
  (x.opts.icon?.options?.html?.includes("data-fire-cluster-members")||
   x.opts.icon?.options?.html?.includes('data-fire-marker-kind="incident"'))));
 if(hidden)throw Error("Disabling fire locations left cluster or incident markers visible");
 await page.locator("#fire-map-points").check();
 // Restore initial fixture, ready for stale-feed safety cases below.
 dense=false;await page.locator("#hazards-refresh").click();
 await page.waitForFunction(()=>document.querySelector("#fire-summary-incidents")?.textContent==="1");
 console.log("Fire marker clustering PASSED: small separate pins, grouped count, zoom-to-expand, single RFS detail and layer toggling.");
 stale=true;await page.locator("#hazards-refresh").click();
 await page.waitForFunction(()=>document.querySelector("#fire-geofence-state")?.textContent.includes("unavailable or stale"));
 const status=await page.locator("#fire-warning-feed-health").textContent();
 if(!status.includes("UNAVAILABLE"))throw Error("Stale warnings presented as current");
 if(!(await page.locator("#fire-directory-list").textContent()).includes("Data unavailable or delayed"))
  throw Error("Incident report directory should not imply the source is current during outage");
 stale=false;await page.evaluate(()=>{const pref=JSON.parse(localStorage.getItem("skypulse.preferences"));
  pref.location={name:"Sydney",region:"New South Wales",lat:-33.87,lon:151.21};localStorage.setItem("skypulse.preferences",JSON.stringify(pref));});
 await page.reload({waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>document.querySelector("#fire-geofence-state")?.textContent.includes("No overlap"));
 if(!(await page.locator("#fire-geofence-state").textContent()).includes("NOT an all-clear"))throw Error("No-overlap message could be misconstrued as safe");
 if(errors.length)throw Error("JS exceptions: "+errors.join(" | "));
 console.log("NSW Fire Area Explorer PASSED: operational dashboard summary, search, statewide scope, warning tabs, detail overlay, CAP/extents distinction, stale safety and 320/390px mobile layout.");
 await page.close();
}finally{if(browser)await browser.close();server.kill("SIGTERM");}
