#!/usr/bin/env node
/** SkyPulse AU forecast reliability regression: mocked Open-Meteo, no external requests. */
import {chromium} from "playwright";
import {spawn} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";
const srv=spawn("python",["-m","http.server","8767","--bind","127.0.0.1"],{stdio:"ignore",cwd:process.cwd()});
let browser;
try{
 await delay(1100);
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.addInitScript(()=>{
  if(!localStorage.getItem("skypulse.preferences"))localStorage.setItem("skypulse.preferences",JSON.stringify({
   location:{name:"Cessnock",region:"New South Wales",lat:-32.8321,lon:151.3497},theme:"dark",radius:50,notify:false
  }));
 });
 const offset=11*3600,localEpoch=Date.now()+offset*1000,
 localDay=new Date(localEpoch).toISOString().slice(0,10),
 current=new Date(localEpoch).toISOString().slice(0,16);
 const start=Date.parse(localDay+"T00:00:00Z");
 const days=Array.from({length:7},(_,i)=>new Date(start+i*86400000).toISOString().slice(0,10));
 const times=Array.from({length:168},(_,i)=>new Date(start+i*3600000).toISOString().slice(0,16));
 const hindex=times.findIndex(t=>t.slice(0,13)>current.slice(0,13));
 let failure=false,invalid=false,apiCount=0;
 const makeData=()=>{
  const hourly={
   time:times,temperature_2m:times.map((_,i)=>18+i%12),
   precipitation_probability:times.map((_,i)=>i<24?35+i%8:10),
   precipitation:times.map((_,i)=>i<24?.5:0),
   wind_gusts_10m:times.map((_,i)=>18+i%10),wind_speed_10m:times.map(()=>12),
   relative_humidity_2m:times.map(()=>68),weather_code:times.map(()=>1),
   is_day:times.map((_,i)=>i%24>=6&&i%24<19?1:0)
  };
  const daily={
   time:days,temperature_2m_max:days.map(()=>30),temperature_2m_min:days.map(()=>16),
   weather_code:days.map(()=>2),precipitation_sum:days.map(()=>5),
   precipitation_probability_max:days.map(()=>60),uv_index_max:days.map(()=>8),
   wind_gusts_10m_max:days.map(()=>42),
   sunrise:days.map(d=>d+"T05:45"),sunset:days.map(d=>d+"T19:35")
  };
  if(hindex>=0){hourly.precipitation_probability[hindex]=null;hourly.weather_code[hindex]=null;}
  return {latitude:-32.8321,longitude:151.3497,utc_offset_seconds:offset,
   timezone:"Australia/Sydney",timezone_abbreviation:"GMT+11",
   current:{time:current,temperature_2m:23.2,apparent_temperature:22.1,weather_code:null,
    is_day:1,wind_speed_10m:12,wind_gusts_10m:20,relative_humidity_2m:65,
    pressure_msl:1014.5,cloud_cover:40,dew_point_2m:14},
   hourly,daily};
 };
 await page.route("**/*",async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==="api.open-meteo.com"){
   apiCount++;
   if(failure)return route.fulfill({status:503,contentType:"application/json",body:'{"error":true}'});
   const data=makeData();
   if(invalid)delete data.current.temperature_2m;
   return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(data)});
  }
  if(url.pathname.endsWith("/weather-cessnock.json"))return route.fulfill({status:503,body:"No backup in legacy test"});
   if(url.hostname==="127.0.0.1")return route.continue();
  return route.abort();
 });
 await page.goto("http://127.0.0.1:8767/forecast.html",{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>document.querySelector("#forecast-health-title")?.textContent.includes("FORECAST DATA AVAILABLE"));
 const initial=await page.evaluate(()=>({
  model:document.querySelector("#forecast-model-time").textContent,
  check:document.querySelector("#forecast-checked-time").textContent,
  info:document.querySelector("#forecast-health-detail").textContent,
  future:document.querySelector("#forecast-next-rain-chance").textContent,
  gust:document.querySelector("#forecast-next-gust").textContent,
  count:document.querySelectorAll("#hourly-list .hour-cell").length,
  days:document.querySelectorAll("#daily-list .day").length
 }));
 if(!initial.model.includes("GMT+11")||!initial.check||initial.check==="—")throw Error("Model vs fetch times not exposed: "+JSON.stringify(initial));
 if(!initial.info.includes("Not a weather-station observation"))throw Error("Model source disclaimer missing");
 if(initial.count!==24||initial.days!==7||initial.future==="—"||initial.gust==="—")
  throw Error("Forecast detail missing: "+JSON.stringify(initial));
 await page.locator('[data-forecast-chart="wind"]').click();
 if((await page.locator("#forecast-chart-title").textContent())!=="24-Hour Wind Gust Forecast")throw Error("Wind gust chart unavailable");
 await page.locator('[data-forecast-chart="rain"]').click();
 if((await page.locator("#forecast-chart-title").textContent())!=="24-Hour Rain Probability")throw Error("Rain probability chart unavailable");
 if((await page.locator("#temp-chart svg").getAttribute("aria-label")).indexOf("%")<0)throw Error("Rain probability chart accessibility label wrong");
 await page.locator('[data-forecast-day="3"]').click();
 if((await page.locator("#forecast-day-details").textContent()).indexOf("Maximum wind gust")<0)throw Error("Selected day details missing");
 if((await page.locator('[data-forecast-day="3"]').getAttribute("aria-pressed"))!=="true")throw Error("Day selection not identified");
 // Failed refresh must retain the last data only with a conspicuous failure state.
 failure=true;await page.locator("#forecast-retry").click();
 await page.waitForFunction(()=>document.querySelector("#forecast-health-pill").textContent==="CHECK FAILED");
 if((await page.locator("#forecast-next-rain-chance").textContent())==="—")throw Error("Past values disappeared on transient outage");
 // Reload with the provider offline: cache is shown, but NOT as a recent network retrieval.
 await page.reload({waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>document.querySelector("#forecast-health-pill").textContent==="CACHED");
 if(!(await page.locator("#forecast-health-title").textContent()).includes("CACHED FORECAST"))
  throw Error("Offline cache not explicitly labelled");
 // Wrong-location cached data must never appear for a different city.
 await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem("skypulse.preferences"));
  p.location={name:"Sydney",region:"New South Wales",lat:-33.87,lon:151.21};
  localStorage.setItem("skypulse.preferences",JSON.stringify(p));});
 await page.reload({waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>document.querySelector("#forecast-health-pill").textContent==="CHECK FAILED");
 if((await page.locator("#forecast-next-rain-chance").textContent())!=="—")throw Error("Wrong location forecast leaked from cache");
 // Overview must expose missing condition code honestly, not imply clear skies.
 failure=false;invalid=false;
 await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem("skypulse.preferences"));
  p.location={name:"Cessnock",region:"New South Wales",lat:-32.8321,lon:151.3497};
  localStorage.setItem("skypulse.preferences",JSON.stringify(p));});
 await page.goto("http://127.0.0.1:8767/index.html",{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>document.querySelector("#forecast-health-title")?.textContent.includes("FORECAST DATA AVAILABLE"));
 if((await page.locator("#current-description").textContent())!=="Conditions unavailable")
  throw Error("Missing current WMO condition incorrectly reported as clear skies");
 if((await page.locator("#overview-next-rain-mm").textContent())==="—")throw Error("Overview next-six detail missing");
 // Invalid response can never turn into verified data when cached response is absent.
 await page.evaluate(()=>localStorage.removeItem("skypulse.weather.cache.v1"));
 invalid=true;await page.reload({waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>document.querySelector("#forecast-health-pill").textContent==="CHECK FAILED");
 if((await page.locator("#current-temp").textContent())!=="—")throw Error("Invalid API used as weather data");
 if(errors.length)throw Error("Browser runtime errors: "+errors.join(" | "));
 console.log("Forecast reliability PASSED: live model/fetch timestamps, 24 hourly and 7-day views, 3 charts, day details, cache/failure/no-cross-location and null WMO safety.");
 await page.close();
}finally{
 if(browser)await browser.close();
 srv.kill("SIGTERM");
}
