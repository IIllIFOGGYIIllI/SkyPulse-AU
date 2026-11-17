/* SkyPulse AU — Severe Weather Intelligence. Official warnings != model forecasts.
   All source failures fail closed; a missing area is never a verified all-clear. */
(function(){
"use strict";
const root=document.getElementById("severe-centre");if(!root)return;
const $=id=>document.getElementById(id);
const MAX_AGE=90*60000,TTL=15*60000;
let currentKey="",sourceSeq=0,modelSeq=0,running=false,lastCheck=0,sourceData=null,weather=null,weatherAt=0;
const sources=[
 {id:"cap",path:"rfs-alerts.json",field:"alerts"},
 {id:"incidents",path:"rfs.json",field:"features"},
 {id:"danger",path:"fdr.json",field:"districts"},
 {id:"bom",path:"bom.json",field:"warnings"}
];
const set=(id,value)=>{const el=$(id);if(el)el.textContent=value;};
const finite=n=>n!==null&&n!==undefined&&Number.isFinite(Number(n))?Number(n):null;
const context=()=>{const x=window.SkyPulseWatchContext?.();return x&&Number.isFinite(+x.latitude)&&Number.isFinite(+x.longitude)?
 {lat:+x.latitude,lon:+x.longitude,radius:Math.min(150,Math.max(10,+x.radiusKm||50)),
  name:String(x.locationName||"Selected Location"),district:String(x.fireDistrict||"")}:null;};
const key=x=>x.lat.toFixed(4)+","+x.lon.toFixed(4)+","+x.radius+","+x.district;
const date=ms=>new Intl.DateTimeFormat("en-AU",{timeZone:"Australia/Sydney",day:"numeric",month:"short",
 hour:"numeric",minute:"2-digit",hour12:true,timeZoneName:"short"}).format(ms);
const toRad=x=>x*Math.PI/180;
function km(a,b,c,d){
 const p=toRad(c-a),l=toRad(d-b),v=Math.sin(p/2)**2+Math.cos(toRad(a))*Math.cos(toRad(c))*Math.sin(l/2)**2;
 return 12742*Math.atan2(Math.sqrt(v),Math.sqrt(Math.max(0,1-v)));
}
function point(geometry){
 if(geometry?.type==="Point"&&Array.isArray(geometry.coordinates))
  return [+geometry.coordinates[1],+geometry.coordinates[0]];
 if(geometry?.type==="GeometryCollection"){
  const g=(geometry.geometries||[]).find(x=>x?.type==="Point"&&Array.isArray(x.coordinates));
  if(g)return [+g.coordinates[1],+g.coordinates[0]];
 }
 return null;
}
function ring(raw){
 if(!Array.isArray(raw)||raw.length<3||raw.length>3000)return null;
 const v=raw.map(p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(+p[0])&&Number.isFinite(+p[1])&&
  +p[0]>=-45&&+p[0]<=-8&&+p[1]>=110&&+p[1]<=155?[+p[0],+p[1]]:null);
 return v.includes(null)?null:v;
}
function inside(lat,lon,vertices){
 let yes=false;
 for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){
  const a=vertices[i],b=vertices[j];
  if(((a[0]>lat)!==(b[0]>lat))&&lon<(b[1]-a[1])*(lat-a[0])/(b[0]-a[0])+a[1])yes=!yes;
 }
 return yes;
}
function segmentDistance(lat,lon,a,b){
 const sx=111.32*Math.cos(toRad(lat)),sy=111.2;
 const ax=(a[1]-lon)*sx,ay=(a[0]-lat)*sy,bx=(b[1]-lon)*sx,by=(b[0]-lat)*sy;
 const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1)));
 return Math.hypot(ax+t*dx,ay+t*dy);
}
function overlap(alert,location){
 const shapes=(Array.isArray(alert.polygons)?alert.polygons:[]).slice(0,12);
 let near=false;
 for(const raw of shapes){
  const p=ring(raw);if(!p)continue;
  if(inside(location.lat,location.lon,p))return "inside";
  for(let i=0;i<p.length;i++)
   if(segmentDistance(location.lat,location.lon,p[i],p[(i+1)%p.length])<=location.radius)near=true;
 }
 return near?"near":null;
}
function level(alert){
 const s=String(alert?.alert_level||"");
 return ["Emergency Warning","Watch and Act","Advice"].includes(s)?s:"Unspecified";
}
const priority={ "Emergency Warning":0,"Watch and Act":1,"Advice":2,"Unspecified":3 };
function qualified(d,field){
 if(!d||d.error||!Array.isArray(d[field]))return false;
 const time=Date.parse(d.retrieved_at||""),age=Date.now()-time;
 return Number.isFinite(age)&&age>=-60000&&age<=MAX_AGE;
}
async function fetchFeed(item){
 const c=new AbortController(),timer=setTimeout(()=>c.abort(),9000);
 try{
  const res=await fetch("./data/"+item.path+"?v="+Date.now(),{signal:c.signal,cache:"no-store"});
  if(!res.ok)throw Error("HTTP "+res.status);
  const data=await res.json();
  if(!qualified(data,item.field))throw Error("Unavailable or stale");
  return {ok:true,data,checked:Date.parse(data.retrieved_at)};
 }catch(error){return {ok:false,error:String(error?.message||error)};}
 finally{clearTimeout(timer);}
}
function renderWeather(x){
 if(!weather||!Number.isFinite(weatherAt)||Date.now()-weatherAt>120*60000){
  set("severe-weather","Model signals unavailable. Verify local conditions directly.");
  set("severe-gust","—");set("severe-rain","—");set("severe-chance","—");
  return;
 }
 const h=weather.hourly||{},offset=finite(weather.utc_offset_seconds);
 if(offset===null||!Array.isArray(h.time)){
  set("severe-weather","Model times unavailable. No short-term inference.");return;
 }
 const local=new Date(Date.now()+offset*1000).toISOString().slice(0,13);
 const times=h.time.map((time,i)=>({time,i})).filter(z=>z.time.slice(0,13)>=local).slice(0,6);
 const values=field=>times.map(({i})=>finite(h[field]?.[i])).filter(v=>v!==null);
 const gust=values("wind_gusts_10m"),rain=values("precipitation"),chance=values("precipitation_probability");
 const peak=gust.length?Math.max(...gust):null,sum=rain.length===times.length?rain.reduce((a,b)=>a+b,0):null;
 const high=chance.length?Math.max(...chance):null;
 set("severe-gust",peak===null?"—":Math.round(peak)+" km/h");
 set("severe-rain",sum===null?"—":sum.toFixed(1)+" mm");
 set("severe-chance",high===null?"—":Math.round(high)+"%");
 const flags=[];
 if(peak!==null&&peak>=60)flags.push("Elevated forecast gusts");
 if(sum!==null&&sum>=20)flags.push("Elevated forecast rainfall");
 set("severe-weather",(flags.length?flags.join(" · "):"No configured model thresholds reached")+
  " · Numerical estimates, NOT official warnings or observed storms");
}
function render(x){
 if(!x||!sourceData)return;
 const cap=sourceData.cap,inc=sourceData.incidents,danger=sourceData.danger,bom=sourceData.bom;
 const valid=Object.values(sourceData).filter(z=>z.ok).length;
 set("severe-source-count",valid+"/4 verified feed snapshots");
 set("severe-location",x.name+" · "+x.radius+" km watch area");
 const recorded=Object.values(sourceData).filter(z=>z.ok).map(z=>z.checked);
 set("severe-updated",recorded.length?"Latest source retrieval "+date(Math.max(...recorded)):"Source retrieval unavailable");
 root.dataset.health=valid===4?"complete":"partial";
 const region=x.lat>=-38&&x.lat<=-28&&x.lon>=140&&x.lon<=154;
 let matched=[];
 if(cap.ok&&region){
  const alerts=cap.data.alerts.filter(a=>a.status==="Actual"&&
   !["Cancel","Error","Ack"].includes(a.message_type)&&
   (!Number.isFinite(Date.parse(a.expires||""))||Date.parse(a.expires)>=Date.now()));
  matched=alerts.map(a=>({a,scope:overlap(a,x)})).filter(z=>z.scope).sort((a,b)=>priority[level(a.a)]-priority[level(b.a)]).slice(0,6);
  set("severe-warning-label",matched.length?matched.length+" Mapped Area Match"+(matched.length===1?"":"es"):
   "No Published Polygon Match");
  set("severe-warning-detail",matched.length?
   "The selected location or monitoring radius intersects published RFS warning geometry.":
   "No match in the retrieved polygons. Warnings without polygons cannot be location-matched; this is NOT an all-clear.");
  const list=$("severe-warning-list");list.replaceChildren();
  if(matched.length)for(const {a,scope} of matched){
   const row=document.createElement("div");row.className="severe-warning-row";
   row.dataset.level=level(a);
   const title=document.createElement("strong");title.textContent=level(a)+" · "+(a.headline||a.event||"Published RFS Notice");
   const detail=document.createElement("span");detail.textContent=(scope==="inside"?"Contains selected location":"Within monitoring radius")+
    " · Issued "+(Number.isFinite(Date.parse(a.sent||""))?date(Date.parse(a.sent)):"time unavailable");
   const link=document.createElement("a");const u=String(a.web||"");
   try{const parsed=new URL(u);link.href=parsed.protocol==="https:"&&["rfs.nsw.gov.au","www.rfs.nsw.gov.au"].includes(parsed.hostname)?u:"https://www.rfs.nsw.gov.au/fire-information/alerts-and-warnings";}
   catch{link.href="https://www.rfs.nsw.gov.au/fire-information/alerts-and-warnings";}
   link.target="_blank";link.rel="noopener noreferrer";link.textContent="Read Official Warning ↗";
   row.append(title,detail,link);list.append(row);
  }
 }else{
  set("severe-warning-label",region?"RFS Feed Unavailable":"Outside NSW Coverage");
  set("severe-warning-detail",region?"Official warning areas cannot be checked; open NSW RFS.":"NSW RFS polygons must not be treated as worldwide warning coverage.");
  $("severe-warning-list").replaceChildren();
 }
 if(inc.ok&&region){
  const close=inc.data.features.filter(f=>{
   const p=point(f.geometry);
   return p&&p.every(Number.isFinite)&&km(x.lat,x.lon,p[0],p[1])<=x.radius;
  });
  set("severe-incident-count",String(close.length));
  set("severe-incidents",close.length+" published incident point"+(close.length===1?"":"s")+
   " within "+x.radius+" km. Point locations are not incident boundaries. NOT an all-clear.");
 }else{
  set("severe-incident-count","—");
  set("severe-incidents",region?"Incident feed unavailable; no nearby incident count can be verified.":"NSW RFS incident coverage does not apply worldwide.");
 }
 if(danger.ok&&region){
  const requested=x.district||((x.lat>=-33.25&&x.lat<=-32.1&&x.lon>=150.7&&x.lon<=152.0)?"Greater Hunter":"");
  const d=danger.data.districts.find(z=>z.name===requested);
  set("severe-fire-danger",d?String(d.rating_today||"Not Issued"):"District Not Selected");
  set("severe-fire-ban",d?(d.ban_today===true?"TOTAL FIRE BAN":d.ban_today===false?"No Total Fire Ban Listed":"Ban Status Unverified"):"Verify District at RFS");
  set("severe-fire-note",d?"Official RFS district: "+d.name+" · retrieved "+date(danger.checked):
   "The app cannot reliably infer your official fire weather district. Select it on NSW Hazards.");
 }else{
  set("severe-fire-danger","—");set("severe-fire-ban","Unverified");
  set("severe-fire-note",region?"Fire danger snapshot unavailable or stale.":"Outside NSW Fire Danger coverage.");
 }
 set("severe-bom-status",bom.ok?
  bom.data.warnings.length+" statewide NSW/ACT published notice"+(bom.data.warnings.length===1?"":"s")+
    " · Not necessarily relevant to this location":
  "BOM warning feed unavailable or stale · Check official warnings");
 set("severe-notice",valid<4?
  "Some official feeds are unavailable or stale. No feed failure implies that the area is safe. Use the official RFS and BOM websites.":
  "All four source snapshots were retrieved recently. This does NOT verify that every current warning is represented.");
 renderWeather(x);
}
async function refresh(force){
 const x=context();if(!x||running)return;
 const k=key(x);
 if(!force&&k===currentKey&&Date.now()-lastCheck<TTL){render(x);return;}
 currentKey=k;const seq=++sourceSeq;running=true;
 set("severe-source-count","Checking official source snapshots…");
 if($("severe-refresh"))$("severe-refresh").disabled=true;
 try{
  const results=await Promise.all(sources.map(fetchFeed));
  if(seq!==sourceSeq||!context()||key(context())!==k)return;
  sourceData=Object.fromEntries(sources.map((s,i)=>[s.id,results[i]]));
  lastCheck=Date.now();render(x);
 }finally{running=false;if($("severe-refresh"))$("severe-refresh").disabled=false;}
}
async function modelHazards(){
 const x=context();if(!x)return;
 const k=key(x),seq=++modelSeq,c=new AbortController(),timer=setTimeout(()=>c.abort(),14000);
 try{
  const q=new URLSearchParams({latitude:String(x.lat),longitude:String(x.lon),timezone:"auto",
   hourly:"wind_gusts_10m,precipitation,precipitation_probability",forecast_hours:"24"});
  const response=await fetch("https://api.open-meteo.com/v1/forecast?"+q,{cache:"no-store",signal:c.signal});
  if(!response.ok)throw Error("HTTP "+response.status);
  const data=await response.json();
  if(seq!==modelSeq||!context()||key(context())!==k)return;
  if(!data?.hourly?.time||!Number.isFinite(+data.utc_offset_seconds))throw Error("Invalid model response");
  weather=data;weatherAt=Date.now();
 }catch{if(seq===modelSeq){weather=null;weatherAt=0;}}
 finally{clearTimeout(timer);if(seq===modelSeq)render(context());}
}
function update(force){
 const x=context();if(!x)return;
 if(key(x)!==currentKey){sourceData=null;weather=null;lastCheck=0;currentKey="";sourceSeq++;modelSeq++;running=false;}
 refresh(force);
 modelHazards();
}
$("severe-refresh")?.addEventListener("click",()=>update(true));
window.addEventListener("skypulse:watch-changed",()=>update(true));
window.addEventListener("skypulse:forecast-loaded",event=>{
 const x=context(),d=event.detail;
 if(x&&d?.data&&d?.location&&Math.abs(+d.location.lat-x.lat)<.0001&&Math.abs(+d.location.lon-x.lon)<.0001){
  weather=d.data;weatherAt=Number(d.checkedAt)||0;render(x);
 }
});
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")update(false);});
setInterval(()=>{if(document.visibilityState==="visible")update(false);},TTL);
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>update(true),{once:true});
else update(true);
})();