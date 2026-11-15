/* SkyPulse AU — non-commercial, independent information experience. */
(function(){
"use strict";
var $=function(id){return document.getElementById(id);};
var DEFAULT={name:"Cessnock",region:"New South Wales",lat:-32.8321,lon:151.3497};
var stored={};try{stored=JSON.parse(localStorage.getItem("skypulse.preferences")||"{}");}catch(e){}
var state={location:stored.location||DEFAULT,radius:Number(stored.radius)||50,theme:stored.theme||"dark",notify:!!stored.notify,weather:null,map:null,markers:null,radarLayer:null,peekMap:null,peekLayer:null,radarFrames:[],radarHost:"",radarEnabled:true,incidentsEnabled:true,radarTimer:null,baseLayer:null,locationMarker:null,mapTileFailures:0,mapNearbyOnly:true,mapWheelZoom:false,radarOpacity:.6,gpsMarker:null,gpsAccuracy:null,mapStatusTimer:null,fireDanger:null,fireDistrict:stored.fireDistrict||"",rfsAlerts:[],warningLayer:null,warningsEnabled:true,incidents:[],lastIncidentFetch:null,seen:stored.seen||null,weatherError:false};
var DATA_MAX_AGE=90*60*1000;
function save(){try{localStorage.setItem("skypulse.preferences",JSON.stringify({location:state.location,radius:state.radius,theme:state.theme,notify:state.notify,seen:state.seen,fireDistrict:state.fireDistrict}));}catch(e){}}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];});}
function num(n,d){return typeof n==="number"&&Number.isFinite(n)?n.toFixed(d||0):"—";}
function message(text){var t=$("toast");t.textContent=text;t.hidden=false;clearTimeout(message.timer);message.timer=setTimeout(function(){t.hidden=true;},4500);}
function formatDate(d,opt){try{return new Intl.DateTimeFormat("en-AU",opt).format(new Date(d));}catch(e){return "—";}}
function relTime(value){var delta=Math.max(0,Date.now()-new Date(value).getTime()),mins=Math.round(delta/60000);if(!Number.isFinite(mins))return "unknown";return mins<2?"just now":mins<60?mins+" min ago":Math.round(mins/60)+" h ago";}
function validUrl(s){try{var u=new URL(s);return u.protocol==="https:"?u.href:null;}catch(e){return null;}}
function weatherMeta(code,isDay){var c=Number(code);if(c===0)return ["Clear sky",isDay?"☀️":"🌙"];if(c<=2)return ["Partly cloudy",isDay?"🌤️":"☁️"];if(c===3)return ["Overcast","☁️"];if(c<=48)return ["Foggy","🌫️"];if(c<=57)return ["Drizzle","🌦️"];if(c<=67)return ["Rain","🌧️"];if(c<=77)return ["Snow","🌨️"];if(c<=82)return ["Rain showers","🌦️"];if(c<=86)return ["Snow showers","🌨️"];if(c>=95)return ["Thunderstorms","⛈️"];return ["Variable conditions","🌤️"];}
function setText(id,s){$(id).textContent=s;}
function theme(){document.documentElement.dataset.theme=state.theme;setText("theme-name",state.theme==="dark"?"Dark":"Light");$("theme-button").textContent=state.theme==="dark"?"☀":"◐";}
function updateLocationUI(){var l=state.location;setText("heading-location",l.name);setText("settings-location",l.name+(l.region?", "+l.region:""));setText("incident-range","Within "+state.radius+" km of "+l.name);$("location-input").value=l.name;setText("radius-label",state.radius+" km");$("radius").value=state.radius;updateOfficialStation();if(state.fireDanger)renderFireDanger();}
async function getJSON(url,timeout){var c=new AbortController(),tm=setTimeout(function(){c.abort();},timeout||13000);try{var r=await fetch(url,{signal:c.signal,cache:"no-store"});if(!r.ok)throw Error("HTTP "+r.status);return await r.json();}finally{clearTimeout(tm);}}
function updateWeatherStatus(text,error){$("weather-status").innerHTML='<span class="pulse-dot" style="'+(error?"background:var(--red)":"")+'"></span>'+esc(text);}
function createChart(hours,values){var nums=values.filter(function(v){return typeof v==="number";});if(!nums.length)return;var min=Math.floor(Math.min.apply(null,nums)-2),max=Math.ceil(Math.max.apply(null,nums)+2),points=values.map(function(v,i){return [18+i*(562/(values.length-1||1)),164-((v-min)/(max-min||1))*140];}),path=points.map(function(p,i){return (i?"L":"M")+p[0].toFixed(1)+","+p[1].toFixed(1);}).join(" "),area=path+" L580,175 L18,175 Z";$("temp-chart").innerHTML='<svg role="img" aria-label="Temperature forecast chart" viewBox="0 0 600 185" preserveAspectRatio="none"><defs><linearGradient id="temp-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#61bafa" stop-opacity=".27"/><stop offset="100%" stop-color="#61bafa" stop-opacity="0"/></linearGradient></defs><path d="M18 35H580 M18 91H580 M18 150H580" stroke="currentColor" opacity=".10" stroke-dasharray="4 6" fill="none"/><path d="'+area+'" fill="url(#temp-grad)"/><path d="'+path+'" fill="none" stroke="#63baff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';var indices=[0,6,12,18,23].filter(function(i){return i<hours.length;});$("chart-labels").innerHTML=indices.map(function(i){return "<span>"+esc(localClock(hours[i]))+"</span>";}).join("");}
function degreeBearing(value){var n=Number(value);if(!Number.isFinite(n))return "—";var labels=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];return labels[Math.round((n%360)/22.5)%16]+" · "+Math.round(n)+"°";}
function localClock(iso){if(!iso||typeof iso!=="string"||!iso.includes("T"))return "—";var h=Number(iso.slice(11,13)),m=iso.slice(14,16);if(!Number.isFinite(h))return "—";return (h%12||12)+":"+m+" "+(h>=12?"pm":"am");}
function localDay(iso){if(!iso)return "—";return formatDate(iso.slice(0,10)+"T12:00:00Z",{weekday:"long",day:"numeric",month:"short",timeZone:"UTC"});}
function forecastValue(arr,index,digits,suffix){if(!Array.isArray(arr)||arr[index]===null||arr[index]===undefined||!Number.isFinite(Number(arr[index])))return "—";return Number(arr[index]).toFixed(digits)+" "+(suffix||"");}
function dailyRainChance(day,hourly,index){var p=day.precipitation_probability_max;if(Array.isArray(p)&&p[index]!=null&&Number.isFinite(Number(p[index])))return Number(p[index]);var date=(day.time||[])[index],vals=(hourly.time||[]).map(function(t,i){return t&&t.slice(0,10)===date?Number((hourly.precipitation_probability||[])[i]):NaN;}).filter(Number.isFinite);return vals.length?Math.max.apply(null,vals):null;}
function narrativeFor(day,hourly,index){if(!day.time||!day.time[index])return "Next-day forecast unavailable.";var meta=weatherMeta((day.weather_code||[])[index],true),min=(day.temperature_2m_min||[])[index],max=(day.temperature_2m_max||[])[index],chance=dailyRainChance(day,hourly,index),rain=(day.precipitation_sum||[])[index],gust=(day.wind_gusts_10m_max||[])[index];var words=[meta[0]+" conditions are forecast for tomorrow."];
if(Number.isFinite(Number(min))&&Number.isFinite(Number(max))&&min!=null&&max!=null)words.push("Temperatures are expected to range from "+Math.round(min)+"°C to "+Math.round(max)+"°C.");
if(chance!=null)words.push("The highest forecast hourly rain probability is "+Math.round(chance)+"%.");
if(rain!=null&&Number.isFinite(Number(rain)))words.push("The modelled daily rainfall total is "+Number(rain).toFixed(1)+" mm.");
if(gust!=null&&Number(gust)>=35)words.push("Maximum forecast wind gusts may reach "+Math.round(gust)+" km/h.");
return words.join(" ");}
function showTomorrow(data){var d=data.daily||{},h=data.hourly||{},i=1,meta=weatherMeta((d.weather_code||[])[i],true);
setText("tomorrow-date",localDay((d.time||[])[i]));
setText("tomorrow-condition",meta[0]);setText("tomorrow-icon",meta[1]);
setText("tomorrow-min",forecastValue(d.temperature_2m_min,i,0,"°C"));
setText("tomorrow-max",forecastValue(d.temperature_2m_max,i,0,"°C"));
setText("tomorrow-rain-chance",dailyRainChance(d,h,i)===null?"—":dailyRainChance(d,h,i)+"%");
setText("tomorrow-rain-amount",forecastValue(d.precipitation_sum,i,1,"mm"));
setText("tomorrow-gust",forecastValue(d.wind_gusts_10m_max,i,0,"km/h"));
setText("tomorrow-uv",forecastValue(d.uv_index_max,i,0,""));
setText("tomorrow-narrative",narrativeFor(d,h,i));}
function updateOfficialStation(){var p=state.location,nearCessnock=km(p.lat,p.lon,-32.8321,151.3497)<36;
var link=$("official-observation-link");if(nearCessnock){setText("official-station-name","Cessnock Airport AWS · Bureau of Meteorology");setText("official-observation-description","Access official readings from Cessnock Airport, including measured temperature, pressure, dew point, wind and rainfall since 9 am. Observations are not the same as the model estimates above.");link.href="https://www.bom.gov.au/products/IDN60801/IDN60801.95771.shtml";link.innerHTML='Open Cessnock Airport Observations <span aria-hidden="true">↗</span>';}
else{setText("official-station-name","Bureau of Meteorology · Australian Observations");setText("official-observation-description","Find a relevant official weather station near "+p.name+" on the Bureau website. Observations vary by station and may be different from model forecasts.");link.href="https://www.bom.gov.au/places/";link.innerHTML='Find Official Weather Observations <span aria-hidden="true">↗</span>';}}
async function loadWeather(){updateWeatherStatus("Updating Forecast",false);
var l=state.location,query=new URLSearchParams({latitude:l.lat,longitude:l.lon,current:"temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,is_day,pressure_msl,cloud_cover,dew_point_2m",hourly:"temperature_2m,precipitation_probability,weather_code",daily:"weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max",timezone:"auto",forecast_days:"7"});
try{var data=await getJSON("https://api.open-meteo.com/v1/forecast?"+query.toString());if(l.lat!==state.location.lat||l.lon!==state.location.lon)return;
state.weather=data;state.weatherError=false;var c=data.current||{},d=data.daily||{},h=data.hourly||{},meta=weatherMeta(c.weather_code,c.is_day===1);
setText("current-temp",num(c.temperature_2m));
setText("current-description",meta[0]);setText("weather-symbol",meta[1]);
setText("feels-like","Feels Like "+num(c.apparent_temperature)+"°C");
setText("today-high",forecastValue(d.temperature_2m_max,0,0,"°"));
setText("today-low",forecastValue(d.temperature_2m_min,0,0,"°"));
setText("current-date",localDay(c.time||new Date().toISOString()));
setText("current-clock","Modelled Local Conditions in "+state.location.name+" · "+localClock(c.time));
setText("wind-speed",num(c.wind_speed_10m)+" km/h");
setText("wind-gust","Forecast Gusts "+num(c.wind_gusts_10m)+" km/h");
setText("humidity",num(c.relative_humidity_2m)+"%");
var peakUV=(d.uv_index_max||[])[0];setText("uv-index",num(peakUV));
var uv=peakUV===null?NaN:Number(peakUV);
setText("uv-description",!Number.isFinite(uv)?"Today's Predicted Peak":uv>=11?"Extreme · Daily Peak":uv>=8?"Very High · Daily Peak":uv>=6?"High · Daily Peak":uv>=3?"Moderate · Daily Peak":"Low · Daily Peak");
setText("rain-total",forecastValue(d.precipitation_sum,0,1,"mm"));
var rainChance=dailyRainChance(d,h,0);
setText("today-rain",rainChance===null?"—":Math.round(rainChance)+"%");
setText("forecast-update",localClock(c.time));
setText("detail-dewpoint",c.dew_point_2m==null?"—":num(c.dew_point_2m,1)+"°C");
setText("detail-pressure",c.pressure_msl==null?"—":num(c.pressure_msl,1));
setText("detail-wind-direction",degreeBearing(c.wind_direction_10m));
setText("detail-cloud-cover",c.cloud_cover==null?"—":num(c.cloud_cover)+"%");
setText("detail-sunrise",localClock((d.sunrise||[])[0]));
setText("detail-sunset",localClock((d.sunset||[])[0]));
showTomorrow(data);updateOfficialStation();
updateWeatherStatus("Model Forecast Available",false);
var times=h.time||[],start=times.findIndex(function(t){return t&&c.time&&t.slice(0,13)>=c.time.slice(0,13);});if(start<0)start=0;
var hours=times.slice(start,start+24),temps=(h.temperature_2m||[]).slice(start,start+24);createChart(hours,temps);
$("hourly-list").innerHTML=hours.slice(0,12).map(function(t,i){var idx=start+i,info=weatherMeta((h.weather_code||[])[idx],true),p=(h.precipitation_probability||[])[idx];return '<div class="hour-cell"><small>'+esc(i===0?"Now":localClock(t))+'</small><span class="hour-icon">'+info[1]+'</span><strong>'+num((h.temperature_2m||[])[idx])+'°</strong><span class="hour-rain">☂ '+(p==null?"—":num(p)+"%")+'</span></div>';}).join("");
$("daily-list").innerHTML=(d.time||[]).map(function(t,i){var info=weatherMeta((d.weather_code||[])[i],true),rain=(d.precipitation_sum||[])[i];return '<div class="day"><small>'+esc(i===0?"Today":formatDate(t+"T12:00:00Z",{weekday:"short",timeZone:"UTC"}))+'</small><span class="day-icon">'+info[1]+'</span><strong>'+num((d.temperature_2m_max||[])[i])+'° <span class="min">'+num((d.temperature_2m_min||[])[i])+'°</span></strong><span class="rain">☂ '+(rain==null?"—":num(rain,1)+" mm")+'</span></div>';}).join("");
}catch(e){state.weatherError=true;updateWeatherStatus("Forecast Unavailable",true);setText("current-description","Weather Data Temporarily Unavailable");setText("tomorrow-narrative","Unable to verify the current forecast. Please try again or check the Bureau of Meteorology.");message("Weather service unavailable. Try refreshing.");console.warn("SkyPulse forecast",e);}}

function km(lat1,lon1,lat2,lon2){var rad=Math.PI/180,a=Math.sin((lat2-lat1)*rad/2)**2+Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin((lon2-lon1)*rad/2)**2;return 12742*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
function coordinatesOf(feature){var g=feature.geometry||{};if(g.type==="GeometryCollection"&&Array.isArray(g.geometries)){var pt=g.geometries.find(function(x){return x&&x.type==="Point"&&Array.isArray(x.coordinates);});if(pt)return [Number(pt.coordinates[1]),Number(pt.coordinates[0])];g=g.geometries.find(function(x){return x&&Array.isArray(x.coordinates);})||g;}var c=g.coordinates;if(!c)return null;if(g.type==="Point"&&c.length>=2)return [Number(c[1]),Number(c[0])];var points=[];function walk(x){if(!Array.isArray(x))return;if(x.length>=2&&typeof x[0]==="number"&&typeof x[1]==="number"){points.push(x);return;}x.forEach(walk);}walk(c);if(!points.length)return null;return [points.reduce(function(a,v){return a+v[1];},0)/points.length,points.reduce(function(a,v){return a+v[0];},0)/points.length];}
function incidentTitle(f){var p=f.properties||{},v=String(p.title||p.name||p.incidentName||p.eventName||"Mapped RFS Incident").trim();var alpha=v.replace(/[^a-zA-Z]/g,"");if(alpha.length>4&&alpha.replace(/[^A-Z]/g,"").length/alpha.length>.84)v=v.toLowerCase().replace(/\b[a-z]/g,function(s){return s.toUpperCase();}).replace(/\b(NSW|RFS|SES|BOM|ACT|HR|CFA)\b/gi,function(s){return s.toUpperCase();});return v;}
function incidentUrl(f){var p=f.properties||{},fallback="https://www.rfs.nsw.gov.au/fire-information/fires-near-me";try{var u=new URL(String(p.link||p.url||p.web||""));if(u.hostname==="rfs.nsw.gov.au"||u.hostname==="www.rfs.nsw.gov.au"){u.protocol="https:";return u.href;}return fallback;}catch(e){return fallback;}}
function incidentId(f,i){var p=f.properties||{};return String(f.id||p.guid||p.id||p.link||incidentTitle(f)+"-"+i);}
function snapshotIncidentStatus(){var box=$("snapshot-incidents");if(!box)return;if(!state.lastIncidentFetch){box.textContent="Feed Unavailable — Check NSW RFS Directly";return;}
var near=state.incidents.map(function(f){var pt=coordinatesOf(f);return pt?km(state.location.lat,state.location.lon,pt[0],pt[1]):Infinity;}).filter(function(dist){return Number.isFinite(dist)&&dist<=state.radius;});
var age=Date.now()-new Date(state.lastIncidentFetch).getTime();
box.textContent=(age>DATA_MAX_AGE?"Feed May Be Stale · ":"")+near.length+" Mapped Within "+state.radius+" km · See Official Advice";}
function initRadarPreview(){if(typeof L==="undefined"||state.peekMap)return;var el=$("radar-peek-map");if(!el)return;el.replaceChildren();
state.peekMap=L.map(el,{zoomControl:false,dragging:false,keyboard:false,doubleClickZoom:false,scrollWheelZoom:false,touchZoom:false,boxZoom:false,attributionControl:false}).setView([state.location.lat,state.location.lon],8);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:16,updateWhenIdle:true,keepBuffer:1}).addTo(state.peekMap);
if("ResizeObserver" in window)new ResizeObserver(function(){if(state.peekMap)state.peekMap.invalidateSize({pan:false});}).observe(el);
setTimeout(function(){state.peekMap.invalidateSize({pan:false});},250);
}
function updateRadarPreview(i){if(!state.peekMap||!state.radarFrames.length||!state.radarHost)return;
i=Math.min(Math.max(0,Number(i)||0),state.radarFrames.length-1);
if(state.peekLayer){state.peekMap.removeLayer(state.peekLayer);state.peekLayer=null;}
var frame=state.radarFrames[i];
state.peekLayer=L.tileLayer(state.radarHost+frame.path+"/256/{z}/{x}/{y}/2/1_1.png",{opacity:state.radarOpacity,maxNativeZoom:7,maxZoom:16,updateWhenIdle:true,keepBuffer:1}).addTo(state.peekMap);
setText("radar-peek-time",formatDate(frame.time*1000,{hour:"numeric",minute:"2-digit",timeZone:"Australia/Sydney"}));}

function renderIncidents(){snapshotIncidentStatus();var l=state.location,near=state.incidents.map(function(f,i){var point=coordinatesOf(f);return point?{f:f,index:i,point:point,distance:km(l.lat,l.lon,point[0],point[1])}:null;}).filter(function(x){return x&&x.distance<=state.radius;}).sort(function(a,b){return a.distance-b.distance;});if(!state.lastIncidentFetch){$("incidents-list").innerHTML='<p class="feed-empty">Live fire data has not been loaded. Check the official source.</p>';return;}$("incidents-list").innerHTML=near.length?near.slice(0,8).map(function(x){return '<div class="feed-item"><b>⚠ '+esc(incidentTitle(x.f))+'</b><small>Approx. '+Math.round(x.distance)+' km Away · Estimated From Mapped Coordinates</small><a href="'+esc(incidentUrl(x.f))+'" target="_blank" rel="noopener">View Official Incident Details ↗</a></div>';}).join(""):'<p class="feed-empty">No incidents mapped within this radius in the latest retrieved NSW RFS feed. This does NOT mean the area is safe or free of hazards.</p>';setText("incident-range","Within "+state.radius+" km of "+l.name+" · "+near.length+" Mapped");if(state.notify&&state.seen&&near.length){var ids=near.map(function(x){return incidentId(x.f,x.index);}),fresh=near.filter(function(x){return state.seen.indexOf(incidentId(x.f,x.index))<0;});if(fresh.length&&"Notification" in window&&Notification.permission==="granted"&&document.visibilityState==="visible"){try{new Notification("SkyPulse AU: new mapped RFS incident",{body:incidentTitle(fresh[0].f)+". Check NSW RFS for official instructions.",tag:"skypulse-fire",icon:"./assets/icon.svg"});}catch(e){}}state.seen=ids;save();}else if(!state.seen){state.seen=near.map(function(x){return incidentId(x.f,x.index);});save();}}
function feedState(id,stamp){var element=$(id),time=new Date(stamp).getTime();if(!Number.isFinite(time)){element.textContent="Source update time unavailable — verify on official site";element.className="feed-state warn";return false;}var stale=Date.now()-time>DATA_MAX_AGE;element.textContent=(stale?"Stale Feed — Check Official Source · ":"Feed Updated: ")+relTime(stamp);element.className=stale?"feed-state warn":"feed-state";return !stale;}
function preferredFireDistrict(){var l=state.location||DEFAULT,n=String(l.name||"").toLowerCase().trim();
var hunter=["cessnock","maitland","newcastle","singleton","dungog","muswellbrook","port stephens","lake macquarie","upper hunter"];
if(hunter.includes(n)||km(l.lat,l.lon,-32.8321,151.3497)<=35)return "Greater Hunter";
return "";}
function renderFireDanger(){var v=state.fireDanger,p=$("fdr-district-select"),box=$("snapshot-fire-danger");
if(!v||!Array.isArray(v.districts)||!v.retrieved_at){setText("fdr-feed-status","Fire Danger Feed Unavailable — Use the Official NSW RFS Website");$("fdr-feed-status").className="feed-state warn";setText("fdr-today-rating","Unavailable");setText("fdr-tomorrow-rating","Unavailable");setText("fdr-today-ban","Total Fire Ban: Unverified");setText("fdr-tomorrow-ban","Total Fire Ban: Unverified");box.textContent="Official Feed Unavailable · View RFS";return;}
var stale=Date.now()-new Date(v.retrieved_at).getTime()>DATA_MAX_AGE;
if(!p.options.length||p.options.length!==v.districts.length+1){p.innerHTML='<option value="">Choose a District</option>';v.districts.forEach(function(d){var o=document.createElement("option");o.value=d.name;o.textContent=d.name;p.appendChild(o);});}
var recommended=preferredFireDistrict(),chosen=state.fireDistrict||recommended;
if(!v.districts.some(function(d){return d.name===chosen;}))chosen=recommended&&v.districts.some(function(d){return d.name===recommended;})?recommended:"";
p.value=chosen;
var selected=v.districts.find(function(d){return d.name===chosen;});
feedState("fdr-feed-status",v.retrieved_at);
if(!selected){setText("fdr-today-rating","Select District");setText("fdr-tomorrow-rating","Select District");setText("fdr-today-ban","Total Fire Ban: Check RFS");setText("fdr-tomorrow-ban","Total Fire Ban: Check RFS");box.textContent="Select Your Fire Weather District · Check RFS";return;}
var rating=function(val){return val&&val.trim()?val.trim():"Not Issued";};
var ban=function(val){return val===true?"YES — Total Fire Ban":val===false?"No Total Fire Ban Listed":"Status Not Available";};
var today=rating(selected.rating_today),tomorrow=rating(selected.rating_tomorrow);
setText("fdr-today-rating",today);setText("fdr-tomorrow-rating",tomorrow);
setText("fdr-today-ban",ban(selected.ban_today));
setText("fdr-tomorrow-ban",ban(selected.ban_tomorrow));
$("fdr-today-rating").parentElement.dataset.level=today.toLowerCase();
$("fdr-tomorrow-rating").parentElement.dataset.level=tomorrow.toLowerCase();
box.textContent=selected.name+" · Today: "+today+" · Fire Ban: "+(selected.ban_today===true?"Yes":selected.ban_today===false?"No Listed":"Unverified")+(stale?" · Feed May Be Stale":"");
}
async function loadFireDanger(){try{var v=await getJSON("./data/fdr.json?cache="+Date.now());
if(!v||!v.retrieved_at||!Array.isArray(v.districts)||!v.districts.length||v.error)throw Error("RFS fire danger data not available");
state.fireDanger=v;renderFireDanger();}catch(err){state.fireDanger=null;renderFireDanger();}}

function rfsWarningUrl(alert){
  var url=validUrl(alert.web);
  try {var host=new URL(url).hostname;if(host==="www.rfs.nsw.gov.au"||host==="rfs.nsw.gov.au")return url;}catch(e){}
  return "https://www.rfs.nsw.gov.au/fire-information/alerts-and-warnings";
}
function showRfsWarningMap(){if(!state.map||!state.warningLayer)return;
  state.warningLayer.clearLayers();if(!state.warningsEnabled)return;
  state.rfsAlerts.slice(0,35).forEach(function(alert){
    if(!Array.isArray(alert.polygons))return;
    var sev=String(alert.severity||"").toLowerCase(),colour=sev.includes("extreme")?"#e44950":sev.includes("severe")?"#ef8637":"#e7bf51";
    alert.polygons.slice(0,8).forEach(function(poly){
      if(!Array.isArray(poly)||poly.length<3||poly.length>3000)return;
      var points=poly.filter(function(p){return Array.isArray(p)&&p.length===2&&Number.isFinite(Number(p[0]))&&Number.isFinite(Number(p[1]));});
      if(points.length<3)return;
      var popup='<b>'+esc(alert.headline||"NSW RFS Warning")+'</b><p>Official published warning area — check RFS instructions.</p><a href="'+esc(rfsWarningUrl(alert))+'" target="_blank" rel="noopener">Open NSW RFS Warning ↗</a>';
      L.polygon(points,{color:colour,weight:2,fillColor:colour,fillOpacity:.14}).bindPopup(popup).addTo(state.warningLayer);
    });
  });
}
async function loadOfficialRfsWarnings(){
  try{
    var data=await getJSON("./data/rfs-alerts.json?cache="+Date.now());
    if(!data||data.error||!data.retrieved_at||!Array.isArray(data.alerts))throw Error("RFS warning feed unavailable");
    var age=Date.now()-new Date(data.retrieved_at).getTime();
    if(!Number.isFinite(age)||age<0||age>DATA_MAX_AGE)throw Error("RFS warning feed stale");
    state.rfsAlerts=data.alerts;
    feedState("rfs-alert-feed-state",data.retrieved_at);
    $("rfs-alerts-list").innerHTML=data.alerts.length?data.alerts.slice(0,12).map(function(a){
      var sev=String(a.severity||"Unspecified"),polys=Array.isArray(a.polygons)?a.polygons.length:0;
      return '<div class="rfs-alert-entry"><div class="rfs-alert-entry-header"><b>⚠ '+esc(a.headline||a.event||"RFS Warning")+'</b><span class="warning-severity '+(sev.toLowerCase().includes("extreme")?"extreme":"")+'">'+esc(sev)+'</span></div><small>Published: '+esc(a.sent||"Time unavailable")+' · '+(polys?polys+" official mapped area(s)":"Warning area not machine-readable")+'</small><a class="text-link" href="'+esc(rfsWarningUrl(a))+'" target="_blank" rel="noopener">Read Official RFS Warning ↗</a></div>';
    }).join(""):'<p class="feed-empty">No published CAP warnings in the retrieved RFS feed. Check the official service for current information.</p>';
    showRfsWarningMap();
  }catch(e){
    state.rfsAlerts=[];showRfsWarningMap();
    $("rfs-alert-feed-state").textContent="Official Warning Feed Unavailable or Stale — Check NSW RFS";
    $("rfs-alert-feed-state").className="feed-state warn";
    $("rfs-alerts-list").innerHTML='<p class="feed-empty">Warning status cannot be verified from this feed.</p>';
  }
}
async function loadWmoUpdates(){
  try{
    var data=await getJSON("./data/wmo-bom.json?cache="+Date.now());
    if(!data||data.error||!data.retrieved_at||!Array.isArray(data.entries))throw Error("WMO feed unavailable");
    var age=Date.now()-new Date(data.retrieved_at).getTime();
    if(!Number.isFinite(age)||age<0||age>DATA_MAX_AGE)throw Error("WMO feed stale");
    feedState("wmo-feed-state",data.retrieved_at);
    $("wmo-warnings-list").innerHTML=data.entries.length?data.entries.slice(0,7).map(function(entry){
      var link=validUrl(entry.link);
      try{if(new URL(link).hostname!=="severeweather.wmo.int")link=null;}catch(e){link=null;}
      return '<div class="feed-item"><b>'+esc(entry.title||"WMO CAP Publication")+'</b><small>'+esc(entry.published||"Publication time unavailable")+' · Recent publication, not verified active</small>'+(link?'<a href="'+esc(link)+'" target="_blank" rel="noopener">Open WMO CAP Record ↗</a>':"")+'</div>';
    }).join(""):'<p class="feed-empty">No recent NSW/ACT-related publications found in this supplementary index. This is not an official all-clear.</p>';
  }catch(e){
    $("wmo-feed-state").textContent="Supplementary WMO Publications Unavailable or Stale";
    $("wmo-feed-state").className="feed-state warn";
    $("wmo-warnings-list").innerHTML='<p class="feed-empty">Check the official BOM warnings page for current advice.</p>';
  }
}

async function loadHazards(){loadFireDanger();loadOfficialRfsWarnings();loadWmoUpdates();try{var data=await getJSON("./data/rfs.json?cache="+Date.now());if(!Array.isArray(data.features)||!data.retrieved_at||data.error)throw Error("RFS feed is unavailable");state.incidents=data.features;state.lastIncidentFetch=data.retrieved_at;feedState("rfs-feed-state",data.retrieved_at);renderIncidents();updateMarkers();}catch(e){state.incidents=[];state.lastIncidentFetch=null;$("rfs-feed-state").textContent="Incident data unavailable; use the official NSW RFS link below. Check Pages publishing source if persistent.";$("rfs-feed-state").className="feed-state warn";renderIncidents();updateMarkers();}try{var bom=await getJSON("./data/bom.json?cache="+Date.now());if(!Array.isArray(bom.warnings)||!bom.retrieved_at||bom.error)throw Error("BOM feed is unavailable");feedState("bom-feed-state",bom.retrieved_at);setText("snapshot-warnings",bom.warnings.length+" Statewide NSW/ACT Notices · Check for Local Relevance");$("warnings-list").innerHTML=bom.warnings.length?bom.warnings.slice(0,7).map(function(w){var link=validUrl(w.link)||"https://www.bom.gov.au/nsw/warnings/";return '<div class="feed-item"><b>⚠ '+esc(w.title||"Weather warning")+'</b><small>'+esc(w.published||"See original warning for issue time")+'</small><a href="'+esc(link)+'" target="_blank" rel="noopener">Read full warning at BOM ↗</a></div>';}).join(""):'<p class="feed-empty">No current warnings were listed in the retrieved statewide BOM RSS feed. Check BOM directly before making safety decisions.</p>';}catch(e){setText("snapshot-warnings","Warning Feed Unavailable — Check Official BOM Warnings");$("bom-feed-state").textContent="Warning feed unavailable. Open BOM for the latest notices.";$("bom-feed-state").className="feed-state warn";$("warnings-list").innerHTML='<p class="feed-empty">Unable to verify current warning status.</p>';}}
function mapInfo(text){var e=$("map-location-status");e.textContent=text;e.hidden=false;clearTimeout(state.mapStatusTimer);state.mapStatusTimer=setTimeout(function(){e.hidden=true;},5200);}
function updateMapCoords(){if(!state.map)return;var p=state.map.getCenter();setText("map-coordinates",Math.abs(p.lat).toFixed(4)+"°"+(p.lat<0?"S":"N")+", "+Math.abs(p.lng).toFixed(4)+"°"+(p.lng<0?"W":"E")+" · Zoom "+state.map.getZoom());}
function mapResize(){if(state.map)state.map.invalidateSize({pan:false});}
function mapRefresh(){if(state.map){mapResize();state.baseLayer.redraw();}}
function centreSelected(){if(!state.map)return;state.map.flyTo([state.location.lat,state.location.lon],11,{duration:.5});mapInfo("Map Centred on "+state.location.name+".");}
function locateMap(){if(!state.map)return;if(!navigator.geolocation){mapInfo("Browser Location Services Are Unavailable.");return;}var btn=$("map-locate");btn.disabled=true;mapInfo("Requesting Current Location…");navigator.geolocation.getCurrentPosition(function(pos){btn.disabled=false;var ll=[pos.coords.latitude,pos.coords.longitude],accuracy=Math.max(0,Number(pos.coords.accuracy)||0);if(state.gpsMarker)state.map.removeLayer(state.gpsMarker);if(state.gpsAccuracy)state.map.removeLayer(state.gpsAccuracy);state.gpsAccuracy=L.circle(ll,{radius:accuracy,color:"#2b93e5",weight:1,fillColor:"#58b7fd",fillOpacity:.13,interactive:false}).addTo(state.map);state.gpsMarker=L.circleMarker(ll,{radius:8,color:"white",weight:3,fillColor:"#1688e1",fillOpacity:1}).addTo(state.map).bindPopup("Your Current Location (Approximate)");state.map.flyTo(ll,Math.max(11,state.map.getZoom()),{duration:.6});mapInfo("Current Location Found"+(accuracy?" · Accuracy ±"+Math.round(accuracy)+" m":"")+". Your Forecast Location Is Unchanged.");},function(error){btn.disabled=false;mapInfo(error.code===1?"Location Permission Denied — Check Your Browser Settings.":"Unable to Determine Current Location.");},{timeout:15000,maximumAge:60000,enableHighAccuracy:true});}
function fitNearby(){if(!state.map)return;var near=state.incidents.map(function(f){var p=coordinatesOf(f);return p&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&km(state.location.lat,state.location.lon,p[0],p[1])<=state.radius?p:null;}).filter(Boolean);if(!near.length){mapInfo("No Mapped Incidents Found Within the Selected Radius — This Does Not Confirm Safety.");return;}near.push([state.location.lat,state.location.lon]);state.map.fitBounds(L.latLngBounds(near).pad(.22),{maxZoom:12});mapInfo("Showing "+(near.length-1)+" Nearby Mapped RFS Incidents.");}
function syncMapLayerUI(){$("map-layer-warnings").checked=state.warningsEnabled;[["radar",state.radarEnabled],["incidents",state.incidentsEnabled]].forEach(function(v){var b=$(v[0]==="radar"?"radar-toggle":"incidents-toggle");b.classList.toggle("selected",v[1]);b.setAttribute("aria-pressed",String(v[1]));});$("map-layer-radar").checked=state.radarEnabled;$("map-layer-rfs").checked=state.incidentsEnabled;$("map-nearby-only").checked=state.mapNearbyOnly;$("map-wheel-zoom").checked=state.mapWheelZoom;$("map-radar-opacity").value=Math.round(state.radarOpacity*100);setText("map-opacity-label",Math.round(state.radarOpacity*100)+"%");}
function setMapLayer(kind,value){if(kind==="radar"){state.radarEnabled=value;if(!value&&state.radarTimer)toggleRadarPlay();if(state.radarFrames.length)showRadarFrame(Number($("radar-slider").value));}else{state.incidentsEnabled=value;updateMarkers();}syncMapLayerUI();}
function toggleMapFullscreen(){var el=$("map-viewport");if(document.fullscreenElement===el){document.exitFullscreen().catch(function(){});return;}if(el.classList.contains("map-pseudo-fullscreen")){el.classList.remove("map-pseudo-fullscreen");document.body.classList.remove("map-lock-scroll");setTimeout(mapResize,80);return;}if(el.requestFullscreen){el.requestFullscreen().then(function(){setTimeout(mapResize,80);}).catch(function(){el.classList.add("map-pseudo-fullscreen");document.body.classList.add("map-lock-scroll");setTimeout(mapResize,80);});}else{el.classList.add("map-pseudo-fullscreen");document.body.classList.add("map-lock-scroll");setTimeout(mapResize,80);}}
function initMap(){initRadarPreview();if(typeof L==="undefined"){$("weather-map").innerHTML='<p class="map-fallback">Map Unavailable. <a href="https://www.bom.gov.au/australia/radar/" target="_blank" rel="noopener">Open Official BOM Radar ↗</a></p>';return;}
$("weather-map").replaceChildren();
state.map=L.map("weather-map",{zoomControl:false,scrollWheelZoom:false,preferCanvas:true}).setView([state.location.lat,state.location.lon],9);
state.baseLayer=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,updateWhenIdle:true,keepBuffer:2,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> Contributors'});
state.baseLayer.on("tileerror",function(){state.mapTileFailures++;if(state.mapTileFailures>=3){setText("map-tile-status","Base Map Tiles Unavailable — Check Your Connection or Use the Official Radar.");$("map-tile-status").hidden=false;}});
state.baseLayer.addTo(state.map);state.markers=L.layerGroup().addTo(state.map);state.warningLayer=L.layerGroup().addTo(state.map);
state.locationMarker=L.circleMarker([state.location.lat,state.location.lon],{radius:7,color:"white",weight:3,fillColor:"#278ce6",fillOpacity:1}).addTo(state.map).bindPopup("Selected Location: "+esc(state.location.name));
L.control.scale({metric:true,imperial:false,position:"bottomleft",maxWidth:110}).addTo(state.map);
state.map.on("moveend zoomend",updateMapCoords);updateMapCoords();
if("ResizeObserver" in window)new ResizeObserver(function(){if(state.map)state.map.invalidateSize({pan:false});}).observe($("weather-map"));
document.querySelectorAll('a[href="#map-section"]').forEach(function(a){a.addEventListener("click",function(){setTimeout(function(){state.map.invalidateSize({pan:false});},160);});});
$("map-retry").addEventListener("click",function(){state.mapTileFailures=0;$("map-tile-status").hidden=true;mapRefresh();});
$("map-zoom-in").addEventListener("click",function(){state.map.zoomIn();});$("map-zoom-out").addEventListener("click",function(){state.map.zoomOut();});$("map-locate").addEventListener("click",locateMap);$("map-home").addEventListener("click",centreSelected);$("map-fit").addEventListener("click",fitNearby);$("map-fullscreen").addEventListener("click",toggleMapFullscreen);
$("map-layers-button").addEventListener("click",function(){var panel=$("map-layers-panel");panel.hidden=!panel.hidden;this.setAttribute("aria-expanded",String(!panel.hidden));});
$("map-layer-radar").addEventListener("change",function(e){setMapLayer("radar",e.target.checked);});$("map-layer-rfs").addEventListener("change",function(e){setMapLayer("incidents",e.target.checked);});$("map-layer-warnings").addEventListener("change",function(e){state.warningsEnabled=e.target.checked;showRfsWarningMap();syncMapLayerUI();});
$("map-nearby-only").addEventListener("change",function(e){state.mapNearbyOnly=e.target.checked;updateMarkers();syncMapLayerUI();});$("map-wheel-zoom").addEventListener("change",function(e){state.mapWheelZoom=e.target.checked;if(state.mapWheelZoom)state.map.scrollWheelZoom.enable();else state.map.scrollWheelZoom.disable();syncMapLayerUI();});
$("map-radar-opacity").addEventListener("input",function(e){state.radarOpacity=Number(e.target.value)/100;setText("map-opacity-label",Math.round(state.radarOpacity*100)+"%");if(state.radarLayer)state.radarLayer.setOpacity(state.radarOpacity);});
state.map.on("click",function(){$("map-layers-panel").hidden=true;$("map-layers-button").setAttribute("aria-expanded","false");});
document.addEventListener("fullscreenchange",function(){setTimeout(function(){if(state.map)state.map.invalidateSize({pan:false});},100);});
document.addEventListener("keydown",function(e){if(e.key==="Escape"){$("map-layers-panel").hidden=true;$("map-layers-button").setAttribute("aria-expanded","false");if($("map-viewport").classList.contains("map-pseudo-fullscreen"))toggleMapFullscreen();}});
syncMapLayerUI();setTimeout(function(){state.map.invalidateSize({pan:false});},350);updateMarkers();showRfsWarningMap();loadRadar();}
function updateMarkers(){if(!state.map||!state.markers)return;state.markers.clearLayers();if(!state.incidentsEnabled)return;state.incidents.forEach(function(f){var pt=coordinatesOf(f);if(!pt||!Number.isFinite(pt[0])||!Number.isFinite(pt[1]))return;if(state.mapNearbyOnly&&km(state.location.lat,state.location.lon,pt[0],pt[1])>state.radius)return;var p=f.properties||{},level=String(p["alert-level"]||p.alertLevel||p.alert||p.status||"").toLowerCase(),color=level.includes("emergency")?"#e24a5d":level.includes("watch")?"#f1a040":"#ff9c52";var popup='<b>'+esc(incidentTitle(f))+'</b><br><small>Mapped Incident — Not a Warning Area</small><br><a href="'+esc(incidentUrl(f))+'" target="_blank" rel="noopener">Official NSW RFS Information ↗</a>';L.circleMarker(pt,{radius:7,color:"white",weight:1.5,fillColor:color,fillOpacity:.85}).bindPopup(popup).addTo(state.markers);});}
async function loadRadar(){if(!state.map)return;try{var raw=await getJSON("https://api.rainviewer.com/public/weather-maps.json",11000),frames=(raw.radar&&raw.radar.past)||[];if(!frames.length)throw Error("No radar frames");state.radarFrames=frames;state.radarHost=raw.host;$("radar-slider").max=frames.length-1;$("radar-slider").value=frames.length-1;$("radar-slider").disabled=false;showRadarFrame(frames.length-1);}catch(e){setText("radar-time","Radar unavailable");setText("radar-frame-label","Check BOM radar");}}
function showRadarFrame(i){if(!state.map||!state.radarFrames.length)return;i=Math.min(Math.max(0,i),state.radarFrames.length-1);if(state.radarLayer){state.map.removeLayer(state.radarLayer);state.radarLayer=null;}var frame=state.radarFrames[i],path=state.radarHost+frame.path+"/256/{z}/{x}/{y}/2/1_1.png";if(state.radarEnabled)state.radarLayer=L.tileLayer(path,{opacity:state.radarOpacity,zIndex:350,maxNativeZoom:7,maxZoom:18,updateWhenIdle:true,keepBuffer:1,attribution:'Radar <a href="https://www.rainviewer.com/">RainViewer</a>'}).addTo(state.map);setText("radar-time","Radar: "+formatDate(frame.time*1000,{hour:"numeric",minute:"2-digit",timeZone:"Australia/Sydney"}));setText("radar-frame-label",(i+1)+" / "+state.radarFrames.length+" frames · historical");$("radar-slider").value=i;updateRadarPreview(i);}
function toggleRadarPlay(){if(state.radarTimer){clearInterval(state.radarTimer);state.radarTimer=null;$("radar-play").textContent="▶";return;}if(!state.radarFrames.length)return;state.radarTimer=setInterval(function(){showRadarFrame((Number($("radar-slider").value)+1)%state.radarFrames.length);},2100);$("radar-play").textContent="Ⅱ";}
function changeLocation(l){state.location=l;save();updateLocationUI();if(state.peekMap)state.peekMap.setView([l.lat,l.lon],8);if(state.map){state.map.setView([l.lat,l.lon],9);if(state.locationMarker)state.locationMarker.setLatLng([l.lat,l.lon]).bindPopup("Selected Location: "+esc(l.name));updateMarkers();}state.seen=null;loadWeather();renderIncidents();window.dispatchEvent(new Event("skypulse:watch-changed"));message("Location changed to "+l.name);}
var searchTimer=null;function searchLocation(text){clearTimeout(searchTimer);if(text.trim().length<2){$("location-results").hidden=true;return;}searchTimer=setTimeout(async function(){try{var q=new URLSearchParams({name:text.trim(),count:"7",language:"en",countryCode:"AU"});var data=await getJSON("https://geocoding-api.open-meteo.com/v1/search?"+q,9000),results=data.results||[];if($("location-input").value.trim()!==text.trim())return;var box=$("location-results");box.innerHTML="";if(!results.length){box.innerHTML='<div class="muted" style="padding:10px">No Australian matches</div>';}results.forEach(function(r){var b=document.createElement("button");b.type="button";b.setAttribute("role","option");b.innerHTML=esc(r.name)+'<small>'+esc([r.admin1,r.country].filter(Boolean).join(", "))+'</small>';b.addEventListener("click",function(){changeLocation({name:r.name,region:r.admin1||"",lat:r.latitude,lon:r.longitude});box.hidden=true;});box.appendChild(b);});box.hidden=false;}catch(e){$("location-results").hidden=true;}},350);}
function setupInstall(){var deferred=null;window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();deferred=e;$("install-button").hidden=false;});function install(){if(deferred){deferred.prompt();deferred.userChoice.finally(function(){deferred=null;$("install-button").hidden=true;});}else message("Install via your browser menu: Add to Home Screen / Install App. On iPhone use Safari → Share → Add to Home Screen.");}$("install-button").addEventListener("click",install);$("settings-install").addEventListener("click",install);}
function setupNav(){document.querySelectorAll(".nav-item").forEach(function(a){a.addEventListener("click",function(){document.querySelectorAll(".nav-item").forEach(function(b){b.classList.remove("active");});a.classList.add("active");});});}
function init(){window.SkyPulseWatchContext=function(){return {latitude:state.location.lat,longitude:state.location.lon,radiusKm:state.radius,locationName:state.location.name};};$("fdr-district-select").addEventListener("change",function(e){state.fireDistrict=e.target.value;save();renderFireDanger();});if(state.location&&state.location.name==="My location"){state.location.name="My Location";save();}theme();updateLocationUI();$("year").textContent=new Date().getFullYear();$("theme-button").addEventListener("click",function(){state.theme=state.theme==="dark"?"light":"dark";save();theme();});$("location-input").addEventListener("input",function(e){searchLocation(e.target.value);});$("location-input").addEventListener("blur",function(){setTimeout(function(){$("location-results").hidden=true;},200);});$("geo-button").addEventListener("click",function(){if(!navigator.geolocation){message("Location is not supported on this device.");return;}navigator.geolocation.getCurrentPosition(function(p){changeLocation({name:"My Location",region:"Australia",lat:p.coords.latitude,lon:p.coords.longitude});},function(){message("Location access denied or unavailable. Use the location search instead.");},{timeout:10000,enableHighAccuracy:false});});$("refresh-button").addEventListener("click",function(){loadWeather();loadHazards();loadRadar();});$("hazards-refresh").addEventListener("click",loadHazards);$("radius").addEventListener("input",function(e){state.radius=Number(e.target.value);save();setText("radius-label",state.radius+" km");renderIncidents();updateMarkers();window.dispatchEvent(new Event("skypulse:watch-changed"));});$("notify-toggle").checked=state.notify;$("notify-toggle").addEventListener("change",function(e){state.notify=e.target.checked;save();setText("notification-state",state.notify?"Only on-screen monitoring while the app is open. Background push is not active.":"Background push is not yet available. Official emergency alerts remain essential.");});$("notify-permission").addEventListener("click",async function(){if(!("Notification" in window)){message("This browser does not support notifications.");return;}var p=await Notification.requestPermission();message("Browser notifications: "+p+". New incident notices work only with SkyPulse open.");});$("radar-toggle").addEventListener("click",function(){setMapLayer("radar",!state.radarEnabled);});$("incidents-toggle").addEventListener("click",function(){setMapLayer("incidents",!state.incidentsEnabled);});$("radar-slider").addEventListener("input",function(e){showRadarFrame(Number(e.target.value));});$("radar-play").addEventListener("click",toggleRadarPlay);$("radar-step-back").addEventListener("click",function(){if(state.radarTimer)toggleRadarPlay();showRadarFrame(Number($("radar-slider").value)-1);});$("radar-step-forward").addEventListener("click",function(){if(state.radarTimer)toggleRadarPlay();showRadarFrame(Number($("radar-slider").value)+1);});setupInstall();setupNav();loadWeather();initMap();loadHazards();setInterval(function(){loadWeather();loadHazards();},15*60*1000);}
document.addEventListener("DOMContentLoaded",init);
})();