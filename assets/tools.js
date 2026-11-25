/* SkyPulse AU extended tools. Model data only; no hidden provider calls. */
(function(){
"use strict";
const finite=v=>typeof v==="number"&&Number.isFinite(v);
const locOK=l=>l&&typeof l.name==="string"&&l.name.length>0&&finite(l.lat)&&finite(l.lon)&&Math.abs(l.lat)<=90&&Math.abs(l.lon)<=180;
const key=l=>l.lat.toFixed(4)+":"+l.lon.toFixed(4);
const memberRange=values=>{const a=values.filter(finite);return a.length?{min:Math.min(...a),max:Math.max(...a),count:a.length}:null;};
const activityMatch=(h,i,r)=>["temperature_2m","precipitation_probability","wind_gusts_10m","is_day"].every(k=>finite(h[k]?.[i]))&&h.is_day[i]===1&&h.temperature_2m[i]>=r.min&&h.temperature_2m[i]<=r.max&&h.precipitation_probability[i]<=r.rain&&h.wind_gusts_10m[i]<=r.gust;
const cacheAge=(record,now,max)=>record&&finite(record.at)&&now>=record.at&&now-record.at<=max;
if(typeof module!=="undefined"&&module.exports){module.exports={finite,locOK,key,memberRange,activityMatch,cacheAge};return;}
const $=id=>document.getElementById(id), page=document.body.dataset.tool;
const def={name:"Cessnock",region:"New South Wales",lat:-32.8321,lon:151.3497};
const get=(k,d)=>{try{return JSON.parse(localStorage.getItem(k)||"null")??d;}catch{return d;}};
const put=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true;}catch{return false;}};
const prefs=()=>get("skypulse.preferences",{});
const current=()=>locOK(prefs().location)?prefs().location:def;
const favKey="skypulse.tools.favorites.v1", cacheKey="skypulse.tools.cache.v1", limitKey="skypulse.tools.cooldown.v1";
const favorites=()=>{const a=get(favKey,[]);return Array.isArray(a)?a.filter(locOK).slice(0,5):[];};
let list=[],selected="",busy=false,map=null,markers=null,grid=null;
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=String(text);if(cls)n.className=cls;return n;};
const stat=s=>{if($("tool-status"))$("tool-status").textContent=s;};
const out=()=>$("tool-results");
const format=(v,d=1)=>finite(v)?v.toFixed(d):"—";
const stamp=n=>new Date(n).toLocaleString("en-AU");
const themes=()=>{document.documentElement.dataset.theme=prefs().theme==="light"?"light":"dark";};
themes();
$("tool-theme")?.addEventListener("click",()=>{const p=prefs();p.theme=p.theme==="light"?"dark":"light";if(!put("skypulse.preferences",p))stat("Could not save theme on this device.");themes();});
document.querySelectorAll(".tool-nav-item").forEach(a=>{if(a.getAttribute("href")==="./"+page+".html")a.setAttribute("aria-current","page");});
function redrawLocations(){
 const c=current();list=[c,...favorites().filter(l=>key(l)!==key(c))];const control=$("tool-location");if(!control)return;
 const prev=selected||control.value;control.replaceChildren();
 for(const l of list){const option=el("option",l.name+(key(l)===key(c)?" (Current)":""));option.value=key(l);control.append(option);}
 control.value=list.some(l=>key(l)===prev)?prev:key(c);selected=control.value;
}
redrawLocations();
$("tool-location")?.addEventListener("change",()=>{selected=$("tool-location").value;grid=null;markers?.clearLayers();out()?.replaceChildren();stat("Location changed. Load data for this location.");});
const location=()=>list.find(l=>key(l)===selected)||current();
const url=(host,path,loc,params)=>"https://"+host+path+"?"+new URLSearchParams({latitude:loc.lat,longitude:loc.lon,...params});
const forecast=(loc,params)=>url("api.open-meteo.com","/v1/forecast",loc,{timezone:"auto",...params});
function cacheStore(u,data){let records=get(cacheKey,[]);if(!Array.isArray(records))records=[];records=records.filter(r=>r&&r.url!==u).slice(0,11);records.unshift({url:u,at:Date.now(),data});put(cacheKey,records);}
async function network(u,ttl=15*60000,fallback=2*3600000){
 const records=get(cacheKey,[]),record=Array.isArray(records)?records.find(r=>r?.url===u):null,now=Date.now();
 if(cacheAge(record,now,ttl))return {data:record.data,at:record.at,cached:true};
 const host=new URL(u).hostname,limits=get(limitKey,{});
 try{
  if(finite(limits[host])&&limits[host]>now)throw Error("Provider cooldown after HTTP 429");
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12000);
  try{
   const res=await fetch(u,{signal:ctl.signal,cache:"no-store"});
   if(res.status===429){const retry=Number(res.headers.get("Retry-After"));limits[host]=Date.now()+Math.max(15*60000,Number.isFinite(retry)?retry*1000:0);put(limitKey,limits);throw Error("Provider rate limit (HTTP 429)");}
   if(!res.ok)throw Error("HTTP "+res.status);
   const data=await res.json();if(!data||data.error)throw Error("Invalid provider response");
   cacheStore(u,data);return {data,at:Date.now(),cached:false};
  }finally{clearTimeout(timer);}
 }catch(e){if(cacheAge(record,now,fallback))return {data:record.data,at:record.at,cached:true,failed:true};throw e;}
}
function label(result,source){stat(source+" · "+(result.cached?(result.failed?"Saved data; refresh failed":"Saved data; not a new retrieval"):"Retrieved")+" · "+stamp(result.at));}
function table(headers,rows){
 const wrap=el("div",null,"tool-table-wrap"),t=el("table",null,"tool-table"),head=el("thead"),tr=el("tr");
 headers.forEach(h=>{const th=el("th",h);th.scope="col";tr.append(th);});head.append(tr);t.append(head);const body=el("tbody");
 rows.forEach(row=>{const r=el("tr");row.forEach(v=>r.append(el("td",v)));body.append(r);});t.append(body);wrap.append(t);out().append(wrap);
}
function stats(items){const wrap=el("div",null,"tool-summary");for(const [title,value] of items){const c=el("div",null,"tool-stat");c.append(el("span",title),el("strong",value));wrap.append(c);}out().append(wrap);}
function times(data,part="hourly"){const h=data?.[part];if(!Array.isArray(h?.time)||!h.time.length)throw Error("Requested model data unavailable");return h;}
function tz(data){return data.timezone_abbreviation||data.timezone||"provider time";}
function hour(t){return String(t).replace("T"," ");}
function has(h,k,i){return h[k]?.[i];}
function rows(h,keys,n=h.time.length){return h.time.slice(0,n).map((t,i)=>[hour(t),...keys.map(k=>format(has(h,k,i)))]);}
function chart(values,caption){
 const valid=values.filter(finite);if(!valid.length)return;const min=Math.min(...valid),max=Math.max(...valid),span=Math.max(1,max-min);
 const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox","0 0 600 160");svg.setAttribute("role","img");svg.setAttribute("aria-label",caption);svg.setAttribute("class","tool-chart");
 let d="",start=true;values.forEach((v,i)=>{if(!finite(v)){start=true;return;}d+=(start?"M":"L")+(12+i*576/Math.max(1,values.length-1)).toFixed(1)+","+(148-(v-min)*136/span).toFixed(1)+" ";start=false;});const p=document.createElementNS(svg.namespaceURI,"path");p.setAttribute("d",d);p.setAttribute("stroke","currentColor");p.setAttribute("stroke-width","3");p.setAttribute("fill","none");svg.append(p);out().append(svg,el("p",caption,"muted"));
}
async function extended(){
 const loc=location(),r=await network(forecast(loc,{daily:"temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max",forecast_days:14}));const d=times(r.data,"daily");
 chart(d.temperature_2m_max||[],"Daily maximum model temperature · "+loc.name);
 table(["Date","Min °C","Max °C","Rain mm","Peak rain chance %","Gust km/h"],rows(d,["temperature_2m_min","temperature_2m_max","precipitation_sum","precipitation_probability_max","wind_gusts_10m_max"],14));label(r,"Open-Meteo Best Match · "+loc.name+" · "+tz(r.data)+" · Later days generally more uncertain");
}
async function ensemble(){
 const loc=location(),r=await network(url("ensemble-api.open-meteo.com","/v1/ensemble",loc,{hourly:"temperature_2m",models:"gfs025",forecast_days:3,timezone:"auto"}),60*60000,6*3600000);
 const h=times(r.data),members=Object.keys(h).filter(k=>/^temperature_2m_member\d+/.test(k)&&Array.isArray(h[k]));
 if(!members.length)throw Error("No individual ensemble members returned");
 const all=h.time.slice(0,72).map((t,i)=>{const s=memberRange(members.map(k=>h[k][i]));return [hour(t),format(s?.min),format(s?.max),s?.count??0];});
 table(["Local valid time","Member min °C","Member max °C","Available members"],all);label(r,"Open-Meteo · NOAA GFS ensemble · "+loc.name+" · "+tz(r.data)+" · Range of available members, not measured accuracy");
}
const layers={temperature_2m:["Temperature","°C"],wind_speed_10m:["Wind","km/h"],precipitation:["Hourly precipitation","mm"],pressure_msl:["Pressure","hPa"],cloud_cover:["Cloud cover","%"],relative_humidity_2m:["Humidity","%"]};
function renderGrid(){
 if(!grid)return;out().replaceChildren();const field=$("map-metric").value,index=Number($("map-hour").value),[name,unit]=layers[field];const result=[];
 grid.data.forEach((d,i)=>{const h=d.hourly,point=grid.points[i],v=h?.[field]?.[index],dir=h?.wind_direction_10m?.[index];result.push([point.lat.toFixed(2),point.lon.toFixed(2),hour(h?.time?.[index]||"Unavailable"),format(v),field==="wind_speed_10m"?format(dir,0):"—"]);
 if(map&&finite(v)){
 const chip=el("div",null,"tool-map-chip");if(field==="wind_speed_10m"&&finite(dir)){const arrow=el("span","↑","tool-map-arrow");arrow.style.transform="rotate("+((dir+180)%360)+"deg)";chip.append(arrow);}chip.append(document.createTextNode(format(v,0)+" "+unit));
 const marker=L.marker([point.lat,point.lon],{icon:L.divIcon({className:"tool-map-marker",html:chip,iconSize:[86,28],iconAnchor:[43,14]})});marker.bindTooltip(name+" · "+format(v)+" "+unit);marker.addTo(markers);
 }});
 table(["Latitude","Longitude","Valid time UTC",name+" "+unit,"Wind from °"],result);
 label(grid.result,"Open-Meteo · "+grid.loc.name+" · Sampled model grid, not radar");
}
async function weatherMap(){
 const loc=location(),points=[];for(const dy of [-.5,0,.5])for(const dx of [-.5,0,.5]){const lat=loc.lat+dy,lon=loc.lon+dx;if(Math.abs(lat)<=90&&Math.abs(lon)<=180)points.push({lat,lon});}
 const u="https://api.open-meteo.com/v1/forecast?"+new URLSearchParams({latitude:points.map(p=>p.lat.toFixed(4)).join(","),longitude:points.map(p=>p.lon.toFixed(4)).join(","),hourly:Object.keys(layers).concat("wind_direction_10m").join(","),forecast_hours:"24",timezone:"GMT"});
 const r=await network(u,30*60000,2*3600000),data=Array.isArray(r.data)?r.data:[r.data];if(data.length!==points.length)throw Error("Regional grid response incomplete");data.forEach(d=>times(d));
 grid={data,points,loc,result:r};if(typeof L!=="undefined"){if(!map){map=L.map("tool-map",{scrollWheelZoom:false});L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:"© OpenStreetMap contributors"}).addTo(map);markers=L.layerGroup().addTo(map);}markers.clearLayers();map.setView([loc.lat,loc.lon],8);}else $("tool-map").textContent="Map library unavailable; model samples are available in the table.";
 renderGrid();
}
["map-metric","map-hour"].forEach(id=>$(id)?.addEventListener("change",()=>{markers?.clearLayers();renderGrid();}));
async function air(){
 const loc=location(),keys=["pm2_5","pm10","ozone","nitrogen_dioxide","sulphur_dioxide","carbon_monoxide"],r=await network(url("air-quality-api.open-meteo.com","/v1/air-quality",loc,{hourly:keys.join(","),forecast_hours:24,timezone:"auto"}),30*60000,3*3600000),h=times(r.data);
 table(["Local time",...keys.map(k=>k.replaceAll("_"," ")+" µg/m³")],rows(h,keys,24));chart(h.pm2_5||[],"Modelled PM2.5 hourly concentration · µg/m³");label(r,"Open-Meteo · Copernicus Atmosphere Monitoring Service (CAMS) · "+loc.name+" · "+tz(r.data));
}
function value(id){const e=$(id);if(!e||e.value.trim()===""||!e.checkValidity())throw Error("Check "+id.replaceAll("-"," ")+" input");return Number(e.value);}
async function marine(){
 if(!$("marine-confirm").checked)throw Error("Confirm a water coordinate first");
 const loc={lat:value("marine-lat"),lon:value("marine-lon")},keys=["wave_height","wave_direction","wave_period","swell_wave_height","swell_wave_direction","sea_surface_temperature","ocean_current_velocity","ocean_current_direction"],r=await network(url("marine-api.open-meteo.com","/v1/marine",loc,{hourly:keys.join(","),forecast_days:3,timezone:"auto",cell_selection:"sea"}),30*60000,3*3600000),h=times(r.data);
 table(["Local time","Wave m","Wave from °","Period s","Swell m","Swell from °","Sea °C","Current km/h","Current °"],rows(h,keys,72));label(r,"Open-Meteo marine models · Requested "+loc.lat+", "+loc.lon+" · model cell "+r.data.latitude+", "+r.data.longitude+" · "+tz(r.data)+" · Not navigation advice");
}
async function history(){
 const loc=location(),days=Number($("history-days").value),end=new Date(Date.now()-7*86400000),start=new Date(end.getTime()-(days-1)*86400000),date=d=>d.toISOString().slice(0,10),keys=["temperature_2m_min","temperature_2m_max","precipitation_sum"],r=await network(url("archive-api.open-meteo.com","/v1/archive",loc,{start_date:date(start),end_date:date(end),daily:keys.join(","),timezone:"auto"}),24*3600000,7*86400000),d=times(r.data,"daily");
 const rain=(d.precipitation_sum||[]).filter(finite),high=(d.temperature_2m_max||[]).filter(finite),low=(d.temperature_2m_min||[]).filter(finite);
 stats([["Period rain · available days",rain.length?format(rain.reduce((a,b)=>a+b,0))+" mm":"—"],["Highest daily maximum",high.length?format(Math.max(...high))+" °C":"—"],["Lowest daily minimum",low.length?format(Math.min(...low))+" °C":"—"],["Rainfall coverage",rain.length+" / "+days+" days"]]);
 chart(d.temperature_2m_max||[],"Reanalysis daily maximum temperature");table(["Date","Min °C","Max °C","Rain mm"],rows(d,keys));label(r,"Open-Meteo · reanalysis (not station records) · "+loc.name+" · "+tz(r.data));
}
async function activity(){
 const loc=location(),rul={min:value("activity-min"),max:value("activity-max"),rain:value("activity-rain"),gust:value("activity-gust")};if(rul.min>rul.max)throw Error("Minimum temperature must not exceed maximum");
 const keys=["temperature_2m","precipitation_probability","wind_gusts_10m","is_day"],r=await network(forecast(loc,{hourly:keys.join(","),forecast_hours:48})),h=times(r.data);
 const now=Date.now(),offset=Number(r.data.utc_offset_seconds);if(!Number.isFinite(offset))throw Error("Forecast timezone missing");const upcoming=h.time.map((t,i)=>({t,i})).filter(x=>Date.parse(x.t+":00Z")-offset*1000>=now-3600000);
 const matching=upcoming.filter(x=>activityMatch(h,x.i,rul));stats([["Matching daylight hours",matching.length+" / "+upcoming.length]]);if(matching.length)table(["Local time","Temperature °C","Rain chance %","Gust km/h"],matching.map(({t,i})=>[hour(t),...keys.slice(0,3).map(k=>format(h[k][i]))]));else out().append(el("p","No matching hours in the available model forecast. This is not a warning or safety assessment."));
 label(r,"Open-Meteo · "+loc.name+" · "+tz(r.data)+" · Personal thresholds only");
}
function saveFavorite(l){if(!locOK(l))throw Error("Invalid location");const f=favorites();if(f.some(x=>key(x)===key(l))){stat("This location is already saved.");return;}if(f.length>=5)throw Error("Five saved locations maximum; remove one first");if(!put(favKey,[...f,l]))throw Error("Browser storage unavailable");selected=key(l);redrawLocations();stat(l.name+" saved on this device.");}
function action(fn){try{fn();}catch(e){stat(e.message||"Action failed");}}
$("favorite-current")?.addEventListener("click",()=>action(()=>saveFavorite(location())));
$("favorite-add")?.addEventListener("click",()=>action(()=>{const name=$("favorite-name").value.trim();saveFavorite({name,region:"Saved coordinates",lat:value("favorite-lat"),lon:value("favorite-lon")});}));
$("favorite-remove")?.addEventListener("click",()=>action(()=>{const l=location(),f=favorites();if(!f.some(x=>key(x)===key(l)))throw Error("This is not a saved favorite");if(!put(favKey,f.filter(x=>key(x)!==key(l))))throw Error("Storage unavailable");selected="";redrawLocations();stat("Saved location removed.");}));
$("favorite-activate")?.addEventListener("click",()=>action(()=>{const p=prefs();p.location=location();if(!put("skypulse.preferences",p))throw Error("Storage unavailable");window.location.href="./";}));
async function compare(){
 const locs=favorites();if(!locs.length)throw Error("Save a location first");const u="https://api.open-meteo.com/v1/forecast?"+new URLSearchParams({latitude:locs.map(l=>l.lat).join(","),longitude:locs.map(l=>l.lon).join(","),current:"temperature_2m,apparent_temperature,wind_speed_10m,precipitation",timezone:"auto"}),r=await network(u),data=Array.isArray(r.data)?r.data:[r.data];
 if(data.length!==locs.length)throw Error("Location comparison response incomplete");
 table(["Location","Valid local time","Temperature °C","Feels like °C","Wind km/h","Model interval rain mm"],locs.map((l,i)=>{const c=data[i]?.current;return [l.name,hour(c?.time||"Unavailable"),...["temperature_2m","apparent_temperature","wind_speed_10m","precipitation"].map(k=>format(c?.[k]))];}));label(r,"Open-Meteo · Location-specific model estimates, not observations");
}
async function status(){
 const feeds=[["NSW RFS Incidents","rfs.json","features"],["Fire Danger and Bans","fdr.json","districts"],["RFS CAP Warnings","rfs-alerts.json","alerts"],["BOM RSS","bom.json","warnings"],["WMO Publication Index","wmo-bom.json","entries"]];
 async function json(path){const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),9000);try{const r=await fetch(path,{signal:ctrl.signal,cache:"no-store"});if(!r.ok)throw Error("HTTP "+r.status);return await r.json();}finally{clearTimeout(timer);}}
 const data=await Promise.allSettled([json("./app-version.json"),...feeds.map(f=>json("./data/"+f[1]))]);const v=data[0].status==="fulfilled"?data[0].value:null;
 stats([["Published release",v?.version||"Unverified"],["Published at",v?.deployed_at?stamp(Date.parse(v.deployed_at)):"—"],["Connection",navigator.onLine?"Online":"Offline"]]);
 table(["Source","Snapshot state","Retrieved","Age"],feeds.map((f,i)=>{const d=data[i+1].status==="fulfilled"?data[i+1].value:null,t=Date.parse(d?.retrieved_at),age=Date.now()-t,ok=d&&!d.error&&Array.isArray(d[f[2]])&&Number.isFinite(t)&&age>=-60000;return [f[0],!ok?"Unavailable":age>180*60000?"Stale":age>90*60000?"Delayed":"Recent",ok?stamp(t):"—",ok?Math.max(0,Math.round(age/60000))+" min":"—"];}));stat("Checked "+stamp(Date.now())+" · Availability is not evidence of safety. Check official authorities.");
}
const tasks={"intelligence":extended,"weather-maps":weatherMap,"air-quality":air,"marine":marine,"history":history,"activities":activity,"locations":compare,"status":status};
async function run(fn){
 if(busy||!fn)return;busy=true;out()?.replaceChildren();if(page==="weather-maps"){grid=null;markers?.clearLayers();}const controls=[...document.querySelectorAll(".tool-panel button,.tool-panel select,.tool-panel input")];const prev=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);stat("Loading requested data…");
 try{await fn();}catch(e){out()?.replaceChildren();stat("Unavailable · "+(e?.message||"Provider request failed")+". No values have been invented.");}
 finally{controls.forEach((c,i)=>c.disabled=prev[i]);busy=false;}
}
$("tool-load")?.addEventListener("click",()=>run(tasks[page]));$("tool-ensemble")?.addEventListener("click",()=>run(ensemble));
})();
