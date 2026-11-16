#!/usr/bin/env node
/** Real Chromium browser check: NO mocked weather endpoints. Provider errors are reported with evidence. */
import {chromium} from "playwright";
import {spawn} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";
const server=spawn("python",["-m","http.server","8774","--bind","127.0.0.1"],{stdio:"ignore",cwd:process.cwd()});
let browser;
try{
 await delay(1100);
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[],responses=[],failures=[];
 page.on("pageerror",e=>errors.push(e.message));
 page.on("requestfailed",req=>{if(/open-meteo|rainviewer/.test(req.url()))failures.push(req.url()+" "+req.failure()?.errorText);});
 page.on("response",res=>{if(/open-meteo|rainviewer/.test(res.url()))responses.push({url:res.url().split("?")[0],status:res.status()});});
 await page.goto("http://127.0.0.1:8774/forecast.html",{waitUntil:"domcontentloaded",timeout:35000});
 await page.waitForFunction(()=>{
  const badge=document.querySelector("#forecast-health-pill")?.textContent;
  const models=document.querySelector("#compare-checked-at")?.textContent;
  return badge&&badge!=="CHECKING"&&models&&models!=="—";
 },null,{timeout:40000}).catch(()=>{});
 const forecast=await page.evaluate(()=>({
  status:document.querySelector("#forecast-health-pill")?.textContent,
  current:document.querySelector("#forecast-health-detail")?.textContent,
  modelTime:document.querySelector("#forecast-model-time")?.textContent,
  day:document.querySelector("#forecast-next-temps")?.textContent,
  ecmwfStatus:document.querySelector("#compare-ecmwf-status")?.textContent,
  ecmwfTemp:document.querySelector("#compare-ecmwf-temp")?.textContent,
  gfsStatus:document.querySelector("#compare-gfs-status")?.textContent,
  gfsTemp:document.querySelector("#compare-gfs-temp")?.textContent,
  spread:document.querySelector("#compare-temp-spread")?.textContent,
  summary:document.querySelector("#compare-summary")?.textContent
 }));
 console.log("REAL BROWSER FORECAST",JSON.stringify({forecast,responses,failures,errors}));
 const fail=!/°/.test(forecast.ecmwfTemp||"")||!/°/.test(forecast.gfsTemp||"")||
  forecast.status!=="MODEL DATA";
 await page.goto("http://127.0.0.1:8774/settings.html",{waitUntil:"domcontentloaded",timeout:30000});
 await page.waitForFunction(()=>document.querySelector("#source-health-checked")?.textContent!=="—",null,{timeout:15000}).catch(()=>{});
 const settings=await page.evaluate(()=>({
  summary:document.querySelector("#source-health-summary")?.textContent,
  checked:document.querySelector("#source-health-checked")?.textContent,
  states:[...document.querySelectorAll(".source-health-item")].map(e=>({
   name:e.querySelector("strong")?.textContent,state:e.dataset.health,detail:e.querySelector("p")?.textContent
  }))
 }));
 console.log("REAL BROWSER SOURCE STATUS",JSON.stringify({settings,errors}));
 if(fail||errors.length||settings.states.some(e=>e.state==="checking"))
  throw Error("Live browser data integration failed; see real-provider HTTP responses and UI above");
 console.log("LIVE WEATHER BROWSER PASSED");
}finally{
 if(browser)await browser.close();
 server.kill("SIGTERM");
}