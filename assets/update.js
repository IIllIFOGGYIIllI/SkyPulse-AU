/* SkyPulse AU — automatic PWA updates, safe around active interaction.
 * No app data, push subscriptions or browser preferences are cleared.
 */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const running=document.documentElement.getAttribute("data-build")||"";
const valid=value=>/^[0-9a-f]{12}$/.test(String(value||""));
const CHECK_INTERVAL=15*60*1000,IDLE_AFTER=60*1000,OPEN_GRACE=6000,RETRY_DELAY=8000;
let serverVersion=null,reg=null,loading=false,applying=false,reloadStarted=false;
let lastActivity=0,openedAt=Date.now(),foregroundAt=openedAt,autoTimer=null;
const wasControlled=!!(navigator.serviceWorker&&navigator.serviceWorker.controller);
function setStatus(message,type){
  const el=$("app-update-status");
  if(el){el.textContent=message;el.className="update-status"+(type?" "+type:"");}
}
function pendingUpdate(){
  return (valid(serverVersion)&&valid(running)&&serverVersion!==running)||
    (!!reg?.waiting&&wasControlled);
}
function showBanner(show){
  if($("app-update-banner"))$("app-update-banner").hidden=!show;
  if($("app-update-apply"))$("app-update-apply").hidden=!show;
}
function versionAttemptKey(){return "skypulse-update-attempt:"+serverVersion;}
function recentAttempts(){
  if(!valid(serverVersion))return 0;
  try{
    const item=JSON.parse(sessionStorage.getItem(versionAttemptKey())||"null");
    return item&&Date.now()-item.time<10*60*1000?Number(item.count)||0:0;
  }catch{return 0;}
}
function recordAttempt(){
  if(!valid(serverVersion))return;
  try{sessionStorage.setItem(versionAttemptKey(),JSON.stringify({count:recentAttempts()+1,time:Date.now()}));}catch{}
}
function editableFocused(){
  const el=document.activeElement;
  return !!el&&!!el.matches?.('input,textarea,select,[contenteditable="true"],[role="textbox"]');
}
function safeToAutoApply(){
  if(document.visibilityState!=="visible"||editableFocused())return false;
  const now=Date.now();
  if(now-openedAt<OPEN_GRACE||now-foregroundAt<OPEN_GRACE)return false;
  // When the user is actively navigating or changing settings, defer until idle.
  if(lastActivity&&now-lastActivity<IDLE_AFTER)return false;
  return true;
}
function scheduleAuto(){
  if(autoTimer||!pendingUpdate()||applying)return;
  autoTimer=setTimeout(function(){
    autoTimer=null;
    if(!pendingUpdate()||applying)return;
    if(recentAttempts()>=2){
      setStatus("The automatic update did not complete. Use Update Now or reopen the app.","error");
      showBanner(true);
      return;
    }
    if(!safeToAutoApply()){
      scheduleAuto();
      return;
    }
    applyUpdate(false);
  },RETRY_DELAY);
}
function offerUpdate(){
  showBanner(true);
  setStatus("New version available. SkyPulse AU will update automatically when it is safe to reload.","available");
  scheduleAuto();
}
function upToDate(){
  showBanner(false);
  setStatus("Automatic Updates Enabled · Your app is up to date.");
}
async function check(manual){
  if(loading||applying)return;
  loading=true;
  const btn=$("app-update-check");
  if(btn)btn.disabled=true;
  if(manual)setStatus("Checking for the latest release…");
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
    if(pendingUpdate())offerUpdate();else upToDate();
  }catch(e){
    if(pendingUpdate())offerUpdate();
    else setStatus(navigator.onLine?"Update server unavailable; SkyPulse will check again automatically.":"Offline · SkyPulse will check for updates when connected.","error");
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
async function applyUpdate(manual){
  if(applying||reloadStarted||!pendingUpdate())return;
  if(!manual&&!safeToAutoApply()){scheduleAuto();return;}
  if(!manual&&recentAttempts()>=2){showBanner(true);return;}
  applying=true;
  recordAttempt();
  if($("app-update-apply"))$("app-update-apply").disabled=true;
  if($("app-update-banner-button"))$("app-update-banner-button").disabled=true;
  setStatus("Updating SkyPulse AU automatically…");
  try{
    if(!reg?.waiting&&reg)await reg.update().catch(()=>{});
    if(reg?.waiting){
      reg.waiting.postMessage({type:"SKYPULSE_ACTIVATE_UPDATE"});
      // Fallback for browsers which don't emit controllerchange promptly.
      setTimeout(()=>{if(!reloadStarted)reloadWithVersion();},2500);
    }else reloadWithVersion();
  }catch(e){reloadWithVersion();}
}
function init(){
  const label=$("app-version-value");
  if(label)label.textContent=valid(running)?running:"Unverified";
  $("app-update-check")?.addEventListener("click",()=>check(true));
  $("app-update-apply")?.addEventListener("click",()=>applyUpdate(true));
  $("app-update-banner-button")?.addEventListener("click",()=>applyUpdate(true));
  const activity=()=>{lastActivity=Date.now();};
  document.addEventListener("pointerdown",activity,{passive:true});
  document.addEventListener("keydown",activity,{passive:true});
  document.addEventListener("input",activity,{passive:true});
  if("serviceWorker" in navigator){
    navigator.serviceWorker.addEventListener("controllerchange",()=>{
      if(!applying||reloadStarted)return;
      reloadWithVersion();
    });
  }
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible"){
      foregroundAt=Date.now();
      check(false);
      scheduleAuto();
    }
  });
  window.addEventListener("pageshow",event=>{
    if(event.persisted){foregroundAt=Date.now();check(false);}
  });
  window.addEventListener("online",()=>check(false));
  setInterval(()=>{if(document.visibilityState==="visible")check(false);},CHECK_INTERVAL);
  check(false);
}
document.addEventListener("DOMContentLoaded",init);
})();
