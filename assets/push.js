/* SkyPulse AU — explicitly opt-in background Web Push client. No hidden subscriptions. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const context=()=>window.SkyPulseWatchContext?.();
const ROOT=(window.SKYPULSE_PUSH_API||"").trim().replace(/\/+$/,"");
let publicKey="",ready=false,updating=false,syncTimer=null;
const supported=()=>("serviceWorker" in navigator)&&("PushManager" in window)&&("Notification" in window);
function status(text,kind=""){
  const e=$("push-status");if(!e)return;e.textContent=text;e.className="push-status"+(kind?" "+kind:"");
  const badge=$("push-status-badge");if(badge)badge.textContent=kind==="ready"?"SERVICE AVAILABLE":kind==="problem"?"ACTION NEEDED":"NOT CONFIGURED";
}
function btnState(hasSubscription){
  $("push-enable").hidden=hasSubscription;
  $("push-disable").hidden=!hasSubscription;
  $("push-update").hidden=!hasSubscription;
  $("push-test").hidden=!hasSubscription;
}
async function subscription(){const reg=await navigator.serviceWorker.ready;return reg.pushManager.getSubscription();}
function decodeBase64URL(s){
  const t=s.replace(/-/g,"+").replace(/_/g,"/"),raw=atob(t+"=".repeat((4-t.length%4)%4));
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
async function requestAPI(endpoint,payload){
  const res=await fetch(ROOT+endpoint,{method:"POST",mode:"cors",headers:{"content-type":"application/json"},
    body:JSON.stringify(payload),cache:"no-store"});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(data.error||"Push service returned HTTP "+res.status);
  return data;
}
async function refreshStatus(){
  if(!ROOT){
    ready=false;status("Background Push Is Not Activated: The Cloudflare notification service has not been connected. The website's existing on-screen monitoring is still available.","problem");
    $("push-enable").textContent="View Push Setup Instructions";
    btnState(false);return;
  }
  if(!supported()){
    status("Background Push Is Not Supported in This Browser Context. On iPhone, open SkyPulse AU from its Home Screen icon (iOS 16.4+).","problem");
    $("push-enable").disabled=true;return;
  }
  try{
    const url=new URL(ROOT);if(url.protocol!=="https:")throw Error("Secure HTTPS Worker URL required");
    const res=await fetch(ROOT+"/public-key",{cache:"no-store"});
    const data=await res.json();
    if(!res.ok||!data.publicKey)throw Error(data.error||"Service unavailable");
    publicKey=data.publicKey;ready=true;
    const sub=await subscription();
    btnState(Boolean(sub));$("push-enable").textContent="Enable Background Alerts";
    if(sub){
      status("Device Push Subscription Found. Delivery from Cloudflare to this device is NOT independently verified.","ready");
      if($("push-status-badge"))$("push-status-badge").textContent="DEVICE SUBSCRIBED";
    }else status("Background Push Service Is Available. Subscribe before notifications can be received.","ready");
  }catch(e){
    ready=false;btnState(false);
    status("Background Push Service Is Unavailable or Not Configured: "+String(e.message||e)+". No background notifications are active.","problem");
  }
}
function payloadFor(sub){
  const c=context();if(!c||!Number.isFinite(Number(c.latitude))||!Number.isFinite(Number(c.longitude)))
    throw Error("Choose a valid Australian location before enabling alerts");
  return {endpoint:sub.endpoint,latitude:Number(c.latitude),longitude:Number(c.longitude),
    radiusKm:Number(c.radiusKm),includeIncidents:$("push-include-incidents").checked};
}
async function register(sub){return requestAPI("/subscribe",payloadFor(sub));}
async function enable(){
  if(!ROOT){window.open("https://github.com/IIllIFOGGYIIllI/SkyPulse-AU/blob/main/docs/PUSH_SETUP.md","_blank","noopener,noreferrer");return;}
  if(!ready||!supported()){status("Push Service Not Ready. Check configuration and browser support.","problem");return;}
  if(!$("push-consent").checked){status("Please Read and Tick the Consent Checkbox Before Enabling Push Notifications.","problem");return;}
  const button=$("push-enable");button.disabled=true;
  try{
    // Request permission inside this click handler; never prompt on page load.
    const permission=Notification.permission==="granted"?"granted":await Notification.requestPermission();
    if(permission!=="granted")throw Error("Browser notification permission was not granted");
    const reg=await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription(),newlyCreated=false;
    if(!sub){sub=await reg.pushManager.subscribe({userVisibleOnly:true,
      applicationServerKey:decodeBase64URL(publicKey)});newlyCreated=true;}
    try{await register(sub);}catch(err){if(newlyCreated)await sub.unsubscribe().catch(()=>{});throw err;}
    btnState(true);
    status("Background Alerts Enabled for Your Saved Watch Location (Best-Effort Delivery). The official Hazards Near Me app remains essential.","ready");
  }catch(e){status("Background Alerts Not Enabled: "+String(e.message||e),"problem");}
  finally{button.disabled=false;}
}
async function disable(){
  $("push-disable").disabled=true;
  try{
    const sub=await subscription();
    if(sub){if(ROOT)await requestAPI("/unsubscribe",{endpoint:sub.endpoint});await sub.unsubscribe();}
    btnState(false);status("Background Notifications Disabled for This Device. Existing browser-only monitoring remains separate.");
  }catch(e){status("Could Not Fully Disable Notifications: "+String(e.message||e)+". Check browser notification settings.","problem");}
  finally{$("push-disable").disabled=false;}
}
async function update(){
  if(!ready||updating)return;
  updating=true;try{
    const sub=await subscription();if(!sub)return;
    await register(sub);
    status("Background Watch Zone Updated: Approximate Location and Alert Radius Saved.","ready");
  }catch(e){status("Unable to Update Watch Zone: "+String(e.message||e),"problem");}
  finally{updating=false;}
}
async function testDeviceNotification(){
  try{
    const reg=await navigator.serviceWorker.ready;
    await reg.showNotification("SkyPulse AU — Device Test",{
      body:"This is a local test, not a delivered background warning. Always follow official alerts.",
      icon:"./assets/icon.svg",tag:"skypulse-test",data:{url:new URL("./#alerts",location.href).href}
    });
    status("Local Display Test Completed. This Does NOT Verify Cloudflare-To-Device Delivery.","ready");
  }catch(e){status("Unable to Show Test Notification: "+String(e.message||e),"problem");}
}
async function checkReadiness(){
 const out=$("push-diagnostics");if(!out)return;
 const button=$("push-diagnostics-check");
 if(button)button.disabled=true;
 out.textContent="Checking browser, Worker, device and delivery requirements…";
 const checks=[];
 try{
  checks.push("HTTPS: "+(window.isSecureContext?"Available":"Required"));
  checks.push("Browser Push: "+(supported()?"Supported":"Unsupported in this browser context"));
  checks.push("Notification Permission: "+(supported()?Notification.permission:"Unavailable"));
  if(ROOT){
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),9000);
   try{
    const response=await fetch(ROOT+"/health",{signal:controller.signal,cache:"no-store"});
    if(!response.ok)throw Error("HTTP "+response.status);
    const d=await response.json();
    checks.push("Cloudflare Worker: "+(d.ready===true?"Configured":"Not Ready"));
    checks.push("Gateway Coverage: "+(Array.isArray(d.sources)?d.sources.join(", "):"Unverified"));
   }catch(e){checks.push("Cloudflare Worker: Connection Failed ("+String(e.message||e)+")");}
   finally{clearTimeout(timeout);}
  }else checks.push("Cloudflare Worker: URL Not Configured");
  if(supported()){
   const sub=await Promise.race([subscription(),new Promise((_,reject)=>setTimeout(()=>reject(Error("Timed out")),7000))]).catch(()=>null);
   checks.push("Device Subscription: "+(sub?"Found":"Not Found"));
  }
  checks.push("Actual Background Delivery: NOT VERIFIED · Local Display Test Only");
  out.replaceChildren();
  checks.forEach(item=>{const row=document.createElement("div");row.className="push-check-row";row.textContent=item;out.append(row);});
 }finally{if(button)button.disabled=false;}
}
function init(){
  $("push-diagnostics-check")?.addEventListener("click",checkReadiness);
  $("push-enable").addEventListener("click",enable);
  $("push-disable").addEventListener("click",disable);
  $("push-update").addEventListener("click",update);
  $("push-test").addEventListener("click",testDeviceNotification);
  $("push-include-incidents").addEventListener("change",()=>{if(ready)update();});
  window.addEventListener("skypulse:watch-changed",()=>{
    if(!ready)return;
    clearTimeout(syncTimer);syncTimer=setTimeout(update,1100);
  });
  refreshStatus();
}
document.addEventListener("DOMContentLoaded",init);
})();
