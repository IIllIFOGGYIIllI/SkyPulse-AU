#!/usr/bin/env node
/**
 * Prevent regressions where hourly/day cards make the entire PWA hundreds of
 * pixels wider than the mobile viewport. Run after the production build stamp.
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const server=spawn("python",["-m","http.server","8765","--bind","127.0.0.1"],{
  stdio:"ignore",cwd:process.cwd()
});
let browser;
try{
  await delay(1400);
  browser=await chromium.launch({headless:true});
  for(const width of [320,360,390,430,768,1024]){
    const context=await browser.newContext({viewport:{width,height:780},isMobile:width<890,hasTouch:width<890,deviceScaleFactor:1});
    const page=await context.newPage();
    // Layout should not depend on live weather services or remote fonts.
    await page.route("**/*",route=>{
      const url=new URL(route.request().url());
      if(url.hostname==="127.0.0.1")return route.continue();
      return route.abort();
    });
    await page.goto("http://127.0.0.1:8765/",{waitUntil:"domcontentloaded",timeout:30000});
    await page.locator("#hourly-list").evaluate(el=>{
      el.innerHTML=Array.from({length:12},(_,i)=>
        '<div class="hour-cell"><small>'+i+':00</small><span class="hour-icon">☁</span><strong>22°</strong><span class="hour-rain">80%</span></div>').join("");
    });
    await page.locator("#daily-list").evaluate(el=>{
      el.innerHTML=Array.from({length:7},(_,i)=>
        '<div class="day"><small>Day '+(i+1)+'</small><span class="day-icon">☀</span><strong>27°</strong><span class="rain">10 mm</span></div>').join("");
    });
    const measurements=await page.evaluate(()=>{
      const tab=document.querySelector(".mobile-tabs");
      const bar=document.querySelector(".top-actions");
      const hourly=document.querySelector(".hours-scroll");
      const days=document.querySelector(".days-list");
      const rectangle=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width};};
      return {viewport:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth,
        tabs:rectangle(tab),tabVisible:getComputedStyle(tab).display!=="none",
        actionBar:rectangle(bar),hours:rectangle(hourly),days:rectangle(days),
        links:[...tab.querySelectorAll("a")].map(rectangle)};
    });
    console.log(width+" px viewport:",JSON.stringify(measurements));
    if(measurements.html>width+2||measurements.body>width+2)
      throw new Error("Page-wide horizontal overflow at "+width+"px");
    if(width<=768){
      if(!measurements.tabVisible)throw new Error("Mobile tabs hidden at "+width);
      if(measurements.tabs.left < -2||measurements.tabs.right>width+2)
        throw new Error("Mobile tab bar escapes viewport at "+width);
      if(measurements.links.length!==5||measurements.links.some(r=>r.width<35||
        r.left < -2||r.right>width+2))
        throw new Error("Navigation tab exceeds viewport or is too narrow at "+width);
      if(measurements.actionBar.left< -2||measurements.actionBar.right>width+2)
        throw new Error("Top action controls exceed viewport at "+width);
      if(measurements.hours.right>width+2||measurements.days.right>width+2)
        throw new Error("Forecast cards exceed viewport at "+width);
      await page.locator('.mobile-tab[data-tab="forecast"]').click();
      if(await page.locator('.mobile-tab[data-tab="forecast"]').getAttribute("aria-current")!=="page")
        throw new Error("Active forecast tab failed after click");
    }
    await context.close();
  }
  console.log("SkyPulse mobile responsive layout PASSED at 320, 360, 390, 430, 768, and 1024 px.");
} finally{
  if(browser)await browser.close();
  server.kill("SIGTERM");
}
