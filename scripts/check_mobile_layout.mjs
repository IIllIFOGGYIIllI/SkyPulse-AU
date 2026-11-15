#!/usr/bin/env node
/** Real-browser checks for every SkyPulse route across phone/tablet/desktop. */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
const cases=[
  ["index.html","overview"],
  ["forecast.html","forecast"],
  ["radar.html","map-section"],
  ["hazards.html","hazards"],
  ["news.html","news"],
  ["settings.html","alerts"]
];
const widths=[320,360,390,430,768,1024];
const server=spawn("python",["-m","http.server","8765","--bind","127.0.0.1"],{stdio:"ignore",cwd:process.cwd()});
let browser;
try {
  await delay(1000);
  browser=await chromium.launch({headless:true});
  for(const width of widths){
    const context=await browser.newContext({viewport:{width,height:800},isMobile:width<=768,hasTouch:width<=768});
    await context.addInitScript(()=>{
      // Tests don't require network, geolocation, or user notification permission.
      localStorage.setItem("skypulse.preferences",JSON.stringify({
        location:{name:"Cessnock",region:"New South Wales",lat:-32.8321,lon:151.3497},
        theme:"dark",radius:50,notify:false
      }));
    });
    for(const [file,pageId] of cases){
      const page=await context.newPage();
      const errors=[];
      page.on("pageerror",e=>errors.push(e.message));
      await page.route("**/*",route=>{
        const url=new URL(route.request().url());
        if(url.hostname==="127.0.0.1")return route.continue();
        return route.abort();
      });
      const response=await page.goto("http://127.0.0.1:8765/"+file,{waitUntil:"domcontentloaded",timeout:30000});
      if(!response?.ok())throw Error(file+" HTTP status "+response?.status());
      if(file==="forecast.html"){
        await page.locator("#hourly-list").evaluate(el=>{
          el.innerHTML=Array.from({length:12},(_,i)=>
            '<div class="hour-cell"><small>'+i+':00</small><span>☁</span><strong>22°</strong></div>').join("");
        });
        await page.locator("#daily-list").evaluate(el=>{
          el.innerHTML=Array.from({length:7},(_,i)=>
            '<div class="day"><small>Day '+i+'</small><strong>27°</strong></div>').join("");
        });
      }
      await page.waitForTimeout(180);
      const m=await page.evaluate(()=>{
        const rect=el=>{const x=el.getBoundingClientRect();return {left:x.left,right:x.right,width:x.width};};
        const nav=document.querySelector(".mobile-tabs");
        return {
          innerWidth,documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,
          page:document.body.dataset.page,tabs:getComputedStyle(nav).display!=="none",
          nav:rect(nav),items:[...nav.querySelectorAll("a")].map(rect),
          actions:rect(document.querySelector(".top-actions")),
          active:nav.querySelector("a[aria-current=page]")?.dataset.tab,
          focused:document.activeElement?.tagName
        };
      });
      if(m.page!==pageId)throw Error(file+" wrong page ID");
      if(m.documentWidth>width+2||m.bodyWidth>width+2)
        throw Error(file+" overflows "+width+"px: "+JSON.stringify(m));
      if(width<=768){
        if(!m.tabs||m.items.length!==6||m.active!==pageId)
          throw Error(file+" incorrect mobile tabs "+width+"px: "+JSON.stringify(m));
        if(m.nav.left < -2||m.nav.right>width+2||m.items.some(x=>x.width<30||x.left< -2||x.right>width+2))
          throw Error(file+" mobile tab outside viewport "+width+"px: "+JSON.stringify(m));
        if(m.actions.left< -2||m.actions.right>width+2)
          throw Error(file+" action toolbar outside viewport "+width+"px");
      }
      if(errors.length)throw Error(file+" JS errors at "+width+"px: "+errors.slice(0,4).join(" | "));
      if(width===390&&pageId==="overview"){
        await page.locator('.mobile-tab[data-tab="alerts"]').click();
        if(!page.url().endsWith("/settings.html"))throw Error("Settings navigation did not open separate page");
      }
      if(width===390&&pageId==="settings"){
        const found=await page.evaluate(()=>JSON.parse(localStorage.getItem("skypulse.preferences")).location.name);
        if(found!=="Cessnock")throw Error("Saved settings were lost between pages");
      }
      await page.close();
    }
    await context.close();
    console.log("All six SkyPulse pages passed at "+width+"px.");
  }
  console.log("SkyPulse six-page responsive browser checks PASSED.");
} finally {
  if(browser)await browser.close();
  server.kill("SIGTERM");
}
