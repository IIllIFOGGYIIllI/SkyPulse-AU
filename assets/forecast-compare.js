/* SkyPulse AU: NOAA GFS versus ECMWF IFS. Both are numerical forecasts, not measurements. */
(function(){
"use strict";
if(!document.getElementById("forecast-model-comparison"))return;
const $=id=>document.getElementById(id),MODELS=[
 {id:"ecmwf",url:"https://api.open-meteo.com/v1/ecmwf"},
 {id:"gfs",url:"https://api.open-meteo.com/v1/gfs"}
];
let sequence=0,working=false,lastKey="",lastCheck=0;
const set=(id,value)=>{if($(id))$(id).textContent=value;};
function location(){
 const v=window.SkyPulseWatchContext?.();
 return v&&Number.isFinite(+v.latitude)&&Number.isFinite(+v.longitude)?
  {lat:+v.latitude,lon:+v.longitude,name:String(v.locationName||"Selected Location")}:null;
}
const key=l=>l.lat.toFixed(4)+":"+l.lon.toFixed(4);
const finite=n=>n!==null&&n!==undefined&&Number.isFinite(+n)?+n:null;
const fmt=(n,unit,d=0)=>n==null?"—":n.toFixed(d)+unit;
function reset(){
 for(const model of MODELS)for(const type of ["status","temp","rain","gust"])
  set("compare-"+model.id+"-"+type,type==="status"?"CHECKING":"—");
 for(const type of ["temp","rain","gust"])set("compare-"+type+"-spread","—");
 set("compare-summary","Checking independent model data…");
}
function read(data){
 const h=data?.hourly;
 if(!h||!Array.isArray(h.time)||!Number.isFinite(+data.utc_offset_seconds))
  throw Error("Invalid model data");
 for(const field of ["temperature_2m","precipitation","wind_gusts_10m"]){
  if(!Array.isArray(h[field])||h[field].length!==h.time.length)throw Error("Missing "+field);
 }
 const localNow=new Date(Date.now()+Number(data.utc_offset_seconds)*1000).toISOString().slice(0,13);
 const rows=new Map();
 for(let i=0;i<h.time.length;i++){
  const t=h.time[i],temp=finite(h.temperature_2m[i]),rain=finite(h.precipitation[i]),gust=finite(h.wind_gusts_10m[i]);
  if(typeof t==="string"&&t.slice(0,13)>=localNow&&temp!==null&&rain!==null&&rain>=0&&gust!==null&&gust>=0)
   rows.set(t,{temp,rain,gust});
 }
 if(rows.size<12)throw Error("Insufficient valid upcoming model hours");
 return rows;
}
async function load(model,loc){
 const params=new URLSearchParams({latitude:String(loc.lat),longitude:String(loc.lon),
  hourly:"temperature_2m,precipitation,wind_gusts_10m",timezone:"auto",forecast_hours:"48"});
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),15000);
 try{const res=await fetch(model.url+"?"+params,{cache:"no-store",signal:ctrl.signal});
  if(!res.ok)throw Error("Weather model HTTP "+res.status);return read(await res.json());
 }finally{clearTimeout(timer);}
}
const stats=values=>({
 low:Math.min(...values.map(x=>x.temp)),
 high:Math.max(...values.map(x=>x.temp)),
 rain:values.reduce((n,x)=>n+x.rain,0),
 gust:Math.max(...values.map(x=>x.gust))
});
async function publishedModelPair(loc){
 const dx=(loc.lat+32.8321)*111,dy=(loc.lon-151.3497)*93.7;
 const distance=Math.hypot(dx,dy);
 if(!Number.isFinite(distance)||distance>15)return null;
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),9000);
 try{
  const response=await fetch("./data/weather-cessnock.json?models="+Date.now(),{cache:"no-store",signal:ctrl.signal});
  if(!response.ok)throw Error("Snapshot HTTP "+response.status);
  const data=await response.json(),checkedAt=Date.parse(data.models_retrieved_at||"");
  const age=Date.now()-checkedAt;
  if(data.location!=="Cessnock"||!Number.isFinite(age)||age<0||age>18*60*60*1000)throw Error("Snapshot too old");
  const values=MODELS.map(model=>read(data.models?.[model.id]));
  return {result:values.map(value=>({status:"fulfilled",value})),checkedAt,distanceKm:distance};
 }catch{return null;}finally{clearTimeout(timer);}
}
function paint(result,loc,published){
 let available=0;
 MODELS.forEach((model,i)=>{
  if(result[i].status!=="fulfilled"){
   set("compare-"+model.id+"-status","UNAVAILABLE");return;
  }
  available++;
  const s=stats(Array.from(result[i].value.values()).slice(0,24));
  set("compare-"+model.id+"-status",published?"REFERENCE SNAPSHOT":"MODEL AVAILABLE");
  set("compare-"+model.id+"-temp",fmt(s.low,"°C")+" to "+fmt(s.high,"°C"));
  set("compare-"+model.id+"-rain",fmt(s.rain," mm",1));
  set("compare-"+model.id+"-gust",fmt(s.gust," km/h"));
 });
 if(available!==2){
  set("compare-summary","One or both model services are unavailable. Model spread is not calculated; the primary forecast remains separate.");
  return;
 }
 const a=result[0].value,b=result[1].value,times=Array.from(a.keys()).filter(t=>b.has(t)).slice(0,24);
 if(times.length<12){
  set("compare-summary","Not enough matching forecast hours. No model comparison is shown.");return;
 }
 const first=stats(times.map(t=>a.get(t))),second=stats(times.map(t=>b.get(t)));
 const t=times[Math.min(5,times.length-1)];
 set("compare-temp-spread",fmt(Math.abs(a.get(t).temp-b.get(t).temp),"°C",1));
 set("compare-rain-spread",fmt(Math.abs(first.rain-second.rain)," mm",1));
 set("compare-gust-spread",fmt(Math.abs(first.gust-second.gust)," km/h"));
 set("compare-summary",(published?"Using older Cessnock reference model "+Math.round(published.distanceKm)+" km from selected location because direct requests failed; these values are NOT live. ":"")+"Compared "+times.length+" matching forecast hours for "+loc.name+
  ". Temperature difference is at the sixth common hour; rainfall and gust differences cover the same forecast window. Model spread is NOT a probability of accuracy.");
}
async function refresh(force){
 const loc=location();if(!loc||working)return;
 if(!force&&key(loc)===lastKey&&Date.now()-lastCheck<30*60*1000)return;
 const id=++sequence;working=true;reset();lastKey=key(loc);
 set("compare-location",loc.name);
 if($("compare-refresh"))$("compare-refresh").disabled=true;
 try{
  let result=await Promise.allSettled(MODELS.map(model=>load(model,loc)));
  if(id!==sequence||!location()||key(location())!==key(loc))return;
  const backup=result.some(r=>r.status!=="fulfilled")?await publishedModelPair(loc):null;
  if(id!==sequence||!location()||key(location())!==key(loc))return;
  if(backup)result=backup.result;
  lastCheck=Date.now();
  paint(result,loc,backup);
  set("compare-checked-at",new Intl.DateTimeFormat("en-AU",{timeZone:"Australia/Sydney",hour:"numeric",
   minute:"2-digit",hour12:true,timeZoneName:"short"}).format(backup?.checkedAt||lastCheck));
 }finally{if(id===sequence){working=false;if($("compare-refresh"))$("compare-refresh").disabled=false;}}
}
$("compare-refresh")?.addEventListener("click",()=>refresh(true));
window.addEventListener("skypulse:watch-changed",()=>{sequence++;working=false;lastCheck=0;lastKey="";refresh(true);});
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")refresh(false);});
setInterval(()=>{if(document.visibilityState==="visible")refresh(false);},30*60*1000);
reset();
if(document.readyState!=="complete")document.addEventListener("DOMContentLoaded",()=>refresh(true),{once:true});
else refresh(true);
})();