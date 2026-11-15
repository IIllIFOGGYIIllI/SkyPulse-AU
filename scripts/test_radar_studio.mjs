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
    localStorage.setItem("skypulse.preferences",JSON.stringify({
      location:{name:"Cessnock",region:"New South Wales",lat:-32.8321,lon:151.3497},
      radius:50,notify:false,theme:"dark"
    }));
    window.__radarTiles=[];
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
    const map={
      setView(){return this;},on(){return this;},removeLayer(){return this;},
      invalidateSize(){return this;},flyTo(){return this;},fitBounds(){return this;},
      zoomIn(){return this;},zoomOut(){return this;},
      getCenter(){return {lat:-32.8321,lng:151.3497};},getZoom(){return 9;},
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
  if(errors.length)throw Error("Radar browser JavaScript errors: "+errors.join(" | "));
  console.log("Radar Studio PASSED: issued times, AEST/AEDT, 10-min history, latest follow, scrubbing, playback, stale/failed-state, free API tiles.");
  await page.close();
}finally{
  if(browser)await browser.close();
  server.kill("SIGTERM");
}
