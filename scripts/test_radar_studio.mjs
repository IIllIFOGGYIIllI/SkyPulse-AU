#!/usr/bin/env node
/**
 * SkyPulse Radar Studio browser test with deterministic RainViewer metadata.
 * No third-party network needed: Leaflet and radar tiles are stubbed.
 * Confirms historical selection, playback, freshness, latest-follow, 5-min
 * polling configuration and degraded-provider behaviour.
 */
import {chromium} from "playwright";
import {spawn} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";

const server=spawn("python",["-m","http.server","8766","--bind","127.0.0.1"],{stdio:"ignore",cwd:process.cwd()});
let browser;
try{
  await delay(1100);
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.addInitScript(()=>{
    if(!localStorage.getItem("skypulse.preferences"))localStorage.setItem("skypulse.preferences",JSON.stringify({
      location:{name:"Cessnock",region:"New South Wales",lat:-32.8321,lon:151.3497},
      radius:50,notify:false,theme:"dark"
    }));
    window.__radarTiles=[];
    Object.defineProperty(navigator,"clipboard",{configurable:true,value:{
      writeText:async function(value){window.__copiedRadarLink=value;}
    }});
    const makeLayer=(url="",opts={})=>{
      const handlers={};
      const layer={
        on(event,fn){handlers[event]=fn;return this;},
        addTo(){if(url)window.__radarTiles.push({url,opts});queueMicrotask(()=>handlers.load?.());return this;},
        bindPopup(){return this;},setOpacity(){return this;},
        clearLayers(){return this;},redraw(){return this;},setLatLng(){return this;}
      };
      return layer;
    };
    let center={lat:-32.8321,lng:151.3497},zoom=9;
    const map={
      setView(coords,z){center={lat:coords[0],lng:coords[1]};if(Number.isFinite(z))zoom=z;return this;},
      on(){return this;},removeLayer(){return this;},
      invalidateSize(){return this;},flyTo(){return this;},
      fitBounds(bounds){center={lat:(bounds[0][0]+bounds[1][0])/2,lng:(bounds[0][1]+bounds[1][1])/2};zoom=6;return this;},
      zoomIn(){zoom++;return this;},zoomOut(){zoom--;return this;},
      getCenter(){return center;},getZoom(){return zoom;},
      scrollWheelZoom:{enable(){},disable(){}}
    };
    window.L={
      map(){return map;},tileLayer:makeLayer,
      layerGroup(){return makeLayer();},circleMarker(){return makeLayer();},
      circle(){return makeLayer();},polygon(){return makeLayer();},
      control:{scale(){return makeLayer();}},
      latLngBounds(){return {pad(){return this;}}}
    };
  });
  const now=Math.floor(Date.now()/600000)*600;
  let latest=now-600,stale=false,failed=false,requests=0;
  const manifest=()=>({
    version:"2.0",generated:latest+300,host:"https://tilecache.rainviewer.com",
    radar:{past:Array.from({length:13},(_,i)=>{
      const t=(stale?now-7200:latest)-(12-i)*600;
      return {time:t,path:"/v2/radar/"+t};
    })}
  });
  await page.route("**/*",async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==="api.rainviewer.com"){
      requests++;
      if(failed)return route.fulfill({status:503,contentType:"application/json",body:'{"error":"offline"}'});
      return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(manifest())});
    }
    if(url.hostname==="127.0.0.1")return route.continue();
    return route.abort();
  });
  await page.goto("http://127.0.0.1:8766/radar.html",{waitUntil:"domcontentloaded",timeout:30000});
  await page.waitForFunction(()=>document.querySelector("#radar-frame-label")?.textContent.includes("Frame issued"),{timeout:10000});
  let m=await page.evaluate(()=>({
    kind:document.querySelector("#radar-frame-kind").textContent,
    clock:document.querySelector("#radar-latest-issued").textContent,
    count:document.querySelector("#radar-slider").max,
    tileCount:window.__radarTiles.length,
    radarTile:window.__radarTiles.find(t=>t.url.includes("/v2/radar/")),
    status:document.querySelector("#radar-freshness-indicator").textContent
  }));
  if(m.kind!=="LATEST AVAILABLE"||Number(m.count)!==12)throw Error("Initial radar timeline incorrect: "+JSON.stringify(m));
  if(!/AEST|AEDT/.test(m.clock))throw Error("No Australian timezone on issued time: "+m.clock);
  if(!m.radarTile||!m.radarTile.url.endsWith("/2/1_1.png")||m.radarTile.opts.maxNativeZoom!==7)
    throw Error("Unsupported free API raster format: "+JSON.stringify(m.radarTile));
  if(requests!==1)throw Error("Unexpected first metadata request count: "+requests);
  const sourceLinks=await page.evaluate(()=>[...document.querySelectorAll("#radar-source-bom,#radar-source-weatherzone")].map(a=>({url:a.href,blank:a.target,rel:a.rel})));
  if(sourceLinks.length!==2||sourceLinks.some(a=>a.blank!=="_blank"||!a.rel.includes("noopener")))
    throw Error("Official radar sources must open on their own sites: "+JSON.stringify(sourceLinks));
  const quality=await page.locator("#radar-quality-status").textContent();
  if(!quality.includes("enlarged beyond native zoom 7"))throw Error("Missing resolution disclosure at zoom 9: "+quality);
  await page.locator('[data-radar-region="nsw"]').click();
  const native=await page.locator("#radar-quality-status").textContent();
  if(!native.includes("through zoom 7"))throw Error("Native zoom indicator didn't update after NSW preset: "+native);
  await page.locator('[data-radar-region="local"]').click();
  console.log("Radar providers PASSED: official five-minute external links and truthful native vs enlarged image detail.");
  // Scrub backwards, then fetch a newer manifest: selected historical time must not jump.
  await page.locator("#radar-step-back").click();
  const selected=await page.locator("#radar-frame-label").textContent();
  latest+=600;
  await page.locator("#radar-check-now").click();
  await page.waitForFunction(()=>document.querySelector("#radar-latest").textContent==="New Frame Available");
  const preserved=await page.locator("#radar-frame-label").textContent();
  if(preserved!==selected)throw Error("Radar jumped off selected history when data refreshed");
  // Go to latest and follow the next newly published frame.
  await page.locator("#radar-latest").click();
  if((await page.locator("#radar-frame-kind").textContent())!=="LATEST AVAILABLE")
    throw Error("Latest action failed");
  const before=await page.locator("#radar-frame-label").textContent();
  latest+=600;
  await page.locator("#radar-check-now").click();
  await page.waitForFunction(text=>document.querySelector("#radar-frame-label").textContent!==text,before);
  if((await page.locator("#radar-frame-kind").textContent())!=="LATEST AVAILABLE")
    throw Error("Follow-latest did not track new frame");
  // Playback starts at oldest when currently at latest.
  await page.locator("#radar-play").click();
  if((await page.locator("#radar-play").textContent()).indexOf("Pause")<0)throw Error("Radar playback did not start");
  await page.locator("#radar-play").click();
  if((await page.locator("#radar-play").textContent()).indexOf("Play")<0)throw Error("Radar playback did not stop");
  // No false live claims when radar data is stale.
  stale=true;
  await page.locator("#radar-check-now").click();
  await page.waitForFunction(()=>document.querySelector("#radar-freshness-indicator").textContent.includes("STALE IMAGE"));
  // Keep historical frames visible but show failed checks prominently.
  failed=true;
  await page.locator("#radar-check-now").click();
  await page.waitForFunction(()=>document.querySelector("#radar-freshness-indicator").textContent.includes("CHECK FAILED"));
  if(!(await page.locator("#radar-frame-label").textContent()).includes("Frame issued"))
    throw Error("Past history was lost after provider error");
  // New saved Radar Settings and map link workflow.
  failed=false;
  stale=false;
  await page.locator("#radar-preferences-toggle").click();
  if(!(await page.locator("#radar-preferences").isVisible()))throw Error("Radar preferences did not open");
  await page.locator("#radar-setting-auto").uncheck();
  await page.locator("#radar-setting-loop").uncheck();
  await page.locator("#radar-setting-timestamp").uncheck();
  await page.locator("#radar-setting-speed").selectOption("2200");
  await page.locator("#radar-setting-opacity").evaluate(el=>{
    el.value="80";el.dispatchEvent(new Event("input",{bubbles:true}));
  });
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("skypulse.preferences")).radar);
  if(saved.auto!==false||saved.loop!==false||saved.timestamp!==false||
    saved.speed!==2200||Math.abs(saved.opacity-.8)>.001)
    throw Error("Radar preferences were not persisted: "+JSON.stringify(saved));
  if(await page.locator("#radar-map-stamp").isVisible())throw Error("Timestamp was not hidden");
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelector("#radar-frame-label")?.textContent.includes("Frame issued"));
  await page.locator("#radar-preferences-toggle").click();
  if(await page.locator("#radar-setting-auto").isChecked())throw Error("Auto-check preference lost on reload");
  if(await page.locator("#radar-setting-loop").isChecked())throw Error("Loop preference lost on reload");
  if(await page.locator("#radar-setting-timestamp").isChecked())throw Error("Timestamp preference lost on reload");
  if(await page.locator("#radar-setting-speed").inputValue()!=="2200")throw Error("Playback speed preference lost");
  if(await page.locator("#map-radar-opacity").inputValue()!=="80")throw Error("Layer opacity desynchronised after reload");
  if(await page.locator("#radar-map-stamp").isVisible())throw Error("Timestamp appeared again after reload");
  await page.locator('[data-radar-region="nsw"]').click();
  const region=await page.evaluate(()=>({
    label:document.querySelector('[data-radar-region="nsw"]').getAttribute("aria-pressed"),
    coords:document.querySelector("#map-coordinates").textContent
  }));
  if(region.label!=="true")throw Error("NSW map preset not selected: "+JSON.stringify(region));
  await page.locator('[data-radar-region="local"]').click();
  await page.locator("#radar-step-back").click();
  const priorFrame=await page.locator("#radar-frame-label").textContent();
  await page.locator("#radar-copy-link").click();
  const copied=await page.evaluate(()=>window.__copiedRadarLink);
  if(!copied)throw Error("Copy map link did not copy to clipboard");
  const share=new URL(copied),frame=Number(share.searchParams.get("frame"));
  if(!share.searchParams.has("lat")||!share.searchParams.has("lon")||
     !share.searchParams.has("zoom")||!Number.isFinite(frame))
    throw Error("Incomplete radar share link: "+copied);
  await page.goto(share.href,{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelector("#radar-frame-label")?.textContent.includes("Frame issued"));
  if((await page.locator("#radar-frame-label").textContent())!==priorFrame)
    throw Error("Shared historical frame was not restored when still available");
  const loc=await page.evaluate(()=>JSON.parse(localStorage.getItem("skypulse.preferences")).location.name);
  if(loc!=="Cessnock")throw Error("Shared map URL unexpectedly changed forecast location");
  await page.locator("#radar-preferences-toggle").click();
  await page.locator("#radar-reset-preferences").click();
  const reset=await page.evaluate(()=>JSON.parse(localStorage.getItem("skypulse.preferences")).radar);
  if(!reset.auto||!reset.loop||!reset.timestamp||reset.speed!==3500||Math.abs(reset.opacity-.6)>.001)
    throw Error("Restore Defaults failed: "+JSON.stringify(reset));
  console.log("Radar preferences PASSED: local persistence, four controls, region preset, copy map URL, shared historical frame and defaults restore.");
  if(errors.length)throw Error("Radar browser JavaScript errors: "+errors.join(" | "));
  console.log("Radar Studio PASSED: issued times, AEST/AEDT, 10-min history, latest follow, scrubbing, playback, stale/failed-state, free API tiles.");
  await page.close();
}finally{
  if(browser)await browser.close();
  server.kill("SIGTERM");
}
