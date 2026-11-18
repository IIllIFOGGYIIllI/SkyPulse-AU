/* Forecast revisions are NOT measured accuracy. Samples remain in this browser only. */
(function(){
"use strict";
const root=document.getElementById("forecast-revisions");
if(!root)return;
const $=id=>document.getElementById(id);
const KEY="skypulse.forecast.revisions.v1",MAX_AGE=72*3600000,MIN_GAP=30*60000;
let location=null,current=null;
const set=(id,value)=>{if($(id))$(id).textContent=value;};
const finite=value=>value===null||value===undefined||!Number.isFinite(+value)?null:+value;
const key=loc=>(+loc.lat).toFixed(4)+":"+(+loc.lon).toFixed(4);
function saved(){
 try{const d=JSON.parse(localStorage.getItem(KEY)||"null");return Array.isArray(d?.locations)?d.locations:[];}
 catch{return [];}
}
function save(rows){try{localStorage.setItem(KEY,JSON.stringify({locations:rows.slice(-5)}));}catch{}}
function snapshot(detail){
 const h=detail?.data?.hourly||{},offset=finite(detail?.data?.utc_offset_seconds);
 const at=finite(detail?.checkedAt);
 if(offset===null||at===null||at>Date.now()+60000||at<Date.now()-24*3600000||
    !Array.isArray(h.time)||h.time.length<12||
    ["temperature_2m","precipitation","wind_gusts_10m"].some(f=>!Array.isArray(h[f])||h[f].length!==h.time.length))return null;
 return {at,offset,times:h.time.slice(0,72),temp:h.temperature_2m.slice(0,72),
  rain:h.precipitation.slice(0,72),gust:h.wind_gusts_10m.slice(0,72)};
}
function datestr(at){
 return new Intl.DateTimeFormat("en-AU",{timeZone:"Australia/Sydney",day:"numeric",month:"short",
  hour:"numeric",minute:"2-digit",hour12:true,timeZoneName:"short"}).format(at);
}
function formatDelta(value,unit,digits=1){
 if(value===null)return "—";
 const zero=Math.abs(value)<Math.pow(10,-digits)/2?0:value;
 return (zero>0?"+":"")+zero.toFixed(digits)+unit;
}
function clearValues(){
 for(const n of ["temp","rain","gust"])set("revision-"+n,"—");
 set("revision-window","—");
 set("revision-baseline","No previous verified model retrieval");
}
function show(){
 if(!location||!current){clearValues();set("revision-status","Waiting for a direct forecast at the selected location.");return;}
 if(current.cached||current.published){
  clearValues();set("revision-status","Only cached or published reference values are available. No new forecast revision is recorded.");return;
 }
 const bucket=saved().find(x=>x.key===key(location));
 const list=Array.isArray(bucket?.samples)?bucket.samples:[];
 if(list.length<2){clearValues();set("revision-status","First model forecast saved. A comparison is possible after another direct retrieval at least 30 minutes later.");return;}
 const previous=list.at(-2),latest=list.at(-1);
 const localHour=new Date(Date.now()+latest.offset*1000).toISOString().slice(0,13);
 const earlier=new Map(previous.times.map((t,i)=>[t,i]));
 const common=latest.times.map((t,i)=>({t,i,j:earlier.get(t)}))
  .filter(x=>x.t.slice(0,13)>=localHour&&Number.isInteger(x.j)).slice(0,6);
 if(common.length<4){clearValues();set("revision-status","Not enough matching future hours across these two forecast retrievals.");return;}
 const one=(name,x)=>{
  const a=finite(latest[name]?.[x.i]),b=finite(previous[name]?.[x.j]);
  return a===null||b===null?null:[a,b];
 };
 const chosen=common[Math.min(3,common.length-1)],temp=one("temp",chosen);
 const rainPairs=common.map(x=>one("rain",x)),gustPairs=common.map(x=>one("gust",x));
 const totals=rainPairs.some(x=>!x)?null:rainPairs.reduce((n,x)=>n+x[0]-x[1],0);
 const peaks=gustPairs.some(x=>!x)?null:Math.max(...gustPairs.map(x=>x[0]))-Math.max(...gustPairs.map(x=>x[1]));
 set("revision-temp",formatDelta(temp?temp[0]-temp[1]:null,"°C"));
 set("revision-rain",formatDelta(totals," mm"));
 set("revision-gust",formatDelta(peaks," km/h",0));
 set("revision-window","Next "+common.length+" matching hours · selected temperature hour "+
  chosen.t.slice(5).replace("T"," ")+" local");
 set("revision-baseline","Previous retrieval "+datestr(previous.at)+" · Latest "+datestr(latest.at));
 set("revision-status","These differences are model revisions. They DO NOT verify measured accuracy or predict forecast reliability.");
}
function append(detail){
 const next=snapshot(detail);if(!next)return;
 const id=key(detail.location),all=saved();
 const group=all.find(x=>x.key===id);
 const retained=(group?.samples||[]).filter(x=>Number.isFinite(x?.at)&&
  Date.now()-x.at>=0&&Date.now()-x.at<MAX_AGE);
 const last=retained.at(-1);
 if(!last||next.at-last.at>=MIN_GAP)retained.push(next);
 const other=all.filter(x=>x.key!==id&&Array.isArray(x.samples));
 other.push({key:id,samples:retained.slice(-6)});
 save(other);
}
function sourceLink(loc){
 const link=$("revision-observation-link");if(!link)return;
 const near=Math.abs(+loc.lat+32.8321)<.33&&Math.abs(+loc.lon-151.3497)<.37;
 link.href=near?"https://www.bom.gov.au/products/IDN60801/IDN60801.95771.shtml":"https://www.bom.gov.au/places/";
 link.textContent=near?"Open Cessnock Airport Observations ↗":"Find Official BOM Station Observations ↗";
}
window.addEventListener("skypulse:watch-changed",()=>{
 location=null;current=null;clearValues();set("revision-status","Loading the selected location's model forecast…");
});
window.addEventListener("skypulse:forecast-loaded",event=>{
 const data=event.detail;if(!data?.location)return;
 location=data.location;current=data;sourceLink(location);
 if(!data.cached&&!data.published)append(data);
 show();
});
$("revision-clear")?.addEventListener("click",()=>{
 if(location)save(saved().filter(x=>x.key!==key(location)));
 current=null;clearValues();set("revision-status","This location's saved comparison history was cleared. Other preferences remain unchanged.");
});
clearValues();set("revision-status","Waiting for the first direct model forecast…");
})();