#!/usr/bin/env node
/* Forecast revision audit: comparisons are model changes, NOT observations. */
import {chromium} from "playwright";
import {spawn} from "node:child_process";
import {setTimeout as sleep} from "node:timers/promises";
const server=spawn("python",["-m","http.server","8783","--bind","127.0.0.1"],{stdio:"ignore",cwd:process.cwd()});
let browser;
try{
 await sleep(1000);
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 const offset=11*3600,day=new Date(Date.now()+offset*1000);
 day.setUTCHours(0,0,0,0);
 const times=Array.from({length:168},(_,i)=>new Date(day.getTime()+i*3600000).toISOString().slice(0,16));
 const dates=Array.from({length:7},(_,i)=>times[i*24].slice(0,10));
 await page.addInitScript(({times,offset})=>{
  if(!localStorage.getItem("skypulse.preferences")){
   localStorage.setItem("skypulse.preferences",JSON.stringify({
    location:{name:"Cessnock",region:"New South Wales",lat:-32.8321,lon:151.3497},
    theme:"dark",radius:50,notify:false
   }));
  }
  if(!localStorage.getItem("skypulse.forecast.revisions.v1")){
   localStorage.setItem("skypulse.forecast.revisions.v1",JSON.stringify({locations:[{
    key:"-32.8321:151.3497",
    samples:[{at:Date.now()-70*60000,offset,times:times.slice(0,72),
     temp:times.slice(0,72).map(()=>18),rain:times.slice(0,72).map(()=>1),
     gust:times.slice(0,72).map(()=>28)}]
   }]}));
  }
 },{times,offset});
 function full(){
  return {utc_offset_seconds:offset,timezone:"Australia/Sydney",timezone_abbreviation:"GMT+11",
   latitude:-32.8321,longitude:151.3497,
   current:{time:new Date(Date.now()+offset*1000).toISOString().slice(0,16),
    temperature_2m:20,apparent_temperature:20,weather_code:2,is_day:1,relative_humidity_2m:65,
    wind_speed_10m:16,wind_gusts_10m:38,pressure_msl:1012,dew_point_2m:13,cloud_cover:40},
   hourly:{time:times,temperature_2m:times.map(()=>20),precipitation:times.map(()=>2),
    precipitation_probability:times.map(()=>60),wind_gusts_10m:times.map(()=>38),
    wind_speed_10m:times.map(()=>17),relative_humidity_2m:times.map(()=>65),
    weather_code:times.map(()=>2),is_day:times.map(()=>1)},
   daily:{time:dates,temperature_2m_max:dates.map(()=>29),temperature_2m_min:dates.map(()=>16),
    weather_code:dates.map(()=>1),precipitation_sum:dates.map(()=>3),
    precipitation_probability_max:dates.map(()=>60),wind_gusts_10m_max:dates.map(()=>38),
    uv_index_max:dates.map(()=>7),sunrise:dates.map(d=>d+"T06:03"),sunset:dates.map(d=>d+"T19:40")}};
 }
 await page.route("**/*",route=>{
  const u=new URL(route.request().url());
  if(u.hostname==="api.open-meteo.com"){
   return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(full())});
  }
  if(u.hostname==="127.0.0.1")return route.continue();
  return route.abort();
 });
 await page.goto("http://127.0.0.1:8783/forecast.html",{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>document.querySelector("#revision-temp")?.textContent.includes("+2.0°C"),null,{timeout:16000});
 const values=await page.evaluate(()=>({
  temp:document.querySelector("#revision-temp").textContent,
  rain:document.querySelector("#revision-rain").textContent,
  gust:document.querySelector("#revision-gust").textContent,
  status:document.querySelector("#revision-status").textContent,
  baseline:document.querySelector("#revision-baseline").textContent,
  official:document.querySelector("#revision-observation-link").href,
  stored:JSON.parse(localStorage.getItem("skypulse.forecast.revisions.v1"))
 }));
 if(values.rain!=="+6.0 mm"||values.gust!=="+10 km/h"||
  !values.status.includes("DO NOT verify measured accuracy")||
  !values.official.includes("IDN60801.95771")||
  values.stored.locations[0].samples.length!==2)
  throw Error("Forecast revision comparison or source claims incorrect: "+JSON.stringify(values));
 // The same model retrieval in a page reload cannot be recorded again within 30 minutes.
 await page.reload({waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>document.querySelector("#revision-temp")?.textContent.includes("+2.0°C"),null,{timeout:14000});
 const count=await page.evaluate(()=>JSON.parse(localStorage.getItem("skypulse.forecast.revisions.v1")).locations[0].samples.length);
 if(count!==2)throw Error("Duplicate forecast snapshots on reload: "+count);
 // Location separation: Sydney must not inherit Cessnock revisions.
 await page.evaluate(()=>{
  const p=JSON.parse(localStorage.getItem("skypulse.preferences"));
  p.location={name:"Sydney",region:"New South Wales",lat:-33.8688,lon:151.2093};
  localStorage.setItem("skypulse.preferences",JSON.stringify(p));
 });
 await page.reload({waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>document.querySelector("#revision-status")?.textContent.includes("First model forecast saved"),null,{timeout:14000});
 if((await page.locator("#revision-temp").textContent())!=="—"||
   !(await page.locator("#revision-observation-link").getAttribute("href")).includes("bom.gov.au/places/"))
  throw Error("Revision data or Cessnock station link leaked into Sydney");
 await page.locator("#revision-clear").click();
 const residual=await page.evaluate(()=>JSON.parse(localStorage.getItem("skypulse.forecast.revisions.v1")).locations);
 if(residual.some(x=>x.key==="-33.8688:151.2093")||!residual.some(x=>x.key==="-32.8321:151.3497"))
  throw Error("Clear Local History affected another location");
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
 if(overflow>2)throw Error("Forecast audit overflowing mobile viewport: "+overflow+"px");
 if(errors.length)throw Error("Page JavaScript errors: "+errors.join(" | "));
 console.log("Forecast Revision Audit PASSED: matching-hour differences, honest accuracy limitations, local persistence, no duplicate readings, location isolation, clear history and mobile layout.");
}finally{
 if(browser)await browser.close();
 server.kill("SIGTERM");
}