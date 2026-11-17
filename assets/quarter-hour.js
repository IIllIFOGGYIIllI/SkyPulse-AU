/* Fifteen-minute forecast checkpoints calculated from hourly Open-Meteo model values.
 * This is display interpolation, not observed rain or a 15-minute radar nowcast. */
(function(){
"use strict";
const root=document.getElementById("quarter-forecast");if(!root)return;
const $=id=>document.getElementById(id);
const KEY="skypulse.quarter-visible.v1";
let expanded=true,latest=null;
try{expanded=localStorage.getItem(KEY)!=="false";}catch{}
function set(id,v){const el=$(id);if(el)el.textContent=v;}
const finite=v=>v!==null&&v!==undefined&&Number.isFinite(Number(v))?Number(v):null;
function timestamp(s,offset){
 if(typeof s!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(s))return NaN;
 return Date.parse(s+"Z")-offset*1000;
}
function fmt(t){
 return new Intl.DateTimeFormat("en-AU",{timeZone:"Australia/Sydney",hour:"numeric",minute:"2-digit",hour12:true}).format(t);
}
function reset(reason){
 $("quarter-rows")?.replaceChildren();
 set("quarter-status",reason||"Model data unavailable");
 set("quarter-checked","—");
}
function draw(){
 root.dataset.expanded=expanded?"true":"false";
 $("quarter-content").hidden=!expanded;
 $("quarter-toggle").textContent=expanded?"Hide 15-Minute View":"Show 15-Minute View";
 $("quarter-toggle").setAttribute("aria-expanded",String(expanded));
 if(!expanded)return;
 const event=latest,data=event?.data,offset=finite(data?.utc_offset_seconds),hourly=data?.hourly||{};
 if(!data||offset===null||!Array.isArray(hourly.time)||hourly.time.length<4){
  reset("No verified hourly model data. Quarter-hour estimates unavailable.");return;
 }
 const moments=hourly.time.map(t=>timestamp(t,offset));
 const start=Math.ceil(Date.now()/900000)*900000;
 const cells=[];
 for(let i=0;i<8;i++){
  const time=start+i*900000;
  const left=moments.findIndex((t,n)=>n<moments.length-1&&t<=time&&time<moments[n+1]);
  if(left<0)break;
  const step=(time-moments[left])/(moments[left+1]-moments[left]);
  if(!Number.isFinite(step)||step<0||step>1)break;
  const lerp=field=>{
   const a=finite(hourly[field]?.[left]),b=finite(hourly[field]?.[left+1]);
   return a===null||b===null?null:a+(b-a)*step;
  };
  // Probability is an hourly product, not a true fifteen-minute rain probability.
  // No quarter-hour rainfall amount is calculated from an hourly total.
  cells.push({time,temp:lerp("temperature_2m"),gust:lerp("wind_gusts_10m"),
   probability:finite(hourly.precipitation_probability?.[left]),
   hourlyRain:finite(hourly.precipitation?.[left])});
 }
 const box=$("quarter-rows");box.replaceChildren();
 if(cells.length<4){reset("Not enough upcoming hourly model values to interpolate.");return;}
 for(const cell of cells){
  const tr=document.createElement("div");tr.className="quarter-row";
  const values=[fmt(cell.time),cell.temp===null?"—":cell.temp.toFixed(1)+"°C",
   cell.gust===null?"—":Math.round(cell.gust)+" km/h",
   cell.probability===null?"—":Math.round(cell.probability)+"%",
   cell.hourlyRain===null?"—":cell.hourlyRain.toFixed(1)+" mm/h"];
  values.forEach((value,i)=>{
   const span=document.createElement(i===0?"strong":"span");
   span.textContent=value;tr.append(span);
  });box.append(tr);
 }
 const age=finite(event?.checkedAt),cached=event?.cached===true||event?.published===true;
 set("quarter-status",cached?"Saved model reference · Not live":"Interpolated hourly forecast · Not observed");
 set("quarter-checked",age===null?"Source time unavailable":"Retrieved "+fmt(age)+(cached?" · older model":""));
}
$("quarter-toggle")?.addEventListener("click",()=>{
 expanded=!expanded;try{localStorage.setItem(KEY,String(expanded));}catch{}
 draw();
});
window.addEventListener("skypulse:forecast-loaded",ev=>{latest=ev.detail;draw();});
window.addEventListener("skypulse:forecast-cleared",()=>{latest=null;reset("Current model forecast is unavailable.");});
window.addEventListener("skypulse:watch-changed",()=>{latest=null;reset("Loading the selected location's forecast…");});
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",draw,{once:true});else draw();
})();