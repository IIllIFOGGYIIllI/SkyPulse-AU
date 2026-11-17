#!/usr/bin/env node
/** Deterministic core overhaul regression: two independent models and five official NSW feeds. */
import {chromium} from "playwright";
import {spawn} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";
const srv=spawn("python",["-m","http.server","8768","--bind","127.0.0.1"],{stdio:"ignore",cwd:process.cwd()});
let browser;
try{
 await delay(1100);
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.addInitScript(()=>{
  localStorage.setItem("skypulse.preferences",JSON.stringify({
   location:{name:"Cessnock",region:"New South Wales",lat:-32.8321,lon:151.3497},
   theme:"dark",radius:50,notify:false
  }));
 });
 const offset=11*3600,locDate=new Date(Date.now()+offset*1000),start=new Date(locDate);
 start.setUTCHours(0,0,0,0);
 const times=Array.from({length:168},(_,i)=>new Date(start.getTime()+i*3600000).toISOString().slice(0,16));
 const days=Array.from({length:7},(_,i)=>times[i*24].slice(0,10));
 let gfsOffline=false,allowPublished=false;
 function model(type){
  const add=type==="gfs"?3:0;
  return {utc_offset_seconds:offset,hourly:{
   time:times,temperature_2m:times.map((_,i)=>18+i%8+add),
   precipitation:times.map(()=>type==="gfs"?0.7:0.2),
   wind_gusts_10m:times.map(()=>type==="gfs"?36:27)}};
 }
 function normal(){
  const base=model("ecmwf");
  return {...base,timezone:"Australia/Sydney",timezone_abbreviation:"GMT+11",
   latitude:-32.8321,longitude:151.3497,
   current:{time:locDate.toISOString().slice(0,16),temperature_2m:21.5,
    apparent_temperature:21,weather_code:1,is_day:1,wind_speed_10m:12,
    wind_gusts_10m:23,relative_humidity_2m:67,pressure_msl:1012},
   hourly:{...base.hourly,precipitation_probability:times.map(()=>35),weather_code:times.map(()=>1),
    wind_speed_10m:times.map(()=>12),relative_humidity_2m:times.map(()=>65),
    is_day:times.map(()=>1)},
   daily:{time:days,temperature_2m_max:days.map(()=>28),temperature_2m_min:days.map(()=>14),
    weather_code:days.map(()=>1),precipitation_sum:days.map(()=>3),
    precipitation_probability_max:days.map(()=>40),wind_gusts_10m_max:days.map(()=>34),
    uv_index_max:days.map(()=>6),sunrise:days.map(x=>x+"T06:03"),sunset:days.map(x=>x+"T19:42")}
  };
 }
 const now=new Date().toISOString();
 const feeds={
  "rfs.json":{retrieved_at:now,features:[]},
  "fdr.json":{retrieved_at:now,districts:[{name:"Greater Hunter"}]},
  "rfs-alerts.json":{retrieved_at:now,alerts:[]},
  "bom.json":{retrieved_at:null,error:"Forbidden",warnings:[]},
  "wmo-bom.json":{retrieved_at:"2020-01-01T00:00:00Z",entries:[]}
 };
 await page.route("**/*",async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==="api.open-meteo.com"){
   if(url.pathname.endsWith("/gfs")&&gfsOffline)return route.fulfill({status:503,body:"error"});
   const type=url.pathname.endsWith("/gfs")?"gfs":url.pathname.endsWith("/ecmwf")?"ecmwf":"normal";
   return route.fulfill({status:200,contentType:"application/json",
    body:JSON.stringify(type==="normal"?normal():model(type))});
  }
  if(url.pathname.endsWith("/weather-cessnock.json")){
   if(!allowPublished)return route.fulfill({status:503,body:"Snapshot disabled for failure test"});
   const snapshot={location:"Cessnock",models_retrieved_at:new Date().toISOString(),
    models:{ecmwf:model("ecmwf"),gfs:model("gfs")}};
   return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(snapshot)});
  }
  const name=url.pathname.split("/").at(-1);
  if(name in feeds)return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(feeds[name])});
  if(url.hostname==="127.0.0.1")return route.continue();
  return route.abort();
 });
 await page.goto("http://127.0.0.1:8768/forecast.html",{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>document.querySelector("#compare-temp-spread")?.textContent.includes("°C"),null,{timeout:15000});
 if((await page.locator("#compare-rain-spread").textContent())==="—")throw Error("Rain spread missing");
 if(!(await page.locator("#compare-summary").textContent()).includes("NOT a probability of accuracy"))
  throw Error("Model spread improperly presented as forecast confidence");
 gfsOffline=true;
 await page.locator("#compare-refresh").click();
 await page.waitForFunction(()=>document.querySelector("#compare-gfs-status")?.textContent==="UNAVAILABLE");
 if((await page.locator("#compare-temp-spread").textContent())!=="—")
  throw Error("Failure did not clear model comparison");
 allowPublished=true;
 await page.locator("#compare-refresh").click();
 await page.waitForFunction(()=>document.querySelector("#compare-ecmwf-status")?.textContent==="REFERENCE SNAPSHOT");
 if((await page.locator("#compare-temp-spread").textContent())==="—")
  throw Error("Published model pair did not recover missing comparison values");
 if(!(await page.locator("#compare-summary").textContent()).includes("Cessnock reference model"))
  throw Error("Published model fallback was not distinguished from direct data");
 await page.goto("http://127.0.0.1:8768/settings.html",{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>document.querySelector("#source-health-summary")?.textContent.includes("feeds are"),null,{timeout:15000});
 const states=await page.evaluate(()=>Object.fromEntries(["rfs","fdr","cap","bom","wmo"].map(k=>[
  k,document.querySelector("#source-health-"+k)?.dataset.health])));
 if(states.rfs!=="recent"||states.fdr!=="recent"||states.cap!=="recent"||
   states.bom!=="unavailable"||states.wmo!=="stale")throw Error("Source freshness flags incorrect: "+JSON.stringify(states));
 if(!(await page.locator("#source-health-summary").textContent()).includes("2 of 5"))
  throw Error("Missing unavailable/stale source summary");
 if(errors.length)throw Error("Browser errors: "+errors.join(" | "));
 console.log("Systems overhaul PASSED: ECMWF/GFS model spread, missing-model protection, NSW feed freshness and safe failure states.");
}finally{
 if(browser)await browser.close();
 srv.kill("SIGTERM");
}