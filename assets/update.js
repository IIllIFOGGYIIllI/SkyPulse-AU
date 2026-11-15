/* SkyPulse AU release detection. Does not reset data, unregister SW, or touch push subscriptions. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const running=document.documentElement.getAttribute("data-build")||"";
const valid=version=>/^[0-9a-f]{12}$/.test(String(version||""));
let serverVersion=null,reg=null,loading=false,reloadAccepted=false,reloadStarted=false;
const wasControlled=!!(navigator.serviceWorker&&navigator.serviceWorker.controller);
function setStatus(message,type){
  const el=$("app-update-status");
  if(el){el.textContent=message;el.className="update-status"+(type?" "+type:"");}
}
function offerUpdate(){
  if($("app-update-banner"))$("app-update-banner").hidden=false;
  if($("app-update-apply"))$("app-update-apply").hidden=false;
  setStatus("A newer release is available. Select Update Now to refresh the app.","available");
}
function upToDate(){
  if($("app-update-banner"))$("app-update-banner").hidden=true;
  if($("app-update-apply"))$("app-update-apply").hidden=true;
  setStatus("Your app is up to date.");
}
function changed(){
  if(!valid(serverVersion)||!valid(running))return !!reg?.waiting&&wasControlled;
  return serverVersion!==running;
}
async function check(manual){
  if(loading)return;
  loading=true;
  const btn=$("app-update-check");
  if(btn)btn.disabled=true;
  if(manual)setStatus("Checking the published release and service worker…");
  try{
    if("serviceWorker" in navigator){
      reg=reg||await navigator.serviceWorker.register("./sw.js",{scope:"./",updateViaCache:"none"});
      await reg.update().catch(()=>{});
    }
    const response=await fetch("./app-version.json?check="+Date.now(),{
      cache:"no-store",headers:{"accept":"application/json"}
    });
    if(!response.ok)throw Error("Release information unavailable");
    const data=await response.json();
    if(!valid(data.version))throw Error("Invalid release information");
    serverVersion=data.version;
    if(changed())offerUpdate();else upToDate();
  }catch(e){
    setStatus(navigator.onLine?"Unable to verify the latest release. Try Check for Updates again.":"Offline — update checks require an internet connection.","error");
    if(reg?.waiting&&wasControlled)offerUpdate();
  }finally{
    loading=false;
    if(btn)btn.disabled=false;
  }
}
function reloadWithVersion(){
  if(reloadStarted)return;
  reloadStarted=true;
  const url=new URL(location.href);
  url.searchParams.set("app_release",valid(serverVersion)?serverVersion:Date.now().toString(36));
  location.replace(url.href);
}
async function applyUpdate(){
  const button=$("app-update-apply");
  if(button)button.disabled=true;
  setStatus("Applying the latest app files…");
  reloadAccepted=true;
  try{
    if(reg?.waiting){
      reg.waiting.postMessage({type:"SKYPULSE_ACTIVATE_UPDATE"});
      // If a client becomes uncontrolled or the controller is already current,
      // navigation still revalidates the HTML against GitHub Pages.
      setTimeout(()=>{if(!reloadStarted)reloadWithVersion();},2600);
      return;
    }
    if(reg)await reg.update().catch(()=>{});
    if(reg?.waiting){
      reg.waiting.postMessage({type:"SKYPULSE_ACTIVATE_UPDATE"});
      setTimeout(()=>{if(!reloadStarted)reloadWithVersion();},2600);
      return;
    }
    reloadWithVersion();
  }catch(e){
    if(button)button.disabled=false;
    reloadWithVersion();
  }
}
function init(){
  const label=$("app-version-value");
  if(label)label.textContent=valid(running)?running:"Unverified";
  $("app-update-check")?.addEventListener("click",()=>check(true));
  $("app-update-apply")?.addEventListener("click",applyUpdate);
  $("app-update-banner-button")?.addEventListener("click",applyUpdate);
  if("serviceWorker" in navigator){
    navigator.serviceWorker.addEventListener("controllerchange",()=>{
      if(!wasControlled||!reloadAccepted||reloadStarted)return;
      reloadWithVersion();
    });
  }
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible")check(false);
  });
  window.addEventListener("online",()=>check(false));
  setInterval(()=>{if(document.visibilityState==="visible")check(false);},15*60*1000);
  check(false);
}
document.addEventListener("DOMContentLoaded",init);
})();