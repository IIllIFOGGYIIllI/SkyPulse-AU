/* SkyPulse AU · Cloud Intelligence
 * This module displays Open-Meteo numerical forecast cloud estimates. It
 * intentionally does NOT imply that precipitation radar can detect clouds.
 */
(function(){
"use strict";
const root=document.getElementById("cloud-panel");if(!root)return;
const $=id=>document.getElementById(id);
const KEYS={total:"cloud_cover",low:"cloud_cover_low",mid:"cloud_cover_mid",high:"cloud_cover_high"};
const TITLES={total:"Total Cloud Cover",low:"Low-Level Clouds",mid:"Mid-Level Clouds",high:"High-Level Clouds"};
const REFRESH_MS=15*60*1000;
let snapshot=null,checkedAt=0,failed=false,placeKey="",layer="total",sequence=0,loading=false;
function percent(x){return typeof x==="number"&&Number.isFinite(x)&&x>=0&&x<=100?Math.round(x):null;}
function epoch(value){
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value))return NaN;
 return Date.parse(value+"Z"); // Request timezone=GMT, so this is explicitly UTC.
}
function clock(value){
 return new Intl.DateTimeFormat("en-AU",{timeZone:"Australia/Sydney",day:"numeric",month:"short",hour:"numeric",minute:"2-digit",timeZoneName:"short"}).format(value);
}
function location(){
 const value=typeof window.SkyPulseWatchContext==="function"?window.SkyPulseWatchContext():null;
 if(!value||!Number.isFinite(value.latitude)||!Number.isFinite(value.longitude))return null;
 return value;
}
function parse(raw){
 if(!raw||!raw.current||!raw.hourly||!Array.isArray(raw.hourly.time))throw Error("Cloud forecast is incomplete");
 const validAt=epoch(raw.current.time),times=raw.hourly.time.map(epoch);
 if(!Number.isFinite(validAt)||validAt>Date.now()+3600000||validAt<Date.now()-24*3600000)
  throw Error("Cloud model valid time is not recent");
 if(!times.length||times.length>96||times.some(t=>!Number.isFinite(t)))
  throw Error("Invalid cloud forecast hourly times");
 const current={},hourly={};
 for(const kind of Object.keys(KEYS)){
  current[kind]=percent(raw.current[KEYS[kind]]);
  const values=raw.hourly[KEYS[kind]];
  hourly[kind]=times.map((_,i)=>Array.isArray(values)?percent(values[i]):null);
 }
 if(current.total===null)throw Error("Total cloud cover is missing");
 return {validAt,times,current,hourly};
}
function paint(){
 const status=$("cloud-model-status"),meta=$("cloud-model-meta"),scroller=$("cloud-hours");
 document.querySelectorAll("[data-cloud-layer]").forEach(button=>{
  const active=button.dataset.cloudLayer===layer;
  button.classList.toggle("is-active",active);
  button.setAttribute("aria-pressed",String(active));
 });
 $("cloud-trend-title").textContent=TITLES[layer];
 for(const kind of Object.keys(KEYS))$("cloud-value-"+kind).textContent=snapshot&&snapshot.current[kind]!==null?snapshot.current[kind]+"%":"—";
 if(!snapshot){
  status.className="cloud-health "+(failed?"unavailable":"waiting");
  status.textContent=failed?"CLOUD MODEL UNAVAILABLE":"CHECKING CLOUD MODEL";
  meta.textContent=failed?"Cloud estimates could not be verified · Open an official satellite viewer":"Open-Meteo numerical weather forecast";
  scroller.replaceChildren();
  const notice=document.createElement("p");notice.className="cloud-empty";
  notice.textContent="Hourly cloud model unavailable. For observed clouds, use BOM or JMA satellite imagery.";
  scroller.appendChild(notice);return;
 }
 const delayed=Date.now()-snapshot.validAt>90*60000||Date.now()-checkedAt>60*60000;
 const health=failed?"failed":delayed?"delayed":"recent";
 status.className="cloud-health "+health;
 status.textContent=failed?"PREVIOUS MODEL SNAPSHOT":delayed?"MODEL MAY BE DELAYED":"MODEL FORECAST AVAILABLE";
 meta.textContent="Model valid "+clock(snapshot.validAt)+" · Retrieved "+clock(checkedAt)+(failed?" · Latest check failed":"");
 scroller.replaceChildren();
 const upcoming=snapshot.times.map((time,i)=>({time,value:snapshot.hourly[layer][i]}))
  .filter(item=>item.time>=Date.now()-70*60000).slice(0,18);
 if(!upcoming.length){
  const notice=document.createElement("p");notice.className="cloud-empty";
  notice.textContent="No future hourly cloud forecast is available for this location.";
  scroller.appendChild(notice);return;
 }
 for(const item of upcoming){
  const label=new Intl.DateTimeFormat("en-AU",{timeZone:"Australia/Sydney",hour:"numeric",hour12:true}).format(item.time);
  const column=document.createElement("div");column.className="cloud-hour";
  column.title=label+" · "+(item.value===null?"Cloud data unavailable":item.value+"% modelled cloud cover");
  const hour=document.createElement("strong");hour.textContent=label;
  const track=document.createElement("div");track.className="cloud-hour-track";
  const fill=document.createElement("div");fill.className="cloud-hour-fill cloud-hour-"+layer;
  fill.style.height=(item.value===null?0:Math.max(3,item.value))+"%";
  track.appendChild(fill);
  const value=document.createElement("span");value.textContent=item.value===null?"—":item.value+"%";
  column.append(hour,track,value);scroller.appendChild(column);
 }
}
async function refresh(force){
 const loc=location();if(!loc)return;
 const key=loc.latitude.toFixed(4)+","+loc.longitude.toFixed(4);
 if(key!==placeKey){placeKey=key;snapshot=null;checkedAt=0;failed=false;sequence++;}
 if(!force&&snapshot&&!failed&&Date.now()-checkedAt<REFRESH_MS){paint();return;}
 if(loading&&!force)return;
 const id=++sequence;loading=true;$("cloud-refresh").disabled=true;
 const status=$("cloud-model-status");status.className="cloud-health waiting";status.textContent="CHECKING CLOUD MODEL";
 const qs=new URLSearchParams({
  latitude:String(loc.latitude),longitude:String(loc.longitude),
  current:Object.values(KEYS).join(","),hourly:Object.values(KEYS).join(","),
  forecast_hours:"24",timezone:"GMT"
 });
 const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),14000);
 try{
  const response=await fetch("https://api.open-meteo.com/v1/forecast?"+qs,{signal:abort.signal,cache:"no-store"});
  if(!response.ok)throw Error("HTTP "+response.status);
  const data=parse(await response.json());
  if(id!==sequence)return;
  snapshot=data;checkedAt=Date.now();failed=false;
 }catch(error){
  if(id!==sequence)return;
  failed=true; // Retained snapshot is labelled as previous, never current.
 }finally{
  clearTimeout(timeout);
  if(id===sequence){loading=false;$("cloud-refresh").disabled=false;paint();}
 }
}
document.querySelectorAll("[data-cloud-layer]").forEach(button=>{
 button.addEventListener("click",()=>{layer=button.dataset.cloudLayer;paint();});
});
$("cloud-refresh").addEventListener("click",()=>refresh(true));
window.addEventListener("skypulse:watch-changed",()=>refresh(true));
document.addEventListener("visibilitychange",()=>{
 if(document.visibilityState==="visible")refresh(false);
});
setInterval(()=>{if(document.visibilityState==="visible")refresh(false);},REFRESH_MS);
paint();
refresh(true);
})();