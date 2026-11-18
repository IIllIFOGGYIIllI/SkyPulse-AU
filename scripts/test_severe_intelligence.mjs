#!/usr/bin/env node
/* Severe Weather Intelligence browser regression: no live provider calls. */
import {chromium} from "playwright";
import {spawn} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";
const server=spawn("python",["-m","http.server","8781","--bind","127.0.0.1"],{stdio:"ignore",cwd:process.cwd()});
let browser;
try{
 await delay(1100);
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.addInitScript(()=>{
  if(!localStorage.getItem("skypulse.preferences"))localStorage.setItem("skypulse.preferences",JSON.stringify({
    location:{name:"Cessnock",region:"New South Wales",lat:-32.8321,lon:151.3497},
    theme:"dark",radius:50,notify:false
  }));
 });
 const offset=11*3600,localDate=new Date(Date.now()+offset*1000);
 localDate.setUTCHours(0,0,0,0);
 const times=Array.from({length:168},(_,i)=>new Date(localDate.getTime()+i*3600000).toISOString().slice(0,16));
 const days=Array.from({length:7},(_,i)=>times[i*24].slice(0,10));
 const forecast=()=>({
  utc_offset_seconds:offset,latitude:-32.8321,longitude:151.3497,timezone:"Australia/Sydney",
  timezone_abbreviation:"GMT+11",
  current:{time:new Date(Date.now()+offset*1000).toISOString().slice(0,16),
   temperature_2m:21,weather_code:2,is_day:1,apparent_temperature:20,
   relative_humidity_2m:65,wind_speed_10m:18,wind_gusts_10m:38,pressure_msl:1012,
   cloud_cover:40,dew_point_2m:15},
  hourly:{time:times,temperature_2m:times.map((_,i)=>18+i/15),
   precipitation:times.map(()=>2),precipitation_probability:times.map(()=>55),
   wind_gusts_10m:times.map(()=>68),wind_speed_10m:times.map(()=>21),
   relative_humidity_2m:times.map(()=>63),weather_code:times.map(()=>3),
   is_day:times.map(()=>1)},
  daily:{time:days,temperature_2m_max:days.map(()=>29),temperature_2m_min:days.map(()=>16),
   weather_code:days.map(()=>1),precipitation_sum:days.map(()=>3),
   precipitation_probability_max:days.map(()=>58),wind_gusts_10m_max:days.map(()=>70),
   uv_index_max:days.map(()=>7),sunrise:days.map(d=>d+"T06:00"),sunset:days.map(d=>d+"T19:40")}
 });
 let staleCAP=false;
 const now=new Date().toISOString(),old=new Date(Date.now()-5*3600000).toISOString();
 const poly=[[-32.86,151.32],[-32.86,151.39],[-32.81,151.39],[-32.81,151.32]];
 await page.route("**/*",route=>{
  const u=new URL(route.request().url()),file=u.pathname.split("/").at(-1);
  if(u.hostname==="api.open-meteo.com"){
   return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(forecast())});
  }
  if(u.hostname==="skypulse-au-alerts.foggy-streams248.workers.dev"){
   if(u.pathname==="/health")return route.fulfill({status:200,contentType:"application/json",
    headers:{"access-control-allow-origin":"*"},
    body:JSON.stringify({service:"SkyPulse AU",ready:false,sources:["NSW RFS warning polygons"],guaranteed_delivery:false})});
   if(u.pathname==="/public-key")return route.fulfill({status:503,contentType:"application/json",
    headers:{"access-control-allow-origin":"*"},body:'{"error":"Not configured"}'});
   return route.abort();
  }
  if(u.hostname==="127.0.0.1"&&u.pathname.startsWith("/data/")){
   let payload={retrieved_at:now,error:"Unavailable"};
   if(file==="rfs-alerts.json")payload={retrieved_at:staleCAP?old:now,alerts:[
    {id:"update-1",incident_id:"storm-1",message_type:"Update",status:"Actual",
     sent:now,expires:new Date(Date.now()+2*3600000).toISOString(),
     alert_level:"Emergency Warning",headline:"Published Warning Near Cessnock",
     polygons:[poly],web:"https://www.rfs.nsw.gov.au/fire-information/alerts-and-warnings"},
    {id:"nearby-watch",message_type:"Alert",status:"Actual",sent:now,alert_level:"Watch and Act",
     headline:"Published Warning Near Watch Radius",
     polygons:[[[-32.72,151.8],[-32.72,151.84],[-32.67,151.84],[-32.67,151.8]]]},
    {id:"unmapped",message_type:"Alert",status:"Actual",sent:now,alert_level:"Advice",
     headline:"Unmapped Published Alert",polygons:[]}
   ],cancellations:[{id:"cancel-1",sent:now,headline:"Statewide CAP Cancellation",references:"incident-2"}]};
   if(file==="rfs.json")payload={retrieved_at:now,features:[
    {id:"fire-1",geometry:{type:"Point",coordinates:[151.3497,-32.8321]},properties:{title:"Nearby Incident"}},
    {id:"fire-2",geometry:{type:"Point",coordinates:[153.8,-28.5]},properties:{title:"Far Incident"}}
   ]};
   if(file==="fdr.json")payload={retrieved_at:now,districts:[
    {name:"Greater Hunter",rating_today:"High",ban_today:false},
    {name:"Sydney",rating_today:"Moderate",ban_today:true}
   ]};
   if(file==="bom.json")payload={retrieved_at:null,error:"HTTP 403",warnings:[]};
   return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(payload)});
  }
  if(u.hostname==="127.0.0.1")return route.continue();
  return route.abort();
 });
 await page.goto("http://127.0.0.1:8781/index.html",{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>document.querySelector("#severe-warning-label")?.textContent.includes("Mapped Area Match"),null,{timeout:9000})
 .catch(async()=>{
  const debug=await page.evaluate(()=>({
   label:document.querySelector("#severe-warning-label")?.textContent,
   source:document.querySelector("#severe-source-count")?.textContent,
   model:document.querySelector("#severe-weather")?.textContent,
   location:window.SkyPulseWatchContext?.(),
   msg:document.querySelector("#severe-notice")?.textContent,
   scripts:[...document.scripts].map(s=>s.src).filter(s=>s.includes("severe"))
  }));
  throw Error("Severe polygon fixture not rendered: "+JSON.stringify({debug,errors}));
 });
 const active=await page.evaluate(()=>({
  warning:document.querySelector("#severe-warning-label").textContent,
  detail:document.querySelector("#severe-warning-detail").textContent,
  cards:document.querySelectorAll("#severe-warning-list .severe-warning-row").length,
  update:document.querySelector("#severe-warning-list").textContent,
  cancelled:document.querySelector("#severe-cap-notices").textContent,
  incidents:document.querySelector("#severe-incident-count").textContent,
  fire:document.querySelector("#severe-fire-danger").textContent,
  ban:document.querySelector("#severe-fire-ban").textContent,
  bom:document.querySelector("#severe-bom-status").textContent,
  source:document.querySelector("#severe-source-count").textContent,
  incidentDetails:document.querySelector("#severe-nearest-incidents").textContent,
  feedDetails:document.querySelector("#severe-source-details").textContent
 }));
 if(active.cards!==2||!active.update.includes("PUBLISHED UPDATE")||
  !active.update.includes("Polygon edge approx.")||
  !active.detail.includes("1 published polygon contains")||
  !active.detail.includes("1 additional warning area")||
  !active.incidentDetails.includes("km from selected point")||
  !active.feedDetails.includes("BOM Notices")||
  !active.feedDetails.includes("Unavailable / Stale")||
  !active.cancelled.includes("NOT location-matched")||active.incidents!=="1"||
  active.fire!=="High"||!active.ban.includes("No Total Fire Ban Listed")||
  !active.bom.includes("unavailable")||active.source!=="3/4 verified feed snapshots")
  throw Error("Official severe-weather aggregation failed: "+JSON.stringify(active));
 await page.waitForFunction(()=>document.querySelector("#severe-gust")?.textContent.includes("km/h"),null,{timeout:12000});
 if((await page.locator("#severe-weather").textContent()).includes("OFFICIAL warning"))
  throw Error("Modelled wind threshold presented as a live official warning");
 await page.setViewportSize({width:320,height:800});
 const over=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
 if(over>2)throw Error("Severe centre overflows 320px viewport by "+over+"px");
 staleCAP=true;await page.locator("#severe-refresh").click();
 await page.waitForFunction(()=>document.querySelector("#severe-warning-label")?.textContent==="RFS Feed Unavailable",null,{timeout:12000});
 if((await page.locator("#severe-warning-list .severe-warning-row").count())!==0||
    (await page.locator("#severe-cap-notices").textContent())!=="")
  throw Error("Stale CAP warnings or cancellation notice remained visible");
 staleCAP=false;
 await page.evaluate(()=>{
  const p=JSON.parse(localStorage.getItem("skypulse.preferences"));
  p.location={name:"Sydney",region:"New South Wales",lat:-33.8688,lon:151.2093};
  localStorage.setItem("skypulse.preferences",JSON.stringify(p));
 });
 await page.reload({waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>document.querySelector("#severe-warning-label")?.textContent==="No Published Polygon Match",null,{timeout:13000});
 if((await page.locator("#severe-incident-count").textContent())!=="0")throw Error("Cessnock fire incident leaked into Sydney");
 await page.goto("http://127.0.0.1:8781/forecast.html",{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>document.querySelectorAll("#quarter-rows .quarter-row").length===8,null,{timeout:15000});
 const quarter=await page.evaluate(()=>({
  rows:document.querySelectorAll("#quarter-rows .quarter-row").length,
  label:document.querySelector("#quarter-status").textContent,
  explanation:document.querySelector("#quarter-forecast").textContent,
  value:document.querySelector("#quarter-rows .quarter-row").textContent
 }));
 if(!quarter.label.includes("Interpolated")||!quarter.explanation.includes("hourly reference values")||
   !quarter.value.includes("mm/h"))throw Error("Unclear quarter-hour interpolation: "+JSON.stringify(quarter));
 await page.locator("#quarter-toggle").click();
 if(await page.locator("#quarter-content").isVisible())throw Error("Quarter-hour toggle failed to collapse");
 await page.reload({waitUntil:"domcontentloaded"});
 if(await page.locator("#quarter-content").isVisible())throw Error("Quarter-hour setting did not persist");
 await page.locator("#quarter-toggle").click();
 await page.waitForFunction(()=>document.querySelectorAll("#quarter-rows .quarter-row").length===8,null,{timeout:13000});
 await page.goto("http://127.0.0.1:8781/settings.html",{waitUntil:"domcontentloaded"});
 await page.locator("#push-diagnostics-check").click();
 await page.waitForFunction(()=>document.querySelector("#push-diagnostics")?.textContent.includes("Actual Background Delivery"),null,{timeout:13000});
 const diagnostics=await page.locator("#push-diagnostics").textContent();
 if(!diagnostics.includes("NOT VERIFIED")||!diagnostics.includes("Cloudflare Worker: Not Ready"))
  throw Error("Push diagnostics made an unsupported delivery claim: "+diagnostics);
 if(errors.length)throw Error("Browser JavaScript exceptions: "+errors.join(" | "));
 console.log("Severe Weather Intelligence PASSED: official polygons, CAP updates/cancellations, feed failures, Sydney isolation, 15-minute interpolation, mobile and push-readiness disclosures.");
}finally{
 if(browser)await browser.close();
 server.kill("SIGTERM");
}