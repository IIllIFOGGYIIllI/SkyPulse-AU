#!/usr/bin/env node
/** SkyPulse GPS regression: blocked live API + nearby Cessnock verified reference, never a remote forecast. */
import {chromium} from "playwright";
import {spawn} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";
const server=spawn("python",["-m","http.server","8777","--bind","127.0.0.1"],{stdio:"ignore",cwd:process.cwd()});
let browser;
try{
 await delay(1000);
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 let fallbackCount=0;
 const offset=11*3600,localNow=new Date(Date.now()+offset*1000);
 const currentDay=localNow.toISOString().slice(0,10),today=Date.parse(currentDay+"T00:00:00Z");
 const prevDay=new Date(today-86400000).toISOString().slice(0,10);
 const days=Array.from({length:7},(_,i)=>new Date(today+(i-1)*86400000).toISOString().slice(0,10));
 const times=Array.from({length:168},(_,i)=>new Date(today+(i-24)*3600000).toISOString().slice(0,16));
 const fixture={utc_offset_seconds:offset,timezone:"Australia/Sydney",timezone_abbreviation:"GMT+11",
  current:{time:prevDay+"T18:00",temperature_2m:24,weather_code:2,is_day:1,
   apparent_temperature:23,wind_speed_10m:8,relative_humidity_2m:60},
  hourly:{time:times,temperature_2m:times.map(()=>23),precipitation:times.map(()=>.3),
   precipitation_probability:times.map(()=>35),wind_gusts_10m:times.map(()=>24),
   relative_humidity_2m:times.map(()=>60),weather_code:times.map(()=>1),
   wind_speed_10m:times.map(()=>11),is_day:times.map(()=>1)},
  daily:{time:days,temperature_2m_max:days.map(()=>29),temperature_2m_min:days.map(()=>18),
   weather_code:days.map(()=>1),precipitation_sum:days.map(()=>2),
   precipitation_probability_max:days.map(()=>35),wind_gusts_10m_max:days.map(()=>25),
   uv_index_max:days.map(()=>7),sunrise:days.map(d=>d+"T06:03"),sunset:days.map(d=>d+"T19:30")}
 };
 await page.addInitScript(()=>{
  if(!localStorage.getItem("skypulse.preferences"))localStorage.setItem("skypulse.preferences",JSON.stringify({
   location:{name:"My Location",region:"Australia",lat:-32.845,lon:151.35},theme:"dark",radius:50,notify:false
  }));
 });
 await page.route("**/*",async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==="api.open-meteo.com")return route.fulfill({status:503,contentType:"application/json",body:'{"error":true}'});
  if(url.pathname.endsWith("/weather-cessnock.json")){
   fallbackCount++;
   return route.fulfill({status:200,contentType:"application/json",
    body:JSON.stringify({location:"Cessnock",retrieved_at:new Date(Date.now()-6*3600000).toISOString(),primary:fixture,
     models_retrieved_at:new Date(Date.now()-6*3600000).toISOString(),models:{
      ecmwf:{utc_offset_seconds:offset,hourly:{
       time:times,temperature_2m:times.map(()=>23),precipitation:times.map(()=>.2),wind_gusts_10m:times.map(()=>25)}},
      gfs:{utc_offset_seconds:offset,hourly:{
       time:times,temperature_2m:times.map(()=>24),precipitation:times.map(()=>.5),wind_gusts_10m:times.map(()=>27)}}
     }})});
  }
  if(url.hostname==="127.0.0.1")return route.continue();
  return route.abort();
 });
 await page.goto("http://127.0.0.1:8777/forecast.html",{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>document.querySelector("#forecast-health-pill")?.textContent==="SNAPSHOT",null,{timeout:14000});
 const near=await page.evaluate(()=>({
  title:document.querySelector("#forecast-health-title").textContent,
  detail:document.querySelector("#forecast-health-detail").textContent,
  day:document.querySelector("#daily-list .day small")?.textContent,
  range:document.querySelector("#forecast-next-temps").textContent,
  forecastHour:document.querySelector("#forecast-brief-period").textContent,
  description:document.querySelector("#forecast-health-detail")?.textContent
 }));
 if(!near.title.includes("REFERENCE FORECAST")||!near.detail.includes("km away")||
  !near.description.includes("Cessnock reference")||
  near.range==="—"||near.day!=="Today"||near.forecastHour==="—"||fallbackCount<1)
  throw Error("GPS Cessnock fallback missing, misleading or not rebased: "+JSON.stringify(near));
 // Confirm faraway GPS cannot be assigned weather values from Cessnock.
 await page.evaluate(()=>{
  const p=JSON.parse(localStorage.getItem("skypulse.preferences"));
  p.location={name:"My Location",region:"Australia",lat:-33.8688,lon:151.2093};
  localStorage.setItem("skypulse.preferences",JSON.stringify(p));
 });
 await page.reload({waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>document.querySelector("#forecast-health-pill")?.textContent==="CHECK FAILED",null,{timeout:20000});
 const far=await page.locator("#forecast-next-temps").textContent();
 if(far!=="—")throw Error("Cessnock model leaked into Sydney location: "+far);
 if(errors.length)throw Error("Browser runtime errors: "+errors.join(" | "));
 console.log("Nearby GPS reference PASSED: provider outage -> dated Cessnock reference, rollover-safe Today, immediate values, and no cross-location leakage.");
}finally{
 if(browser)await browser.close();
 server.kill("SIGTERM");
}