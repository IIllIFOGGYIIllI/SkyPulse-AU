/* SkyPulse AU — non-commercial, independent information experience. */
(function(){
"use strict";
var $=function(id){return document.getElementById(id);};
var DEFAULT={name:"Cessnock",region:"New South Wales",lat:-32.8321,lon:151.3497};
var stored={};try{stored=JSON.parse(localStorage.getItem("skypulse.preferences")||"{}");}catch(e){}
var radarStored=stored.radar&&typeof stored.radar==="object"&&!Array.isArray(stored.radar)?stored.radar:{};
function radarSettingBool(key,fallback){return typeof radarStored[key]==="boolean"?radarStored[key]:fallback;}
function radarSettingSpeed(value){return [5000,3500,2200].includes(Number(value))?Number(value):3500;}
function radarSettingOpacity(value){var x=Number(value);return Number.isFinite(x)&&x>=.2&&x<=1?Math.round(x*20)/20:.6;}
var state={location:stored.location||DEFAULT,radius:Number(stored.radius)||50,theme:stored.theme||"dark",notify:!!stored.notify,weather:null,weatherLocationKey:"",weatherFetchedAt:0,weatherCached:false,weatherFetchFailed:false,weatherSeq:0,forecastChartMode:"temperature",forecastDayIndex:0,map:null,markers:null,radarLayer:null,peekMap:null,peekLayer:null,radarFrames:[],radarHost:"",radarEnabled:radarSettingBool("rain",true),incidentsEnabled:radarSettingBool("incidents",true),radarTimer:null,radarIndex:-1,radarFollowLatest:radarSettingBool("follow",true),
radarAutocheck:radarSettingBool("auto",true),radarLoop:radarSettingBool("loop",true),
radarShowTimestamp:radarSettingBool("timestamp",true),radarSpeed:radarSettingSpeed(radarStored.speed),
radarShareView:null,radarSharedAt:null,radarCurrentRegion:"local",radarFetchedAt:0,radarAttemptAt:0,radarLoadingPromise:null,radarRenderedKey:"",radarOutgoing:null,radarSwapTimer:null,radarLastError:"",radarTileErrors:0,baseLayer:null,locationMarker:null,mapTileFailures:0,mapNearbyOnly:radarSettingBool("nearby",true),mapWheelZoom:radarSettingBool("wheel",false),radarOpacity:radarSettingOpacity(radarStored.opacity),gpsMarker:null,gpsAccuracy:null,mapStatusTimer:null,fireDanger:null,hazardMap:null,hazardLayers:null,hazardRadiusLayer:null,fireDirectoryMode:"incidents",fireDirectoryScope:"nearby",fireDirectorySort:"distance",fireDirectoryQuery:"",fireDirectoryType:"all",fireDirectoryLevel:"all",fireSelected:null,
 incidentsFresh:false,warningsFresh:false,fireAreasEnabled:radarSettingBool("fireareas",true),fireAreaLayer:null,fireDistrict:stored.fireDistrict||"",rfsAlerts:[],warningLayer:null,warningsEnabled:radarSettingBool("warnings",true),incidents:[],lastIncidentFetch:null,seen:stored.seen||null,weatherError:false};
var DATA_MAX_AGE=90*60*1000;
function save(){try{localStorage.setItem("skypulse.preferences",JSON.stringify({location:state.location,radius:state.radius,theme:state.theme,notify:state.notify,seen:state.seen,fireDistrict:state.fireDistrict,
 radar:{auto:state.radarAutocheck,follow:state.radarFollowLatest,
 loop:state.radarLoop,timestamp:state.radarShowTimestamp,speed:state.radarSpeed,
 opacity:state.radarOpacity,rain:state.radarEnabled,incidents:state.incidentsEnabled,
 warnings:state.warningsEnabled,nearby:state.mapNearbyOnly,wheel:state.mapWheelZoom,fireareas:state.fireAreasEnabled}}));}catch(e){}}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];});}
function num(n,d){return typeof n==="number"&&Number.isFinite(n)?n.toFixed(d||0):"—";}
function message(text){var t=$("toast");t.textContent=text;t.hidden=false;clearTimeout(message.timer);message.timer=setTimeout(function(){t.hidden=true;},4500);}
function formatDate(d,opt){try{return new Intl.DateTimeFormat("en-AU",opt).format(new Date(d));}catch(e){return "—";}}
function relTime(value){var delta=Math.max(0,Date.now()-new Date(value).getTime()),mins=Math.round(delta/60000);if(!Number.isFinite(mins))return "unknown";return mins<2?"just now":mins<60?mins+" min ago":Math.round(mins/60)+" h ago";}
function validUrl(s){try{var u=new URL(s);return u.protocol==="https:"?u.href:null;}catch(e){return null;}}
function weatherMeta(code,isDay){if(code===null||code===undefined||!Number.isFinite(Number(code)))return ["Conditions unavailable","☁️"];var c=Number(code);if(c===0)return ["Clear sky",isDay?"☀️":"🌙"];if(c<=2)return ["Partly cloudy",isDay?"🌤️":"☁️"];if(c===3)return ["Overcast","☁️"];if(c<=48)return ["Foggy","🌫️"];if(c<=57)return ["Drizzle","🌦️"];if(c<=67)return ["Rain","🌧️"];if(c<=77)return ["Snow","🌨️"];if(c<=82)return ["Rain showers","🌦️"];if(c<=86)return ["Snow showers","🌨️"];if(c===95||c===96||c===99)return ["Thunderstorms","⛈️"];return ["Conditions unavailable","☁️"];}
function setText(id,s){var el=$(id);if(el)el.textContent=s;}
function theme(){document.documentElement.dataset.theme=state.theme;setText("theme-name",state.theme==="dark"?"Dark":"Light");$("theme-button").setAttribute("aria-label",state.theme==="dark"?"Switch to Light Theme":"Switch to Dark Theme");$("theme-button").title=state.theme==="dark"?"Switch to Light Theme":"Switch to Dark Theme";}
function updateLocationUI(){var l=state.location;setText("heading-location",l.name);setText("settings-location",l.name+(l.region?", "+l.region:""));setText("incident-range","Within "+state.radius+" km of "+l.name);$("location-input").value=l.name;setText("radius-label",state.radius+" km");if($("radius"))$("radius").value=state.radius;updateOfficialStation();if(state.fireDanger)renderFireDanger();}
async function getJSON(url,timeout){var c=new AbortController(),tm=setTimeout(function(){c.abort();},timeout||13000);try{var r=await fetch(url,{signal:c.signal,cache:"no-store"});if(!r.ok)throw Error("HTTP "+r.status);return await r.json();}finally{clearTimeout(tm);}}
function updateWeatherStatus(text,error){if(!$("weather-status"))return;$("weather-status").innerHTML='<span class="pulse-dot" style="'+(error?"background:var(--red)":"")+'"></span>'+esc(text);}
function createChart(hours,values,mode){
 if(!$("temp-chart"))return;
 mode=mode||"temperature";
 var configs={temperature:{label:"Temperature",unit:"°C",color:"#63baff"},rain:{label:"Hourly Rain Chance",unit:"%",color:"#5ec9a2"},wind:{label:"Wind Gusts",unit:"km/h",color:"#f5ab6b"}};
 var config=configs[mode]||configs.temperature;
 var list=(values||[]).map(function(v){return v==null||!Number.isFinite(Number(v))?null:Number(v);});
 var available=list.filter(function(v){return v!==null;});
 if(!available.length||!hours.length){$("temp-chart").innerHTML='<p class="muted">No '+esc(config.label.toLowerCase())+' data available for this period.</p>';setText("chart-labels","");return;}
 var lo=Math.min.apply(null,available),hi=Math.max.apply(null,available),span=Math.max(4,hi-lo);
 var min=mode==="rain"?0:Math.floor(lo-Math.max(1,span*.15));
 var max=mode==="rain"?100:Math.ceil(hi+Math.max(1,span*.15));
 if(mode==="wind")min=0;
 if(max<=min)max=min+1;
 var plotX=40,plotRight=585,plotTop=14,plotBottom=164;
 var xy=function(v,i){return [plotX+i*((plotRight-plotX)/Math.max(1,list.length-1)),plotBottom-(v-min)/(max-min)*(plotBottom-plotTop)];};
 var segments=[],segment=[];
 list.forEach(function(v,i){if(v===null){if(segment.length){segments.push(segment);segment=[];}return;}segment.push(xy(v,i));});
 if(segment.length)segments.push(segment);
 var paths=segments.map(function(points){return points.map(function(p,i){return (i?"L":"M")+p[0].toFixed(2)+","+p[1].toFixed(2);}).join(" ");});
 var guides=[0,1,2,3].map(function(k){
  var yy=plotTop+k*(plotBottom-plotTop)/3,value=max-(max-min)*k/3;
  return '<line x1="'+plotX+'" y1="'+yy.toFixed(1)+'" x2="'+plotRight+'" y2="'+yy.toFixed(1)+'" stroke="currentColor" stroke-opacity=".12" stroke-dasharray="4 5"/>'+
   '<text x="34" y="'+(yy+3).toFixed(1)+'" font-size="10" fill="currentColor" text-anchor="end" opacity=".7">'+esc(String(Math.round(value)))+'</text>';
 }).join("");
 var dataPaths=paths.map(function(p){return '<path d="'+p+'" fill="none" stroke="'+config.color+'" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>';}).join("");
 var dots=segments.filter(function(part){return part.length===1;}).map(function(part){return '<circle cx="'+part[0][0].toFixed(2)+'" cy="'+part[0][1].toFixed(2)+'" r="3" fill="'+config.color+'"/>';}).join("");
 $("temp-chart").innerHTML='<svg role="img" aria-label="'+esc(config.label)+' modelled forecast for the next 24 hours. Minimum '+esc(String(lo.toFixed(1)))+' and maximum '+esc(String(hi.toFixed(1)))+' '+esc(config.unit)+'." viewBox="0 0 600 185" preserveAspectRatio="xMidYMid meet">'+guides+dataPaths+dots+'</svg>';
 var indexes=[0,6,12,18,23].filter(function(i){return i<hours.length;});
 $("chart-labels").innerHTML=indexes.map(function(i){return "<span>"+esc(localClock(hours[i]))+"</span>";}).join("");
}
function forecastFinite(v){return v!==null&&v!==undefined&&Number.isFinite(Number(v))?Number(v):null;}
function forecastDisplay(v,digits,unit){var n=forecastFinite(v);return n===null?"—":n.toFixed(digits)+(unit||"");}
function forecastLocationKey(location){return Number(location.lat).toFixed(4)+":"+Number(location.lon).toFixed(4);}
function forecastModelEpoch(data){
 var current=data&&data.current||{},match=String(current.time||"").match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
 if(!match||!Number.isFinite(Number(data.utc_offset_seconds)))return null;
 var localMillis=Date.parse(match[1]+"T"+match[2]+":00Z");
 return Number.isFinite(localMillis)?localMillis-Number(data.utc_offset_seconds)*1000:null;
}
function forecastLocalZone(data){return String(data.timezone_abbreviation||"local time").slice(0,18);}
function forecastFetchedClock(data,epoch){
 if(!Number.isFinite(epoch))return "—";
 var zone=data&&typeof data.timezone==="string"?data.timezone:"Australia/Sydney";
 try{return new Intl.DateTimeFormat("en-AU",{timeZone:zone,hour:"numeric",minute:"2-digit",hour12:true,timeZoneName:"short"}).format(epoch);}
 catch(e){return new Date(epoch).toLocaleTimeString("en-AU",{hour:"numeric",minute:"2-digit"});}
}
function forecastValidate(data){
 if(!data||data.error||!data.current||!data.hourly||!data.daily)throw Error("Weather model response incomplete");
 if(!Number.isFinite(data.current.temperature_2m)||!data.current.time||!forecastModelEpoch(data))throw Error("Current model estimate or timezone missing");
 var h=data.hourly,d=data.daily;
 if(!Array.isArray(h.time)||h.time.length<24||!Array.isArray(h.temperature_2m)||h.temperature_2m.length!==h.time.length)throw Error("Hourly forecast unavailable");
 if(!Array.isArray(d.time)||d.time.length<2||!Array.isArray(d.temperature_2m_max)||d.temperature_2m_max.length<2)throw Error("Daily forecast unavailable");
 if(d.time.some(function(t){return !/^\d{4}-\d{2}-\d{2}$/.test(String(t));}))throw Error("Invalid model dates");
 if(data.latitude!=null&&!Number.isFinite(Number(data.latitude)))throw Error("Invalid model coordinates");
 return data;
}
const FORECAST_CACHE_KEY="skypulse.weather.cache.v1";
const FORECAST_CACHE_MS=2*60*60*1000;
function forecastCacheRead(key){
 try{
  var item=JSON.parse(localStorage.getItem(FORECAST_CACHE_KEY)||"null");
  if(!item||item.key!==key||!Number.isFinite(item.checkedAt)||Date.now()-item.checkedAt<0||Date.now()-item.checkedAt>FORECAST_CACHE_MS)return null;
  return {data:forecastValidate(item.data),checkedAt:item.checkedAt};
 }catch(e){return null;}
}
function forecastCacheWrite(key,data){
 try{localStorage.setItem(FORECAST_CACHE_KEY,JSON.stringify({key:key,data:data,checkedAt:Date.now()}));}catch(e){}
}
function forecastHealth(){
 var data=state.weather,modelEpoch=forecastModelEpoch(data),age=modelEpoch===null?Infinity:Date.now()-modelEpoch;
 var pill=$("forecast-health-pill"),kind="checking",title="Checking the weather forecast…",detail="Numerical weather model; not direct observations";
 if(!data){
  kind=state.weatherFetchFailed?"failed":"checking";
  title=state.weatherFetchFailed?"Forecast unavailable":"Retrieving model forecast…";
  detail=state.weatherFetchFailed?"No verified weather data available for this location. Try again or check BOM.":"Open-Meteo · Numerical forecast data";
 }else{
  var old=age>90*60000,delayed=age>55*60000;
  kind=state.weatherCached?"cached":state.weatherFetchFailed?"failed":old?"stale":delayed?"delayed":"recent";
  title=state.weatherCached?"CACHED FORECAST — not newly verified":
   state.weatherFetchFailed?"UPDATE FAILED — previous forecast shown":
   old?"OLD MODEL TIME — check official sources":
   delayed?"DELAYED MODEL TIME":"FORECAST DATA AVAILABLE";
  detail="Open-Meteo model estimate · "+(Number.isFinite(age)?Math.max(0,Math.round(age/60000))+" min since model valid time":"model time unavailable")+
   (state.weatherFetchFailed?" · Latest refresh unsuccessful":"")+
   (state.weatherCached?" · Stored locally on this device":"")+
   " · Not a weather-station observation";
 }
 if(pill){pill.className="forecast-health-pill "+kind;pill.textContent=kind==="recent"?"MODEL DATA":kind==="delayed"?"DELAYED":kind==="stale"?"STALE":kind==="cached"?"CACHED":kind==="failed"?"CHECK FAILED":"CHECKING";}
 setText("forecast-health-title",title);
 setText("forecast-health-detail",detail);
 setText("forecast-model-time",data&&modelEpoch!==null?localClock(data.current.time)+" "+forecastLocalZone(data):"—");
 setText("forecast-checked-time",state.weatherFetchedAt?forecastFetchedClock(data,state.weatherFetchedAt):"—");
}
function forecastHours(data){
 var h=data&&data.hourly||{},times=h.time||[],now=data.current&&data.current.time;
 var start=times.findIndex(function(t){return typeof t==="string"&&now&&t.slice(0,13)>now.slice(0,13);});
 if(start<0)start=0;
 return {h:h,start:start,times:times.slice(start,start+24)};
}
function forecastSixHours(data){
 var range=forecastHours(data),h=range.h,start=range.start,end=Math.min(start+6,(h.time||[]).length);
 var indices=Array.from({length:Math.max(0,end-start)},function(_,i){return i+start;});
 function validValues(key){return indices.map(function(i){return forecastFinite((h[key]||[])[i]);}).filter(function(v){return v!==null;});}
 var p=validValues("precipitation_probability"),mm=validValues("precipitation"),gust=validValues("wind_gusts_10m"),temps=validValues("temperature_2m");
 var max=function(arr){return arr.length?Math.max.apply(null,arr):null;},min=function(arr){return arr.length?Math.min.apply(null,arr):null;};
 var tempString=temps.length?forecastDisplay(min(temps),0,"°")+"–"+forecastDisplay(max(temps),0,"°C"):"—";
 var values=[p.length?forecastDisplay(max(p),0,"%"):"—",mm.length?forecastDisplay(mm.reduce(function(a,b){return a+b;},0),1," mm"):"—",
 gust.length?forecastDisplay(max(gust),0," km/h"):"—",tempString];
 var names=["rain-chance","rain-mm","gust","temps"];
 names.forEach(function(name,i){setText("overview-next-"+name,values[i]);setText("forecast-next-"+name,values[i]);});
 setText("forecast-brief-period",range.times.length?localClock(range.times[0])+" – "+localClock(range.times[Math.min(5,range.times.length-1)]):"Hourly data unavailable");
}
function forecastChartRender(){
 if(!$("temp-chart")||!state.weather)return;
 var m=state.forecastChartMode,mapping={
  temperature:{field:"temperature_2m",title:"24-Hour Temperature Trend",subtitle:"Hourly model estimate · °C"},
  rain:{field:"precipitation_probability",title:"24-Hour Rain Probability",subtitle:"Hourly probability · % · not measured rainfall"},
  wind:{field:"wind_gusts_10m",title:"24-Hour Wind Gust Forecast",subtitle:"Hourly modelled gusts · km/h"}
 };
 var config=mapping[m]||mapping.temperature,range=forecastHours(state.weather),h=range.h;
 createChart(range.times,(h[config.field]||[]).slice(range.start,range.start+24),m);
 setText("forecast-chart-title",config.title);setText("forecast-chart-subtitle",config.subtitle);
 document.querySelectorAll("[data-forecast-chart]").forEach(function(el){
  var active=el.dataset.forecastChart===m;el.classList.toggle("active",active);el.setAttribute("aria-pressed",String(active));
 });
}
function forecastHourlyRender(){
 if(!$("hourly-list")||!state.weather)return;
 var range=forecastHours(state.weather),h=range.h,start=range.start;
 $("hourly-list").innerHTML=range.times.map(function(t,i){
  var idx=start+i,condition=weatherMeta((h.weather_code||[])[idx],(h.is_day||[])[idx]===1),p=forecastFinite((h.precipitation_probability||[])[idx]),
  rain=forecastFinite((h.precipitation||[])[idx]),gust=forecastFinite((h.wind_gusts_10m||[])[idx]);
  return '<div class="hour-cell" aria-label="'+esc(localDay(t)+" "+localClock(t)+": "+condition[0])+'"><small>'+
  esc(i===0?"Next · "+localClock(t):localClock(t))+'</small><span class="hour-icon" aria-hidden="true">'+condition[1]+'</span>'+
  '<strong>'+forecastDisplay((h.temperature_2m||[])[idx],0,"°")+'</strong>'+
  '<span class="hour-rain">☂ Chance '+(p===null?"—":Math.round(p)+"%")+'</span>'+
  '<span class="hour-secondary">Rain '+forecastDisplay(rain,1," mm")+'</span>'+
  '<span class="hour-secondary">Gust '+forecastDisplay(gust,0," km/h")+'</span></div>';
 }).join("");
 if(!range.times.length)$("hourly-list").textContent="Hourly forecast temporarily unavailable.";
}
function forecastDayDetails(){
 if(!$("forecast-day-details")||!state.weather)return;
 var d=state.weather.daily||{},i=Math.max(0,Math.min((d.time||[]).length-1,state.forecastDayIndex||0)),date=(d.time||[])[i];
 if(!date)return;
 var met=weatherMeta((d.weather_code||[])[i],true),h=state.weather.hourly||{},chance=dailyRainChance(d,h,i);
 var fields=[
  ["High",forecastDisplay((d.temperature_2m_max||[])[i],0,"°C")],
  ["Low",forecastDisplay((d.temperature_2m_min||[])[i],0,"°C")],
  ["Highest hourly rain chance",chance===null?"—":forecastDisplay(chance,0,"%")],
  ["Forecast precipitation",forecastDisplay((d.precipitation_sum||[])[i],1," mm")],
  ["Maximum wind gust",forecastDisplay((d.wind_gusts_10m_max||[])[i],0," km/h")],
  ["Peak UV index",forecastDisplay((d.uv_index_max||[])[i],1,"")],
  ["Sunrise",localClock((d.sunrise||[])[i])],
  ["Sunset",localClock((d.sunset||[])[i])]
 ];
 $("forecast-day-details").innerHTML='<h4>'+esc(localDay(date))+' · '+esc(met[0])+'</h4><p>Model-based outlook for this date. Daily totals and probabilities are estimates and may change.</p>'+
 '<div class="forecast-day-metrics">'+fields.map(function(f){return '<div><span>'+esc(f[0])+'</span><strong>'+esc(f[1])+'</strong></div>';}).join("")+'</div>';
 document.querySelectorAll("[data-forecast-day]").forEach(function(el){var active=Number(el.dataset.forecastDay)===i;el.setAttribute("aria-pressed",String(active));});
}
function forecastDailyRender(){
 if(!$("daily-list")||!state.weather)return;
 var d=state.weather.daily||{},h=state.weather.hourly||{};
 $("daily-list").innerHTML=(d.time||[]).slice(0,7).map(function(t,i){
  var info=weatherMeta((d.weather_code||[])[i],true),rain=forecastFinite((d.precipitation_sum||[])[i]),chance=dailyRainChance(d,h,i);
  return '<button type="button" class="day" data-forecast-day="'+i+'" aria-pressed="'+(i===state.forecastDayIndex?'true':'false')+'" aria-label="'+esc(localDay(t)+" forecast details")+'">'+
  '<small>'+esc(i===0?"Today":localDay(t))+'</small><span class="day-icon" aria-hidden="true">'+info[1]+'</span>'+
  '<strong>'+forecastDisplay((d.temperature_2m_max||[])[i],0,"°")+' <span class="min">'+forecastDisplay((d.temperature_2m_min||[])[i],0,"°")+'</span></strong>'+
  '<span class="rain">☂ '+(rain===null?"—":forecastDisplay(rain,1," mm"))+'</span><span class="rain-chance">Peak hourly rain '+(chance===null?"—":forecastDisplay(chance,0,"%"))+'</span></button>';
 }).join("");
 $("daily-list").querySelectorAll("[data-forecast-day]").forEach(function(btn){
  btn.addEventListener("click",function(){state.forecastDayIndex=Number(btn.dataset.forecastDay);forecastDayDetails();});
 });
 forecastDayDetails();
}
function forecastClear(){
 ["current-temp","current-description","feels-like","today-high","today-low","current-date","current-clock",
 "wind-speed","wind-gust","humidity","uv-index","uv-description","rain-total","today-rain","forecast-update",
 "detail-dewpoint","detail-pressure","detail-wind-direction","detail-cloud-cover","detail-sunrise","detail-sunset",
 "tomorrow-date","tomorrow-condition","tomorrow-min","tomorrow-max","tomorrow-rain-chance","tomorrow-rain-amount",
 "tomorrow-gust","tomorrow-uv","tomorrow-narrative",
 "overview-next-rain-chance","overview-next-rain-mm","overview-next-gust","overview-next-temps",
 "forecast-next-rain-chance","forecast-next-rain-mm","forecast-next-gust","forecast-next-temps","forecast-brief-period"]
 .forEach(function(id){setText(id,"—");});
 ["temp-chart","chart-labels","hourly-list","daily-list","forecast-day-details"].forEach(function(id){
  if($(id))$(id).textContent="Loading model forecast…";
 });
}
function forecastRender(data){
 var c=data.current||{},d=data.daily||{},h=data.hourly||{},meta=weatherMeta(c.weather_code,c.is_day===1);
 setText("current-temp",num(c.temperature_2m));setText("current-description",meta[0]);setText("weather-symbol",meta[1]);
 setText("feels-like","Feels like "+forecastDisplay(c.apparent_temperature,0,"°C"));
 setText("today-high",forecastValue(d.temperature_2m_max,0,0,"°"));
 setText("today-low",forecastValue(d.temperature_2m_min,0,0,"°"));
 setText("current-date",localDay(c.time));
 setText("current-clock","Modelled conditions in "+state.location.name+" · valid at "+localClock(c.time)+" "+forecastLocalZone(data));
 setText("wind-speed",forecastDisplay(c.wind_speed_10m,0," km/h"));
 setText("wind-gust","Modelled gusts "+forecastDisplay(c.wind_gusts_10m,0," km/h"));
 setText("humidity",forecastDisplay(c.relative_humidity_2m,0,"%"));
 var uv=forecastFinite((d.uv_index_max||[])[0]);
 setText("uv-index",uv===null?"—":forecastDisplay(uv,0,""));
 setText("uv-description",uv===null?"Today's estimated peak":uv>=11?"Extreme · Predicted daily peak":uv>=8?"Very High · Predicted daily peak":uv>=6?"High · Predicted daily peak":uv>=3?"Moderate · Predicted daily peak":"Low · Predicted daily peak");
 setText("rain-total",forecastValue(d.precipitation_sum,0,1,"mm"));
 var rainChance=dailyRainChance(d,h,0);
 setText("today-rain",rainChance===null?"—":Math.round(rainChance)+"%");
 setText("forecast-update",localClock(c.time));
 setText("detail-dewpoint",forecastDisplay(c.dew_point_2m,1,"°C"));
 setText("detail-pressure",forecastDisplay(c.pressure_msl,1," hPa"));
 setText("detail-wind-direction",c.wind_direction_10m==null?"—":degreeBearing(c.wind_direction_10m));
 setText("detail-cloud-cover",forecastDisplay(c.cloud_cover,0,"%"));
 setText("detail-sunrise",localClock((d.sunrise||[])[0]));
 setText("detail-sunset",localClock((d.sunset||[])[0]));
 showTomorrow(data);updateOfficialStation();
 forecastSixHours(data);forecastHourlyRender();forecastDailyRender();forecastChartRender();forecastHealth();
}

function degreeBearing(value){var n=Number(value);if(!Number.isFinite(n))return "—";var labels=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];return labels[Math.round((n%360)/22.5)%16]+" · "+Math.round(n)+"°";}
function localClock(iso){if(!iso||typeof iso!=="string"||!iso.includes("T"))return "—";var h=Number(iso.slice(11,13)),m=iso.slice(14,16);if(!Number.isFinite(h))return "—";return (h%12||12)+":"+m+" "+(h>=12?"pm":"am");}
function localDay(iso){if(!iso)return "—";return formatDate(iso.slice(0,10)+"T12:00:00Z",{weekday:"long",day:"numeric",month:"short",timeZone:"UTC"});}
function forecastValue(arr,index,digits,suffix){if(!Array.isArray(arr)||arr[index]===null||arr[index]===undefined||!Number.isFinite(Number(arr[index])))return "—";return Number(arr[index]).toFixed(digits)+" "+(suffix||"");}
function dailyRainChance(day,hourly,index){var p=day.precipitation_probability_max;if(Array.isArray(p)&&p[index]!=null&&Number.isFinite(Number(p[index])))return Number(p[index]);var date=(day.time||[])[index],vals=(hourly.time||[]).map(function(t,i){
 var v=(hourly.precipitation_probability||[])[i];
 return t&&t.slice(0,10)===date&&v!=null&&Number.isFinite(Number(v))?Number(v):NaN;
}).filter(Number.isFinite);return vals.length?Math.max.apply(null,vals):null;}
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
var link=$("official-observation-link");if(!link)return;if(nearCessnock){setText("official-station-name","Cessnock Airport AWS · Bureau of Meteorology");setText("official-observation-description","Access official readings from Cessnock Airport, including measured temperature, pressure, dew point, wind and rainfall since 9 am. Observations are not the same as the model estimates above.");link.href="https://www.bom.gov.au/products/IDN60801/IDN60801.95771.shtml";link.innerHTML='Open Cessnock Airport Observations <span aria-hidden="true">↗</span>';}
else{setText("official-station-name","Bureau of Meteorology · Australian Observations");setText("official-observation-description","Find a relevant official weather station near "+p.name+" on the Bureau website. Observations vary by station and may be different from model forecasts.");link.href="https://www.bom.gov.au/places/";link.innerHTML='Find Official Weather Observations <span aria-hidden="true">↗</span>';}}
async function loadWeather(){
 var loc=state.location,key=forecastLocationKey(loc),seq=++state.weatherSeq;
 var changed=state.weatherLocationKey!==key;
 if(changed){
  state.weather=null;state.weatherFetchedAt=0;state.weatherCached=false;state.weatherFetchFailed=false;
  state.weatherLocationKey=key;state.forecastDayIndex=0;forecastClear();
  var prior=forecastCacheRead(key);
  if(prior){state.weather=prior.data;state.weatherFetchedAt=prior.checkedAt;state.weatherCached=true;forecastRender(prior.data);}
 }
 updateWeatherStatus("Checking Model Forecast",false);
 if($("forecast-retry"))$("forecast-retry").disabled=true;
 forecastHealth();
 var q=new URLSearchParams({
  latitude:loc.lat,longitude:loc.lon,
  current:"temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,is_day,pressure_msl,cloud_cover,dew_point_2m",
  hourly:"temperature_2m,precipitation_probability,precipitation,weather_code,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,is_day",
  daily:"weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max",
  timezone:"auto",forecast_days:"7"
 });
 try{
  var data=forecastValidate(await getJSON("https://api.open-meteo.com/v1/forecast?"+q.toString(),15000));
  if(seq!==state.weatherSeq||key!==forecastLocationKey(state.location))return;
  state.weather=data;state.weatherCached=false;state.weatherFetchFailed=false;state.weatherFetchedAt=Date.now();
  forecastCacheWrite(key,data);forecastRender(data);
  updateWeatherStatus("Model Forecast Available",false);
 }catch(e){
  if(seq!==state.weatherSeq||key!==forecastLocationKey(state.location))return;
  state.weatherFetchFailed=true;updateWeatherStatus("Forecast Update Failed",true);
  if(!state.weather){
   forecastClear();forecastHealth();
   setText("current-description","Current model estimate unavailable");
   setText("tomorrow-narrative","Forecast could not be verified. Check the official Bureau of Meteorology forecast and warnings.");
  }else forecastHealth();
  message("Weather update failed. Any previous model values are labelled as unverified.");
  console.warn("SkyPulse forecast",e);
 }finally{
  if(seq===state.weatherSeq&&$("forecast-retry"))$("forecast-retry").disabled=false;
 }
}

function km(lat1,lon1,lat2,lon2){var rad=Math.PI/180,a=Math.sin((lat2-lat1)*rad/2)**2+Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin((lon2-lon1)*rad/2)**2;return 12742*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
function coordinatesOf(feature){var g=feature.geometry||{};if(g.type==="GeometryCollection"&&Array.isArray(g.geometries)){var pt=g.geometries.find(function(x){return x&&x.type==="Point"&&Array.isArray(x.coordinates);});if(pt)return [Number(pt.coordinates[1]),Number(pt.coordinates[0])];g=g.geometries.find(function(x){return x&&Array.isArray(x.coordinates);})||g;}var c=g.coordinates;if(!c)return null;if(g.type==="Point"&&c.length>=2)return [Number(c[1]),Number(c[0])];var points=[];function walk(x){if(!Array.isArray(x))return;if(x.length>=2&&typeof x[0]==="number"&&typeof x[1]==="number"){points.push(x);return;}x.forEach(walk);}walk(c);if(!points.length)return null;return [points.reduce(function(a,v){return a+v[1];},0)/points.length,points.reduce(function(a,v){return a+v[0];},0)/points.length];}
function incidentDetailValue(feature,key,fallback){
 var p=feature&&feature.properties||{},details=p.details&&typeof p.details==="object"&&!Array.isArray(p.details)?p.details:{};
 var v=details[key];
 if((v==null||String(v).trim()==="")&&fallback)v=p[fallback];
 if(v===undefined||v===null)return "";
 var text=String(v).trim();
 return text&&text.toLowerCase()!=="null"&&text.toLowerCase()!=="undefined"?text.slice(0,260):"";
}
function incidentAlertLevel(feature){
 var p=feature&&feature.properties||{},label=incidentDetailValue(feature,"alert_level")||
  String(p.category||p["alert-level"]||p.alertLevel||p.alert||"").trim();
 if(/emergency warning/i.test(label))return "Emergency Warning";
 if(/watch\s*(?:and|&)\s*act/i.test(label))return "Watch and Act";
 if(/^advice$/i.test(label))return "Advice";
 if(/not applicable/i.test(label))return "Not Applicable";
 return "Unspecified";
}
function incidentAlertStyle(feature){
 var level=incidentAlertLevel(feature);
 return {level,
  color:level==="Emergency Warning"?"#e9555c":level==="Watch and Act"?"#ed8c41":
  level==="Advice"?"#e1b74f":"#9aabc2",
  cls:level==="Emergency Warning"?"emergency":level==="Watch and Act"?"watch":level==="Advice"?"advice":"other"};
}
function incidentLastUpdated(feature){
 var p=feature&&feature.properties||{},details=p.details&&typeof p.details==="object"?p.details:{};
 if(details.updated_at){
  var time=new Date(details.updated_at).getTime();
  if(Number.isFinite(time))return hazardPublished(details.updated_at);
 }
 var source=incidentDetailValue(feature,"updated","updated");
 if(source)return source+" (as published, NSW local time)";
 var published=String(p.pubDate||"");
 if(published)return "Publication: "+published.slice(0,90)+" (not necessarily last updated)";
 return "Incident update time not supplied";
}
function incidentDetailRows(feature){
 var fields=[
  ["Alert level",incidentAlertLevel(feature)],
  ["Location",incidentDetailValue(feature,"location","location")],
  ["Council area",incidentDetailValue(feature,"council_area")],
  ["Status",incidentDetailValue(feature,"status","status")],
  ["Incident type",incidentDetailValue(feature,"incident_type","type")],
  ["Fire",incidentDetailValue(feature,"fire","fire")],
  ["Size",incidentDetailValue(feature,"size","size")],
  ["Responsible agency",incidentDetailValue(feature,"responsible_agency","responsibleAgency")],
  ["Incident updated",incidentLastUpdated(feature)]
 ];
 return fields.filter(function(pair){return pair[1]&&pair[1]!=="Unspecified";}).map(function(pair){
  return '<div class="incident-detail-row"><dt>'+esc(pair[0])+'</dt><dd>'+esc(pair[1])+'</dd></div>';
 }).join("");
}
function incidentDetailList(feature){
 return '<dl class="incident-detail-list">'+incidentDetailRows(feature)+'</dl>';
}
function incidentCompactFacts(feature){
 var status=incidentDetailValue(feature,"status","status"),size=incidentDetailValue(feature,"size","size"),
  location=incidentDetailValue(feature,"location","location"),type=incidentDetailValue(feature,"incident_type","type");
 return [['Status',status],['Size',size],['Location',location],['Type',type]]
  .filter(function(item){return !!item[1];})
  .map(function(item){return '<span><b>'+esc(item[0])+':</b> '+esc(item[1])+'</span>';}).join("");
}

function incidentTitle(f){var p=f.properties||{},v=String(p.title||p.name||p.incidentName||p.eventName||"Mapped RFS Incident").trim();var alpha=v.replace(/[^a-zA-Z]/g,"");if(alpha.length>4&&alpha.replace(/[^A-Z]/g,"").length/alpha.length>.84)v=v.toLowerCase().replace(/\b[a-z]/g,function(s){return s.toUpperCase();}).replace(/\b(NSW|RFS|SES|BOM|ACT|HR|CFA)\b/gi,function(s){return s.toUpperCase();});return v;}
function incidentUrl(f){var p=f.properties||{},fallback="https://www.rfs.nsw.gov.au/fire-information/fires-near-me";try{var u=new URL(String(p.link||p.url||p.web||""));if(u.hostname==="rfs.nsw.gov.au"||u.hostname==="www.rfs.nsw.gov.au"){u.protocol="https:";return u.href;}return fallback;}catch(e){return fallback;}}
function incidentId(f,i){var p=f.properties||{};return String(f.id||p.guid||p.id||p.link||incidentTitle(f)+"-"+i);}
function snapshotIncidentStatus(){var box=$("snapshot-incidents");if(!box)return;if(!state.lastIncidentFetch){box.textContent="Feed Unavailable — Check NSW RFS Directly";return;}
var near=state.incidents.map(function(f){var pt=coordinatesOf(f);return pt?km(state.location.lat,state.location.lon,pt[0],pt[1]):Infinity;}).filter(function(dist){return Number.isFinite(dist)&&dist<=state.radius;});
var age=Date.now()-new Date(state.lastIncidentFetch).getTime();
box.textContent=(age>DATA_MAX_AGE?"Feed May Be Stale · ":"")+near.length+" Mapped Within "+state.radius+" km · See Official Advice";}


function fireDirectorySortScore(feature){
 var value=incidentDetailValue(feature,"updated_at")||
   (feature.properties||{}).pubDate||(feature.properties||{}).updated||"";
 var t=Date.parse(value);return Number.isFinite(t)?t:0;
}
function fireDirectorySeverity(level){
 if(level==="Emergency Warning")return 3;
 if(level==="Watch and Act")return 2;
 if(level==="Advice")return 1;
 return 0;
}
function fireDirectoryEntryTime(feature){
 var value=incidentDetailValue(feature,"updated_at");
 if(value)return hazardPublished(value);
 var stamp=incidentDetailValue(feature,"updated","updated");
 return stamp||"Not published";
}
function fireDirectoryItems(){
 var search=state.fireDirectoryQuery.toLowerCase().trim(),scope=state.fireDirectoryScope,
     sort=state.fireDirectorySort,loc=state.location,
     typeFilter=state.fireDirectoryType,levelFilter=state.fireDirectoryLevel;
 if(state.fireDirectoryMode==="warnings"){
  if(!state.warningsFresh)return [];
  var warnings=state.rfsAlerts.map(function(a,i){
   return {kind:"warning",index:i,alert:a,title:String(a.headline||a.event||"NSW RFS Warning"),
    level:hazardLevel(a),area:Array.isArray(a.area_names)?a.area_names.join(", "):"",
    distance:Infinity,updated:Date.parse(a.sent||"")||0,
    searchable:([a.headline,a.event,(a.area_names||[]).join(" "),a.instruction,hazardLevel(a)].join(" ")).toLowerCase()};
  }).filter(function(a){
   return (!search||a.searchable.includes(search))&&(levelFilter==="all"||a.level===levelFilter);
  });
  return warnings.sort(function(a,b){
   return sort==="severity"?fireDirectorySeverity(b.level)-fireDirectorySeverity(a.level)||b.updated-a.updated:
    b.updated-a.updated;
  });
 }
 if(!state.incidentsFresh)return [];
 var incidents=state.incidents.map(function(f,i){
  var p=coordinatesOf(f),distance=p?km(loc.lat,loc.lon,p[0],p[1]):Infinity;
  var name=incidentTitle(f),level=incidentAlertLevel(f),updated=fireDirectorySortScore(f);
  var location=incidentDetailValue(f,"location","location"),area=incidentDetailValue(f,"council_area");
  return {kind:"incident",index:i,feature:f,title:name,level,distance,updated,
   searchable:([name,level,location,area,incidentDetailValue(f,"status","status"),incidentDetailValue(f,"incident_type","type")].join(" ")).toLowerCase()};
 }).filter(function(a){
  return (scope==="statewide"||hazardNearbyIncident(a.feature))&&
    (!search||a.searchable.includes(search))&&
    (typeFilter==="all"||fireIncidentKind(a.feature)===typeFilter)&&
    (levelFilter==="all"||a.level===levelFilter);
 });
 incidents.sort(function(a,b){
  if(sort==="severity")return fireDirectorySeverity(b.level)-fireDirectorySeverity(a.level)||a.distance-b.distance;
  if(sort==="updated")return b.updated-a.updated||a.distance-b.distance;
  return a.distance-b.distance;
 });
 return incidents;
}
// All incident/alert artwork is local SVG, not external agency branding.
const FIRE_ICONS={
 fire:'<path d="M12 22c5 0 8-3.8 8-8 0-3.2-2.1-5.8-4-7-.2 3-2 3.7-2 3.7C14.6 5.6 12 2 9.7 1 10 6.4 4 8.8 4 14a8 8 0 0 0 8 8Z"/><path d="M12 20a3.5 3.5 0 0 0 3.5-3.5c0-1.4-.7-2.6-1.9-3.4.1 1.5-.8 2-1.2 2.2-.2-1.5-1-2.8-2-3.2.2 1.8-1.9 2.9-1.9 4.4A3.5 3.5 0 0 0 12 20Z"/>',
 grass:'<path d="M4 21v-5l3.2 3M9 21l1.5-7.5L13 18l2.5-8L19 21"/><path d="M15 2c1 3-2 3.8-1.5 6.6 2-1 3-2.5 2.7-4.3 2.4 2.3 3.3 4.1 2.1 6.2-1 2-3.4 2.6-5.4 1.6-3.9-1.9-2.8-5.9 2.1-9.1Z"/>',
 hazmat:'<path d="M12 3 2 21h20L12 3Z"/><circle cx="12" cy="13" r="1.8"/><path d="M11.3 11.3 9.4 8.4M12.7 11.3l1.9-2.9M10 15l-2.7 1.2M14 15l2.7 1.2"/>',
 flood:'<path d="M4 9 12 3l8 6v4H4V9Z"/><path d="M2 17c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M2 21c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/>',
 storm:'<path d="M6.5 17H6a4 4 0 0 1-.2-8 6.5 6.5 0 0 1 12.6 1A3.5 3.5 0 0 1 18 17h-.5"/><path d="m13 11-4 6h4l-2 5 6-8h-4l2-3"/>',
 road:'<path d="m9 3-5 18M15 3l5 18M12 4v4m0 4v3m0 4v2"/><path d="M4 21h16"/>',
 rescue:'<circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/>',
 incident:'<path d="M12 22s7-6.9 7-12A7 7 0 0 0 5 10c0 5.1 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/>',
 location:'<path d="M12 22s7-7.1 7-12A7 7 0 1 0 5 10c0 4.9 7 12 7 12Z"/><circle cx="12" cy="10" r="3"/>',
 advice:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.3"/>',
 watch:'<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3v.2"/>',
 emergency:'<path d="m12 2 3.2 3.2h4.6v4.6L23 13l-3.2 3.2v4.6h-4.6L12 24l-3.2-3.2H4.2v-4.6L1 13l3.2-3.2V5.2h4.6L12 2Z"/><path d="M12 8v7m0 3v.3"/>',
 perimeter:'<path d="m3 8 8-5 9 4 1 10-9 4-9-5V8Z" stroke-dasharray="3 3"/><path d="m11 3 1 8 9 6"/>',
 zone:'<path d="M4 5h16v14H4z" stroke-dasharray="3 2"/><path d="m8 10 3-3 5 5-3 5-5-2z"/>',
 radius:'<circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/><circle cx="12" cy="12" r="3"/>'
};
function fireIconSvg(kind){
 return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'+(FIRE_ICONS[kind]||FIRE_ICONS.incident)+'</svg>';
}
function fireIncidentKind(feature){
 var raw=incidentDetailValue(feature,"incident_type","type")||incidentTitle(feature),type=String(raw).toLowerCase();
 if(/grass|vegetation|scrub|crop|stubble/.test(type)&&/fire|burn|grass|vegetation/.test(type))return "grass";
 if(/bush\s*fire|wildfire|forest\s*fire|structure\s*fire|house\s*fire|vehicle\s*fire|fire|burning/.test(type))return "fire";
 if(/hazard|hazmat|chemical|toxic|spill|gas leak/.test(type))return "hazmat";
 if(/flood|flash\s*water/.test(type))return "flood";
 if(/storm|wind\s*damage|thunder|lightning/.test(type))return "storm";
 if(/road|traffic|collision|crash|motorway/.test(type))return "road";
 if(/rescue|medical/.test(type))return "rescue";
 return "incident";
}
function fireIncidentKindLabel(kind){
 return {fire:"Fire Incident",grass:"Grass or Vegetation Fire",hazmat:"Hazardous Materials",flood:"Flood Incident",
  storm:"Storm Incident",road:"Road Incident",rescue:"Rescue Incident",incident:"Reported Incident",location:"Selected Location"}[kind]||"Reported Incident";
}
function fireWarningIconKind(level){
 return level==="Emergency Warning"?"emergency":level==="Watch and Act"?"watch":level==="Advice"?"advice":"watch";
}
function fireIconBadge(kind,level,label){
 var cls=level==="Emergency Warning"?"emergency":level==="Watch and Act"?"watch":level==="Advice"?"advice":"other";
 return '<span class="fire-symbol fire-symbol-'+esc(kind)+' fire-symbol-'+cls+'" role="img" aria-label="'+esc(label||fireIncidentKindLabel(kind))+'">'+fireIconSvg(kind)+'</span>';
}
function fireLeafletMarkerIcon(kind,level,label,featureKind,index){
 var cls=level==="Emergency Warning"?"emergency":level==="Watch and Act"?"watch":level==="Advice"?"advice":kind==="location"?"location":"other";
 return L.divIcon({className:"fire-leaflet-icon",iconSize:[32,39],iconAnchor:[16,36],popupAnchor:[0,-35],
  html:'<span class="fire-map-pin fire-map-pin-'+esc(cls)+' fire-map-pin-'+esc(kind)+'" '+
   (featureKind?'data-fire-marker-kind="'+esc(featureKind)+'" data-fire-marker-index="'+Number(index)+'" ':'')+
   'role="img" aria-label="'+esc(label)+'"><span class="fire-map-pin-body">'+fireIconSvg(kind)+'</span><span class="fire-map-pin-point"></span></span>'});
}
// Lightweight, dependency-free clustering in projected Web Mercator pixels.
// Grouping only changes how published point markers are presented; it does NOT
// alter NSW RFS coordinates, incident lists, warnings or fire-area boundaries.
const FIRE_CLUSTER_PIXEL_RADIUS=43;
const FIRE_CLUSTER_BREAK_ZOOM=13;
function fireClusterPoint(latlng,zoom){
 var lat=Math.max(-85.05112878,Math.min(85.05112878,Number(latlng[0])));
 var lng=Number(latlng[1]),sin=Math.sin(lat*Math.PI/180),scale=256*Math.pow(2,zoom);
 return {x:(lng+180)/360*scale,y:(.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*scale};
}
function fireClusterGroups(entries,zoom){
 if(!Number.isFinite(zoom)||zoom>=FIRE_CLUSTER_BREAK_ZOOM)
  return entries.map(function(item){return {members:[item],point:item.point.slice()};});
 var groups=[],bins=new Map(),size=FIRE_CLUSTER_PIXEL_RADIUS;
 entries.forEach(function(item){
  var xy=fireClusterPoint(item.point,zoom),cellX=Math.floor(xy.x/size),cellY=Math.floor(xy.y/size),best=null,bestDistance=size*size;
  for(var a=-1;a<=1;a++)for(var b=-1;b<=1;b++){
   (bins.get((cellX+a)+":"+(cellY+b))||[]).forEach(function(group){
    var dx=xy.x-group.x,dy=xy.y-group.y,d=dx*dx+dy*dy;
    if(d<bestDistance){best=group;bestDistance=d;}
   });
  }
  if(best){
   best.members.push(item);
   // Retain the original centroid for a stable visual grouping as further entries arrive.
   // Zooming to a group always uses the source members, not this approximation.
   var count=best.members.length;
   best.point[0]+=(item.point[0]-best.point[0])/count;
   best.point[1]+=(item.point[1]-best.point[1])/count;
  }else{
   var group={members:[item],point:item.point.slice(),x:xy.x,y:xy.y};
   groups.push(group);
   var key=cellX+":"+cellY,items=bins.get(key)||[];
   items.push(group);bins.set(key,items);
  }
 });
 return groups;
}
function fireClusterSeverity(members){
 var best="Unspecified",rank=0,weights={"Advice":1,"Watch and Act":2,"Emergency Warning":3};
 members.forEach(function(entry){
  var level=incidentAlertLevel(entry.feature),value=weights[level]||0;
  if(value>rank){rank=value;best=level;}
 });
 return best;
}
function fireClusterIcon(group){
 var level=fireClusterSeverity(group.members),cls=level==="Emergency Warning"?"emergency":
  level==="Watch and Act"?"watch":level==="Advice"?"advice":"other";
 var selected=state.fireSelected&&state.fireSelected.kind==="incident"&&
  group.members.some(function(m){return m.index===state.fireSelected.index;});
 var ids=group.members.map(function(m){return m.index;}).join(",");
 var title=group.members.length+" published incident locations grouped. Highest alert level: "+level+
  ". Select to zoom into individual markers.";
 return L.divIcon({className:"fire-leaflet-cluster-icon",iconSize:[38,38],iconAnchor:[19,19],
  html:'<span class="fire-map-cluster fire-map-cluster-'+cls+(selected?' is-selected':'')+
   '" data-fire-cluster-members="'+ids+'" role="img" aria-label="'+esc(title)+'">'+
   '<span class="fire-map-cluster-count">'+group.members.length+'</span></span>'});
}
function fireZoomCluster(map,group){
 if(!map||!group||!group.members.length)return;
 // A count badge is a zoom control, not an incident. Clear any old inspector
 // so previously selected information is not mistaken for this group.
 if(map===state.hazardMap&&state.fireSelected)fireCloseSelection();
 var zoom=Number(map.getZoom()),next=Math.min(FIRE_CLUSTER_BREAK_ZOOM,zoom+2);
 if(!Number.isFinite(next)||next<=zoom)next=FIRE_CLUSTER_BREAK_ZOOM;
 map.setView(group.point,next,{animate:true});
 // Leaflet emits zoomend, which repaints the individual incidents/clusters.
}
function fireRenderIncidentPoints(map,layer,entries,selectionMode){
 if(!map||!layer)return;
 layer.clearLayers();
 var zoom=Number(map.getZoom()),groups=fireClusterGroups(entries,zoom);
 groups.forEach(function(group){
  if(group.members.length>1){
   var level=fireClusterSeverity(group.members);
   L.marker(group.point,{icon:fireClusterIcon(group),keyboard:true,riseOnHover:true,
    title:group.members.length+" grouped RFS incident locations; highest level "+level+". Select to zoom."})
    .on("click",function(){fireZoomCluster(map,group);})
    .addTo(layer);
   return;
  }
  var entry=group.members[0],feature=entry.feature,point=entry.point,level=incidentAlertStyle(feature);
  var marker=L.marker(point,{
   icon:fireLeafletMarkerIcon(fireIncidentKind(feature),level.level,incidentTitle(feature)+": "+level.level,
    selectionMode==="hazards"?"incident":null,entry.index),
   keyboard:true,riseOnHover:true,title:incidentTitle(feature)+" — "+level.level});
  if(selectionMode==="hazards"){
   marker.on("click",function(){fireSelectMapItem("incident",entry.index);});
  }else{
   marker.bindPopup(hazardIncidentPopup(feature));
  }
  marker.addTo(layer);
 });
 if(selectionMode==="hazards")syncFireMapSelection();
}
function renderFireIncidentMarkers(){
 if(!state.hazardMap||!state.hazardLayers)return;
 var entries=[];
 if(state.incidentsFresh&&hazardMapEnabled("fire-map-points")){
  state.incidents.slice(0,500).forEach(function(feature,index){
   var p=coordinatesOf(feature);
   if(p&&p.every(Number.isFinite))entries.push({feature,index,point:p});
  });
 }
 fireRenderIncidentPoints(state.hazardMap,state.hazardLayers.incidents,entries,"hazards");
}
function renderRadarIncidentMarkers(){
 if(!state.map||!state.markers)return;
 var entries=[];
 if(state.incidentsEnabled&&state.incidentsFresh){
  state.incidents.slice(0,500).forEach(function(feature,index){
   var p=coordinatesOf(feature);
   if(!p||!p.every(Number.isFinite))return;
   if(state.mapNearbyOnly&&km(state.location.lat,state.location.lon,p[0],p[1])>state.radius)return;
   entries.push({feature,index,point:p});
  });
 }
 fireRenderIncidentPoints(state.map,state.markers,entries,"radar");
}

function syncFireMapSelection(){
 var container=$("fire-area-map");if(!container)return;
 container.querySelectorAll("[data-fire-marker-kind]").forEach(function(node){
  node.classList.toggle("is-selected",!!state.fireSelected&&node.dataset.fireMarkerKind===state.fireSelected.kind&&
   Number(node.dataset.fireMarkerIndex)===state.fireSelected.index);
 });
 container.querySelectorAll("[data-fire-cluster-members]").forEach(function(node){
  node.classList.toggle("is-selected",!!state.fireSelected&&state.fireSelected.kind==="incident"&&
   node.dataset.fireClusterMembers.split(",").includes(String(state.fireSelected.index)));
 });
}

function fireDirectoryHTML(item){
 var level=item.level,
  colour=level==="Emergency Warning"?"emergency":level==="Watch and Act"?"watch":
   level==="Advice"?"advice":"other";
 var selected=state.fireSelected&&state.fireSelected.kind===item.kind&&state.fireSelected.index===item.index;
 var subtitle="",details="",time="";
 if(item.kind==="incident"){
  var f=item.feature,location=incidentDetailValue(f,"location","location")||
    incidentDetailValue(f,"council_area")||"Location details not published";
  subtitle=location;
  details=[
   incidentDetailValue(f,"status","status"),
   incidentDetailValue(f,"size","size"),
   Number.isFinite(item.distance)?"Approx. "+Math.round(item.distance)+" km":"Distance unknown"
  ].filter(Boolean).join(" · ");
  time="Updated: "+fireDirectoryEntryTime(f);
 }else{
  subtitle=item.area||"Affected area not provided in text";
  details=hazardWarningPolygons(item.alert).length?"Published mapped warning area":"Boundary not provided in feed";
  time="Issued: "+hazardPublished(item.alert.sent);
 }
 return '<button type="button" class="fire-directory-entry '+(selected?"is-active":"")+
  '" data-fire-dir-kind="'+item.kind+'" data-fire-dir-index="'+item.index+'" aria-pressed="'+(selected?"true":"false")+'">'+
  '<span class="fire-directory-entry-top">'+
  (item.kind==="warning"?fireIconBadge(fireWarningIconKind(level),level,level+" Warning"):
   fireIconBadge(fireIncidentKind(item.feature),level,fireIncidentKindLabel(fireIncidentKind(item.feature))))+
  '<strong>'+esc(item.title)+'</strong></span>'+
  '<span class="fire-directory-entry-area">'+esc(subtitle)+'</span>'+
  '<span class="fire-directory-entry-metrics"><span class="incident-alert-pill '+colour+'">'+esc(level)+'</span>'+
   '<span>'+esc(details)+'</span></span>'+
  '<span class="fire-directory-entry-updated">'+esc(time)+'</span>'+
  '</button>';
}
function renderFireDirectory(){
 var panel=$("fire-directory-list");if(!panel)return;
 var warnings=state.fireDirectoryMode==="warnings",ready=warnings?state.warningsFresh:state.incidentsFresh;
 var items=fireDirectoryItems();
 if($("fire-directory-incidents")){
  $("fire-directory-incidents").classList.toggle("active",!warnings);
  $("fire-directory-incidents").setAttribute("aria-selected",String(!warnings));
 }
 if($("fire-directory-warnings")){
  $("fire-directory-warnings").classList.toggle("active",warnings);
  $("fire-directory-warnings").setAttribute("aria-selected",String(warnings));
 }
 var count=$("fire-directory-total");
 if(count)count.textContent=ready?String(items.length):"—";
 if($("fire-directory-scope"))$("fire-directory-scope").disabled=warnings;
 var typeSelect=$("fire-directory-type"),levelSelect=$("fire-directory-level"),sortSelect=$("fire-directory-sort");
 if(typeSelect){typeSelect.value=state.fireDirectoryType;typeSelect.disabled=warnings;
  typeSelect.title=warnings?"Incident type filtering applies only to Incidents.":"Filter incident reports by type.";}
 if(levelSelect)levelSelect.value=state.fireDirectoryLevel;
 if(sortSelect){var nearest=sortSelect.querySelector('option[value="distance"]');
  if(nearest)nearest.textContent=warnings?"Latest Issued":"Nearest First";}
 var resetActive=!!state.fireDirectoryQuery||state.fireDirectoryScope!=="nearby"||
  state.fireDirectorySort!=="distance"||state.fireDirectoryType!=="all"||state.fireDirectoryLevel!=="all";
 var resetButton=$("fire-directory-clear");if(resetButton)resetButton.disabled=!resetActive;
 var filterStatus=$("fire-directory-filter-status");
 if(filterStatus)filterStatus.textContent=!ready?"Official reports unavailable — verify with NSW RFS":
  (items.length>250?"Showing first 250 of "+items.length:items.length+" matching")+
  (warnings?" warnings":" incident reports")+" · Map stays unfiltered";
 panel.innerHTML=!ready?
  '<div class="fire-directory-empty"><strong>Data unavailable or delayed</strong><p>The official feed cannot currently verify reports. Check NSW RFS directly.</p>'+
  '<a href="https://www.rfs.nsw.gov.au/fire-information/fires-near-me" target="_blank" rel="noopener">Open NSW RFS ↗</a></div>':
  items.length?items.slice(0,250).map(fireDirectoryHTML).join(""):
  '<div class="fire-directory-empty"><strong>No matching reports in this snapshot</strong><p>'+
   (resetActive?"Try resetting filters or changing your monitoring area.":"No mapped reports matched these filters. This is not an all-clear.")+
   '</p></div>';
 panel.querySelectorAll("[data-fire-dir-kind]").forEach(function(button){
  button.addEventListener("click",function(){
   var i=Number(button.dataset.fireDirIndex);
   if(button.dataset.fireDirKind==="incident")focusHazardIncident(i);
   else focusHazardWarning(i);
  });
 });
}
function fireSelectMapItem(kind,index){
 if(state.hazardMap&&typeof state.hazardMap.closePopup==="function")state.hazardMap.closePopup();
 var feature=kind==="incident"?state.incidents[index]:state.rfsAlerts[index];
 if(!feature)return;
 state.fireSelected={kind,index};
 state.fireDirectoryMode=kind==="warning"?"warnings":"incidents";
 if(kind==="incident"&&!hazardNearbyIncident(feature)){
  state.fireDirectoryScope="statewide";
  if($("fire-directory-scope"))$("fire-directory-scope").value="statewide";
 }
 if(!fireDirectoryItems().some(function(item){return item.kind===kind&&item.index===index;})){
  state.fireDirectoryQuery="";state.fireDirectoryType="all";state.fireDirectoryLevel="all";
  if($("fire-directory-search"))$("fire-directory-search").value="";
 }
 var pane=$("fire-map-selection"),body=$("fire-map-selection-body");
 if(pane&&body&&feature){
  setText("fire-map-selection-kind",kind==="warning"?"OFFICIAL NSW RFS WARNING":"NSW RFS INCIDENT DETAIL");
  if(kind==="incident"){
   var style=incidentAlertStyle(feature),status=incidentDetailValue(feature,"status","status");
   body.innerHTML='<div class="fire-map-selection-title">'+fireIconBadge(fireIncidentKind(feature),style.level,fireIncidentKindLabel(fireIncidentKind(feature)))+
    '<strong>'+esc(incidentTitle(feature))+'</strong>'+
    '<span class="incident-alert-pill '+style.cls+'">'+esc(style.level)+'</span></div>'+
    (status?'<div class="fire-map-selection-status">'+esc(status)+'</div>':"")+
    incidentDetailList(feature)+
    '<div class="fire-map-selection-note">Incident geometry is not an evacuation area or a live fire front. Check official instructions.</div>'+
    '<a class="fire-map-selection-official" href="'+esc(incidentUrl(feature))+'" target="_blank" rel="noopener">Open Official Incident ↗</a>';
  }else{
   var level=hazardLevelStyle(feature),names=Array.isArray(feature.area_names)?feature.area_names.join(", "):"";
   body.innerHTML='<div class="fire-map-selection-title">'+fireIconBadge(fireWarningIconKind(level.level),level.level,level.level+" warning")+
    '<strong>'+esc(feature.headline||feature.event||"RFS Warning")+'</strong>'+
    '<span class="incident-alert-pill '+level.cls.replace("aws-","")+'">'+esc(level.level)+'</span></div>'+
    (names?'<p class="fire-map-selection-status">Affected area: '+esc(names)+'</p>':"")+
    '<p class="fire-map-selection-issued">Issued: '+esc(hazardPublished(feature.sent))+'</p>'+
    (feature.instruction?'<div class="fire-map-selection-instructions"><strong>Published Instructions</strong><p>'+
      esc(String(feature.instruction).slice(0,1000))+'</p></div>':"")+
    '<p class="fire-map-selection-note">Warning geometry is not a burnt-area boundary. Read the full RFS message.</p>'+
    '<a class="fire-map-selection-official" href="'+hazardLink(feature)+'" target="_blank" rel="noopener">Official RFS Warning ↗</a>';
  }
  pane.hidden=false;
 }
 renderFireDirectory();syncFireMapSelection();
}
function fireCloseSelection(){
 state.fireSelected=null;
 var pane=$("fire-map-selection");if(pane)pane.hidden=true;
 renderFireDirectory();syncFireMapSelection();
}
function initFireDirectory(){
 on("fire-directory-incidents","click",function(){state.fireDirectoryMode="incidents";renderFireDirectory();});
 on("fire-directory-warnings","click",function(){state.fireDirectoryMode="warnings";renderFireDirectory();});
 on("fire-directory-search","input",function(e){state.fireDirectoryQuery=String(e.target.value||"").slice(0,90);renderFireDirectory();});
 on("fire-directory-scope","change",function(e){state.fireDirectoryScope=e.target.value;renderFireDirectory();});
 on("fire-directory-sort","change",function(e){state.fireDirectorySort=e.target.value;renderFireDirectory();});
 on("fire-directory-type","change",function(e){state.fireDirectoryType=e.target.value;renderFireDirectory();});
 on("fire-directory-level","change",function(e){state.fireDirectoryLevel=e.target.value;renderFireDirectory();});
 on("fire-directory-clear","click",function(){
  state.fireDirectoryScope="nearby";state.fireDirectorySort="distance";state.fireDirectoryQuery="";
  state.fireDirectoryType="all";state.fireDirectoryLevel="all";
  if($("fire-directory-search"))$("fire-directory-search").value="";
  if($("fire-directory-scope"))$("fire-directory-scope").value="nearby";
  if($("fire-directory-sort"))$("fire-directory-sort").value="distance";
  fireCloseSelection();
 });
 on("fire-map-selection-close","click",fireCloseSelection);
 renderFireDirectory();
}

function renderFireLegend(){
 var items=[
  ["fire","Bush Fire"],["grass","Grass Fire"],["hazmat","Hazmat"],["flood","Flood"],
  ["storm","Storm"],["road","Road"],["incident","Other Incident"]
 ];
 var kinds=$("fire-map-legend-incidents");
 if(kinds)kinds.innerHTML=items.map(function(item){
  return '<span class="fire-legend-item">'+fireIconBadge(item[0],"Unspecified",item[1])+esc(item[1])+'</span>';
 }).join("");
 var warnings=$("fire-map-legend-warnings");
 if(warnings){
  var states=["Advice","Watch and Act","Emergency Warning","Unspecified"];
  warnings.innerHTML=states.map(function(level){
   return '<span class="fire-legend-item">'+fireIconBadge(fireWarningIconKind(level),level,level+" warning")+
    esc(level==="Unspecified"?"Other Warning":level)+'</span>';
  }).join("")+
  '<span class="fire-legend-item">'+fireIconBadge("zone","Unspecified","Published warning area")+'Warning Polygon</span>'+
  '<span class="fire-legend-item">'+fireIconBadge("perimeter","Unspecified","Published incident extent")+'Incident Extent</span>'+
  '<span class="fire-legend-item">'+fireIconBadge("radius","Unspecified","Selected monitoring radius")+'Monitoring Radius</span>'+
  '<span class="fire-legend-item"><span class="fire-legend-cluster">3</span>Grouped Incidents · Select to Zoom</span>';
 }
}

function initFireAreaMap(){
 var element=$("fire-area-map");
 if(!element)return;
 if(typeof L==="undefined"){
  element.innerHTML='<p>Map library is unavailable. Check <a href="https://www.rfs.nsw.gov.au/fire-information/alerts-and-warnings" target="_blank" rel="noopener">NSW RFS warnings</a> directly.</p>';
  return;
 }
 element.replaceChildren();
 state.hazardMap=L.map(element,{scrollWheelZoom:false,zoomControl:true,preferCanvas:true})
  .setView([state.location.lat,state.location.lon],8);
 L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{
  maxZoom:18,updateWhenIdle:true,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
 }).addTo(state.hazardMap);
 state.hazardMap.on("zoomend",renderFireIncidentMarkers);
 state.hazardMap.on("moveend",syncFireMapSelection);
 state.hazardLayers={warnings:L.layerGroup().addTo(state.hazardMap),
  extents:L.layerGroup().addTo(state.hazardMap),incidents:L.layerGroup().addTo(state.hazardMap),
  locality:L.layerGroup().addTo(state.hazardMap)};
 if("ResizeObserver" in window)new ResizeObserver(function(){if(state.hazardMap)state.hazardMap.invalidateSize({pan:false});}).observe(element);
 on("fire-map-home","click",function(){state.hazardMap.setView([state.location.lat,state.location.lon],10);});
 on("fire-map-fit","click",fitHazardAreas);
 renderFireLegend();initFireDirectory();
 ["warnings","boundaries","points","radius"].forEach(function(kind){
  on("fire-map-"+kind,"change",renderFireAreaMap);
 });
 setTimeout(function(){state.hazardMap.invalidateSize({pan:false});},250);
 renderFireAreaMap();
}
function hazardMapEnabled(id){var el=$(id);return !el||el.checked;}
function hazardNearbyIncident(feature){
 var p=coordinatesOf(feature);
 if(p&&km(state.location.lat,state.location.lon,p[0],p[1])<=state.radius)return true;
 return hazardIncidentPolygons(feature).some(function(poly){
  return hazardRingDistanceKm([state.location.lat,state.location.lon],poly[0])<=state.radius;
 });
}
function renderFireAreaMap(){
 var map=state.hazardMap,layers=state.hazardLayers;
 if(map&&layers){
  Object.keys(layers).forEach(function(k){layers[k].clearLayers();});
  if(hazardMapEnabled("fire-map-radius")){
   L.circle([state.location.lat,state.location.lon],{radius:state.radius*1000,
    color:"#53b8ed",weight:1.5,fillOpacity:.035,dashArray:"6 5"}).addTo(layers.locality);
  }
  L.marker([state.location.lat,state.location.lon],{icon:fireLeafletMarkerIcon("location","location","Selected location: "+state.location.name),keyboard:true,zIndexOffset:800}).addTo(layers.locality);
  if(state.warningsFresh&&hazardMapEnabled("fire-map-warnings")){
   state.rfsAlerts.slice(0,35).forEach(function(alert){
    var style=hazardLevelStyle(alert);
    hazardWarningPolygons(alert).forEach(function(points){
     L.polygon(points,{color:style.color,weight:3,fillColor:style.color,fillOpacity:.19})
      .on("click",function(){fireSelectMapItem("warning",state.rfsAlerts.indexOf(alert));})
      .addTo(layers.warnings);
    });
   });
  }
  if(state.incidentsFresh){
   state.incidents.slice(0,500).forEach(function(feature){
    if(hazardMapEnabled("fire-map-boundaries")){
     hazardIncidentPolygons(feature).forEach(function(poly){
      L.polygon(poly,{color:"#bc94e7",weight:2.2,dashArray:"6 4",fillColor:"#b991e6",fillOpacity:.10})
       .on("click",function(){fireSelectMapItem("incident",state.incidents.indexOf(feature));})
       .addTo(layers.extents);
     });
    }

   });
  }
 }
 renderFireIncidentMarkers();
 renderFireAreaStatus();syncFireMapSelection();
}
function renderFireAreaStatus(){
 var area=hazardAssessWarnings(),current=state.location||{},title=current.name+(current.region?", "+current.region:"");
 setText("fire-location-heading",title);
 setText("fire-radius-caption","Selected monitoring radius: "+state.radius+" km. This is a map overlap aid, not an emergency warning subscription.");
 var badge=$("fire-geofence-state"),list=$("fire-overlaps");
 setText("fire-summary-location",String(current.name||"Selected Area"));
 setText("fire-summary-location-note",state.radius+" km monitoring radius");
 var counted=state.incidentsFresh?state.incidents.filter(function(f){return hazardNearbyIncident(f);}).length:null;
 setText("fire-summary-incidents",counted===null?"—":String(counted));
 setText("fire-summary-incidents-note",state.incidentsFresh?"Published RFS incidents within "+state.radius+" km":"Source not verified");
 setText("fire-summary-warnings",state.warningsFresh?String(area.mapped):"—");
 var extents=state.incidentsFresh?state.incidents.reduce(function(sum,f){return sum+hazardIncidentPolygons(f).length;},0):null;
 setText("fire-summary-extents",extents===null?"—":String(extents));
 renderFireDirectory();
 if(badge){
  badge.className="fire-geofence-state "+(!area.known?"unknown":area.inside.length?"intersect":area.near.length?"near":"unknown");
  badge.textContent=!area.known?"Official warning polygons unavailable or stale — overlap cannot be checked":
   area.inside.length?area.inside.length+" mapped warning area(s) contain your selected location — follow NSW RFS":
   area.near.length?area.near.length+" mapped warning area(s) overlap your "+state.radius+" km monitoring radius":
   "No overlap with published mapped warning polygons in this snapshot — NOT an all-clear";
 }
 if(list){
  var matches=area.inside.map(function(x){return {kind:"Contains selected location",value:x};})
   .concat(area.near.map(function(x){return {kind:"Within monitoring radius (approx.)",value:x};}));
  list.innerHTML=matches.length?matches.slice(0,12).map(function(m){
   var a=m.value.alert,style=hazardLevelStyle(a);
   return '<div class="fire-overlap-entry"><strong style="color:'+style.color+'">'+esc(style.level)+' · '+esc(a.headline||a.event||"NSW RFS warning")+'</strong>'+
     '<small>'+esc(m.kind)+' · Published '+esc(hazardPublished(a.sent))+'</small>'+
     '<a href="'+hazardLink(a)+'" target="_blank" rel="noopener">Official RFS instructions ↗</a></div>';
  }).join(""):'<p>'+(area.known?"No matching published polygons are mapped in this snapshot. Not all incidents have warning polygons. Check NSW RFS before making decisions.":"No location determination is possible until the official warning feed is available.")+'</p>';
 }
 var cap=$("fire-warning-feed-health");
 if(cap){cap.textContent=state.warningsFresh?
  "Warning areas: CAP feed retrieved; "+area.mapped+" published polygon(s) mapped":
  "WARNING DATA UNAVAILABLE / STALE — consult NSW RFS";cap.className=state.warningsFresh?"":"warn";}
 var incident=$("fire-incident-feed-health");
 if(incident){var count=state.incidents.reduce(function(n,f){return n+hazardIncidentPolygons(f).length;},0);
  incident.textContent=state.incidentsFresh?"Incident geometry: "+count+" published mapped area(s) · retrieved "+relTime(state.lastIncidentFetch):
  "INCIDENT DATA UNAVAILABLE / STALE — no current extent verification";
  incident.className=state.incidentsFresh?"":"warn";
 }
}
function focusHazardWarning(i){
 var alert=state.rfsAlerts[i];if(!alert)return;
 var polygons=hazardWarningPolygons(alert);
 if(!state.hazardMap){window.location.href="./radar.html";return;}
 try{
  fireSelectMapItem("warning",i);
  if(polygons.length)state.hazardMap.fitBounds(L.latLngBounds(polygons.flat()).pad(.12),{maxZoom:12});
  else message("No mapped boundary was published for this warning; details shown in the incident panel.");
  if($("fire-map-warnings")&&!$("fire-map-warnings").checked){$("fire-map-warnings").checked=true;renderFireAreaMap();}
  $("fire-map-workspace")?.scrollIntoView({behavior:"smooth",block:"start"});
 }catch(e){message("Unable to zoom to the published warning area.");}
}
function focusHazardIncident(i){
 var f=state.incidents[i];if(!f||!state.hazardMap)return;
 var poly=hazardIncidentPolygons(f),point=coordinatesOf(f);
 try{
  fireSelectMapItem("incident",i);
  if(poly.length)state.hazardMap.fitBounds(L.latLngBounds(poly.flat(2)).pad(.15),{maxZoom:12});
  else if(point)state.hazardMap.setView(point,13);
  $("fire-map-workspace")?.scrollIntoView({behavior:"smooth",block:"start"});
 }catch(e){message("Unable to display this incident area.");}
}
function fitHazardAreas(){
 if(!state.hazardMap)return;
 var points=[[state.location.lat,state.location.lon]];
 if(state.warningsFresh)state.rfsAlerts.forEach(function(a){
  hazardWarningPolygons(a).forEach(function(r){points.push.apply(points,r);});
 });
 if(state.incidentsFresh)state.incidents.forEach(function(f){
  var polygons=hazardIncidentPolygons(f);
  polygons.forEach(function(poly){poly.forEach(function(r){points.push.apply(points,r);});});
  var p=coordinatesOf(f);if(p)points.push(p);
 });
 if(points.length===1){state.hazardMap.setView(points[0],8);return;}
 try{state.hazardMap.fitBounds(L.latLngBounds(points).pad(.12),{maxZoom:11});}catch(e){}
}

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

function renderIncidents(){snapshotIncidentStatus();if(!$("incidents-list"))return;var l=state.location,near=state.incidents.map(function(f,i){var point=coordinatesOf(f);return point?{f:f,index:i,point:point,distance:km(l.lat,l.lon,point[0],point[1])}:null;}).filter(function(x){return x&&x.distance<=state.radius;}).sort(function(a,b){return a.distance-b.distance;});if(!state.lastIncidentFetch){$("incidents-list").innerHTML='<p class="feed-empty">Live fire data has not been loaded. Check the official source.</p>';return;}$("incidents-list").innerHTML=near.length?near.slice(0,8).map(function(x){return '<div class="feed-item incident-rich-card"><div class="incident-rich-heading"><b>'+
  fireIconBadge(fireIncidentKind(x.f),incidentAlertLevel(x.f),fireIncidentKindLabel(fireIncidentKind(x.f)))+
  esc(incidentTitle(x.f))+'</b><span class="incident-alert-pill '+incidentAlertStyle(x.f).cls+'">'+esc(incidentAlertLevel(x.f))+'</span></div>'+
 '<small>Approx. '+Math.round(x.distance)+' km from published map coordinates'+(hazardIncidentPolygons(x.f).length?' · Mapped incident extent available':'')+'</small>'+
 '<div class="incident-quick-facts">'+incidentCompactFacts(x.f)+'</div>'+
 '<small class="incident-updated-label">RFS incident update: '+esc(incidentLastUpdated(x.f))+'</small>'+
 '<details class="incident-details-panel"><summary>All Published Incident Details</summary>'+incidentDetailList(x.f)+'</details>'+
 '<div class="incident-rich-actions"><button class="fire-area-view-button" type="button" data-fire-incident="'+x.index+'">Inspect on Fire Map</button>'+
 '<a href="'+esc(incidentUrl(x.f))+'" target="_blank" rel="noopener">View Official Incident Details ↗</a></div></div>';}).join(""):'<p class="feed-empty">No incidents mapped within this radius in the latest retrieved NSW RFS feed. This does NOT mean the area is safe or free of hazards.</p>';setText("incident-range","Within "+state.radius+" km of "+l.name+" · "+near.length+" Mapped");
 if($("incidents-list"))$("incidents-list").querySelectorAll("[data-fire-incident]").forEach(function(btn){
  btn.addEventListener("click",function(){focusHazardIncident(Number(btn.dataset.fireIncident));});
 });if(state.notify&&state.seen&&near.length){var ids=near.map(function(x){return incidentId(x.f,x.index);}),fresh=near.filter(function(x){return state.seen.indexOf(incidentId(x.f,x.index))<0;});if(fresh.length&&"Notification" in window&&Notification.permission==="granted"&&document.visibilityState==="visible"){try{new Notification("SkyPulse AU: new mapped RFS incident",{body:incidentTitle(fresh[0].f)+". Check NSW RFS for official instructions.",tag:"skypulse-fire",icon:"./assets/icon.svg"});}catch(e){}}state.seen=ids;save();}else if(!state.seen){state.seen=near.map(function(x){return incidentId(x.f,x.index);});save();}}
function feedState(id,stamp){var element=$(id);if(!element)return false;var time=new Date(stamp).getTime();if(!Number.isFinite(time)){element.textContent="Source update time unavailable — verify on official site";element.className="feed-state warn";return false;}var stale=Date.now()-time>DATA_MAX_AGE;element.textContent=(stale?"Stale Feed — Check Official Source · ":"Feed Updated: ")+relTime(stamp);element.className=stale?"feed-state warn":"feed-state";return !stale;}
function preferredFireDistrict(){var l=state.location||DEFAULT,n=String(l.name||"").toLowerCase().trim();
var hunter=["cessnock","maitland","newcastle","singleton","dungog","muswellbrook","port stephens","lake macquarie","upper hunter"];
if(hunter.includes(n)||km(l.lat,l.lon,-32.8321,151.3497)<=35)return "Greater Hunter";
return "";}
function renderFireDanger(){var v=state.fireDanger,p=$("fdr-district-select"),box=$("snapshot-fire-danger");
if(!p){if(box){var district=(v?.districts||[]).find(function(x){return x.name===(state.fireDistrict||preferredFireDistrict());});box.textContent=!v?.retrieved_at?"Official Feed Unavailable · View NSW RFS":district?district.name+" · Today: "+(district.rating_today||"Not Issued")+(district.ban_today===true?" · Total Fire Ban":""):"Choose Your Fire Weather District in Settings or Check NSW RFS";}return;}
if(!v||!Array.isArray(v.districts)||!v.retrieved_at){setText("fdr-feed-status","Fire Danger Feed Unavailable — Use the Official NSW RFS Website");$("fdr-feed-status").className="feed-state warn";setText("fdr-today-rating","Unavailable");setText("fdr-tomorrow-rating","Unavailable");setText("fdr-today-ban","Total Fire Ban: Unverified");setText("fdr-tomorrow-ban","Total Fire Ban: Unverified");if(box)box.textContent="Official Feed Unavailable · View RFS";return;}
var stale=Date.now()-new Date(v.retrieved_at).getTime()>DATA_MAX_AGE;
if(!p.options.length||p.options.length!==v.districts.length+1){p.innerHTML='<option value="">Choose a District</option>';v.districts.forEach(function(d){var o=document.createElement("option");o.value=d.name;o.textContent=d.name;p.appendChild(o);});}
var recommended=preferredFireDistrict(),chosen=state.fireDistrict||recommended;
if(!v.districts.some(function(d){return d.name===chosen;}))chosen=recommended&&v.districts.some(function(d){return d.name===recommended;})?recommended:"";
p.value=chosen;
var selected=v.districts.find(function(d){return d.name===chosen;});
feedState("fdr-feed-status",v.retrieved_at);
if(!selected){setText("fdr-today-rating","Select District");setText("fdr-tomorrow-rating","Select District");setText("fdr-today-ban","Total Fire Ban: Check RFS");setText("fdr-tomorrow-ban","Total Fire Ban: Check RFS");if(box)box.textContent="Select Your Fire Weather District · Check RFS";return;}
var rating=function(val){return val&&val.trim()?val.trim():"Not Issued";};
var ban=function(val){return val===true?"YES — Total Fire Ban":val===false?"No Total Fire Ban Listed":"Status Not Available";};
var today=rating(selected.rating_today),tomorrow=rating(selected.rating_tomorrow);
setText("fdr-today-rating",today);setText("fdr-tomorrow-rating",tomorrow);
setText("fdr-today-ban",ban(selected.ban_today));
setText("fdr-tomorrow-ban",ban(selected.ban_tomorrow));
$("fdr-today-rating").parentElement.dataset.level=today.toLowerCase();
$("fdr-tomorrow-rating").parentElement.dataset.level=tomorrow.toLowerCase();
if(box)box.textContent=selected.name+" · Today: "+today+" · Fire Ban: "+(selected.ban_today===true?"Yes":selected.ban_today===false?"No Listed":"Unverified")+(stale?" · Feed May Be Stale":"");
}
async function loadFireDanger(){try{var v=await getJSON("./data/fdr.json?cache="+Date.now());
if(!v||!v.retrieved_at||!Array.isArray(v.districts)||!v.districts.length||v.error)throw Error("RFS fire danger data not available");
state.fireDanger=v;renderFireDanger();}catch(err){state.fireDanger=null;renderFireDanger();}}

function rfsWarningUrl(alert){
  var url=validUrl(alert.web);
  try {var host=new URL(url).hostname;if(host==="www.rfs.nsw.gov.au"||host==="rfs.nsw.gov.au")return url;}catch(e){}
  return "https://www.rfs.nsw.gov.au/fire-information/alerts-and-warnings";
}
function hazardLevel(alert){
 var src=String(alert.alert_level||"");
 if(["Advice","Watch and Act","Emergency Warning"].includes(src))return src;
 var text=String(alert.headline||"")+" "+String(alert.event||"");
 if(/\bEmergency Warning\b/i.test(text))return "Emergency Warning";
 if(/\bWatch\s*(?:and|&)\s*Act\b/i.test(text))return "Watch and Act";
 if(/\bAdvice\b/i.test(text))return "Advice";
 return "Unspecified";
}
function hazardLevelStyle(alert){
 var level=hazardLevel(alert);
 return level==="Emergency Warning"?{level,color:"#e9555c",cls:"aws-emergency"}:
  level==="Watch and Act"?{level,color:"#ed8c41",cls:"aws-watch"}:
  level==="Advice"?{level,color:"#e1b74f",cls:"aws-advice"}:
  {level,color:"#9aabc2",cls:"aws-other"};
}
function hazardPublished(iso){
 if(!iso)return "Issue time unavailable";
 var d=new Date(iso);
 if(!Number.isFinite(d.getTime()))return "Issue time unavailable";
 return new Intl.DateTimeFormat("en-AU",{timeZone:"Australia/Sydney",day:"numeric",month:"short",hour:"numeric",minute:"2-digit",timeZoneName:"short"}).format(d);
}
function hazardSafeRing(raw){
 if(!Array.isArray(raw)||raw.length<3||raw.length>5001)return null;
 var ring=raw.map(function(p){return Array.isArray(p)&&p.length>=2&&
  Number.isFinite(Number(p[0]))&&Number.isFinite(Number(p[1]))&&
  Number(p[0])>=-45&&Number(p[0])<=-8&&Number(p[1])>=110&&Number(p[1])<=155?
  [Number(p[0]),Number(p[1])]:null;});
 return ring.includes(null)?null:ring;
}
function hazardWarningPolygons(alert){
 return (Array.isArray(alert&&alert.polygons)?alert.polygons:[]).slice(0,12).map(hazardSafeRing).filter(Boolean);
}
function hazardIncidentPolygons(feature){
 var out=[];
 function parse(g){
  if(!g||typeof g!=="object"||out.length>50)return;
  if(g.type==="GeometryCollection"){(Array.isArray(g.geometries)?g.geometries:[]).slice(0,45).forEach(parse);return;}
  var polys=g.type==="Polygon"?[g.coordinates]:g.type==="MultiPolygon"?g.coordinates:[];
  (Array.isArray(polys)?polys:[]).slice(0,35).forEach(function(poly){
   if(!Array.isArray(poly)||poly.length>12||out.length>50)return;
   var rings=poly.map(function(ring){
    if(!Array.isArray(ring)||ring.length<3||ring.length>5001)return null;
    return hazardSafeRing(ring.map(function(p){return Array.isArray(p)?[p[1],p[0]]:null;}));
   });
   if(rings.length&&rings.every(Boolean))out.push(rings);
  });
 }
 parse(feature&&feature.geometry);
 return out;
}
function hazardRingContains(point,ring){
 if(!point||!ring||ring.length<3)return false;
 var y=point[0],x=point[1],inside=false;
 for(var i=0,j=ring.length-1;i<ring.length;j=i++){
  var a=ring[i],b=ring[j],yi=a[0],yj=b[0],xi=a[1],xj=b[1];
  // A point exactly on a published boundary is conservatively treated as in it.
  var dx=xj-xi,dy=yj-yi,cross=(x-xi)*dy-(y-yi)*dx;
  if(Math.abs(cross)<1e-10&&x>=Math.min(xi,xj)-1e-9&&x<=Math.max(xi,xj)+1e-9&&
     y>=Math.min(yi,yj)-1e-9&&y<=Math.max(yi,yj)+1e-9)return true;
  if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
 }
 return inside;
}
function hazardRingDistanceKm(point,ring){
 if(!point||!ring||ring.length<2)return Infinity;
 if(hazardRingContains(point,ring))return 0;
 var lat=point[0],latScale=111.2,lonScale=111.2*Math.max(.1,Math.cos(lat*Math.PI/180)),best=Infinity;
 for(var i=0;i<ring.length;i++){
  var a=ring[i],b=ring[(i+1)%ring.length];
  var x1=(a[1]-point[1])*lonScale,y1=(a[0]-lat)*latScale,
      x2=(b[1]-point[1])*lonScale,y2=(b[0]-lat)*latScale;
  var dx=x2-x1,dy=y2-y1,denom=dx*dx+dy*dy;
  var t=denom?Math.max(0,Math.min(1,-(x1*dx+y1*dy)/denom)):0;
  best=Math.min(best,Math.hypot(x1+t*dx,y1+t*dy));
 }
 return best;
}
function hazardAssessWarnings(){
 if(!state.warningsFresh)return {known:false,inside:[],near:[],mapped:0};
 var inside=[],near=[],mapped=0,point=[state.location.lat,state.location.lon];
 state.rfsAlerts.forEach(function(alert,i){
  var shapes=hazardWarningPolygons(alert);
  if(!shapes.length)return;
  mapped+=shapes.length;
  var inArea=shapes.some(function(poly){return hazardRingContains(point,poly);});
  var distance=Math.min.apply(null,shapes.map(function(poly){return hazardRingDistanceKm(point,poly);}));
  if(inArea)inside.push({alert,index:i});
  else if(distance<=state.radius)near.push({alert,index:i,distance});
 });
 return {known:true,inside,near,mapped};
}
function hazardLink(alert){return esc(rfsWarningUrl(alert));}
function hazardWarningPopup(alert){
 var lvl=hazardLevelStyle(alert),desc=Array.isArray(alert.area_names)?alert.area_names.join(", "):"";
 return '<div class="rfs-warning-popup"><div class="rfs-warning-popup-heading">'+fireIconBadge(fireWarningIconKind(lvl.level),lvl.level,lvl.level+" warning")+
  '<strong>'+
  esc(alert.headline||alert.event||"NSW RFS warning")+'</strong></div>'+
  '<div class="rfs-warning-popup-fields"><div class="rfs-warning-popup-field"><b>Warning level</b><span>'+
  esc(lvl.level)+'</span></div>'+
  (desc?'<div class="rfs-warning-popup-field"><b>Affected area</b><span>'+esc(desc)+'</span></div>':"")+
  '<div class="rfs-warning-popup-field"><b>Issued</b><span>'+esc(hazardPublished(alert.sent))+'</span></div></div>'+
  (alert.instruction?'<div class="rfs-warning-popup-instructions"><strong>Official instructions</strong><p>'+
   esc(String(alert.instruction).slice(0,700))+'</p></div>':"")+
  '<p class="incident-map-note">Official warning area, not a published fire extent.</p>'+
  '<a href="'+hazardLink(alert)+'" target="_blank" rel="noopener">Read Full NSW RFS Warning ↗</a></div>';
}
function hazardIncidentPopup(feature){
 var level=incidentAlertStyle(feature);
 return '<div class="incident-popup"><div class="incident-popup-heading">'+fireIconBadge(fireIncidentKind(feature),level.level,fireIncidentKindLabel(fireIncidentKind(feature)))+
  '<b>'+esc(incidentTitle(feature))+'</b>'+
  '<span class="incident-alert-pill '+level.cls+'">'+esc(level.level)+'</span></div>'+
  incidentDetailList(feature)+
  '<p class="incident-map-note">Published RFS incident location/geometry. Not a warning area, evacuation boundary or current fire-front estimate.</p>'+
  '<a href="'+esc(incidentUrl(feature))+'" target="_blank" rel="noopener">Official NSW RFS Incident Information ↗</a></div>';
}
function showRfsWarningMap(){
 if(state.map&&state.warningLayer){
  state.warningLayer.clearLayers();
  if(state.warningsEnabled&&state.warningsFresh)state.rfsAlerts.slice(0,35).forEach(function(alert){
   var style=hazardLevelStyle(alert);
   hazardWarningPolygons(alert).forEach(function(points){
    L.polygon(points,{color:style.color,weight:2.7,fillColor:style.color,fillOpacity:.18})
      .bindPopup(hazardWarningPopup(alert)).addTo(state.warningLayer);
   });
  });
 }
 renderFireAreaMap();
}

async function loadOfficialRfsWarnings(){
 try{
  var data=await getJSON("./data/rfs-alerts.json?cache="+Date.now());
  if(!data||data.error||!data.retrieved_at||!Array.isArray(data.alerts))throw Error("RFS CAP feed unavailable");
  var age=Date.now()-new Date(data.retrieved_at).getTime();
  if(!Number.isFinite(age)||age<0||age>DATA_MAX_AGE)throw Error("RFS warning snapshot is stale");
  state.rfsAlerts=data.alerts;state.warningsFresh=true;
  if(state.fireSelected&&state.fireSelected.kind==="warning"&&!state.rfsAlerts[state.fireSelected.index])fireCloseSelection();
  feedState("rfs-alert-feed-state",data.retrieved_at);
  if($("rfs-alerts-list")){
   $("rfs-alerts-list").innerHTML=data.alerts.length?data.alerts.slice(0,35).map(function(alert,i){
    var style=hazardLevelStyle(alert),polygons=hazardWarningPolygons(alert);
    var area=Array.isArray(alert.area_names)?alert.area_names.join("; "):"";
    return '<div class="rfs-alert-entry"><div class="rfs-alert-entry-header"><b>⚠ '+esc(alert.headline||alert.event||"Official RFS warning")+
     '</b><span class="warning-severity '+style.cls+'">'+esc(style.level)+'</span></div>'+
     '<small>Published: '+esc(hazardPublished(alert.sent))+(alert.expires?" · Expires: "+esc(hazardPublished(alert.expires)):"")+
     ' · '+(polygons.length?polygons.length+" official mapped warning area(s)":"Warning area not published in machine-readable geometry")+'</small>'+
     (area?'<p class="rfs-alert-area">Affected locations: '+esc(area)+'</p>':"")+
     (alert.instruction?'<p class="rfs-alert-area">Published instructions: '+esc(String(alert.instruction).slice(0,800))+'</p>':"")+
     (polygons.length?'<button type="button" class="rfs-alert-map-button" data-warning-index="'+i+'">Inspect Official Area on Map</button>':"")+
     '<a class="text-link" href="'+hazardLink(alert)+'" target="_blank" rel="noopener">Read Full Official Warning ↗</a></div>';
   }).join(""):'<p class="feed-empty">No active CAP warning records were supplied by this feed snapshot. This is not a statewide all-clear; consult NSW RFS.</p>';
   $("rfs-alerts-list").querySelectorAll("[data-warning-index]").forEach(function(button){
    button.addEventListener("click",function(){focusHazardWarning(Number(button.dataset.warningIndex));});
   });
  }
 }catch(e){
  state.rfsAlerts=[];state.warningsFresh=false;
  if(state.fireSelected&&state.fireSelected.kind==="warning")fireCloseSelection();
  if($("rfs-alert-feed-state")){$("rfs-alert-feed-state").textContent="Official CAP warning feed unavailable or stale — current areas cannot be verified";$("rfs-alert-feed-state").className="feed-state warn";}
  if($("rfs-alerts-list"))$("rfs-alerts-list").innerHTML='<p class="feed-empty">Warning coverage cannot be verified from this snapshot. Open NSW RFS or Hazards Near Me for official instructions.</p>';
 }
 showRfsWarningMap();
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

async function loadHazards(){if($("fdr-district-select")||$("snapshot-fire-danger"))loadFireDanger();if($("rfs-alerts-list")||$("weather-map"))loadOfficialRfsWarnings();if($("wmo-warnings-list"))loadWmoUpdates();try{var data=await getJSON("./data/rfs.json?cache="+Date.now());if(!Array.isArray(data.features)||!data.retrieved_at||data.error)throw Error("RFS feed is unavailable");
 var incidentAge=Date.now()-new Date(data.retrieved_at).getTime();
 if(!Number.isFinite(incidentAge)||incidentAge<0||incidentAge>DATA_MAX_AGE)throw Error("RFS incident feed stale");
 state.incidents=data.features;state.lastIncidentFetch=data.retrieved_at;state.incidentsFresh=true;
 if(state.fireSelected&&state.fireSelected.kind==="incident"&&!state.incidents[state.fireSelected.index])fireCloseSelection();
 feedState("rfs-feed-state",data.retrieved_at);renderIncidents();updateMarkers();renderFireAreaMap();}catch(e){state.incidents=[];state.lastIncidentFetch=null;state.incidentsFresh=false;
 if(state.fireSelected&&state.fireSelected.kind==="incident")fireCloseSelection();
 if($("rfs-feed-state"))$("rfs-feed-state").textContent="Incident data unavailable; use the official NSW RFS link below. Check Pages publishing source if persistent.";if($("rfs-feed-state"))$("rfs-feed-state").className="feed-state warn";renderIncidents();updateMarkers();renderFireAreaMap();}if(!$("warnings-list")&&!$("snapshot-warnings"))return;try{var bom=await getJSON("./data/bom.json?cache="+Date.now());if(!Array.isArray(bom.warnings)||!bom.retrieved_at||bom.error)throw Error("BOM feed is unavailable");feedState("bom-feed-state",bom.retrieved_at);setText("snapshot-warnings",bom.warnings.length+" Statewide NSW/ACT Notices · Check for Local Relevance");if($("warnings-list"))$("warnings-list").innerHTML=bom.warnings.length?bom.warnings.slice(0,7).map(function(w){var link=validUrl(w.link)||"https://www.bom.gov.au/nsw/warnings/";return '<div class="feed-item"><b>⚠ '+esc(w.title||"Weather warning")+'</b><small>'+esc(w.published||"See original warning for issue time")+'</small><a href="'+esc(link)+'" target="_blank" rel="noopener">Read full warning at BOM ↗</a></div>';}).join(""):'<p class="feed-empty">No current warnings were listed in the retrieved statewide BOM RSS feed. Check BOM directly before making safety decisions.</p>';}catch(e){setText("snapshot-warnings","Warning Feed Unavailable — Check Official BOM Warnings");if($("bom-feed-state"))$("bom-feed-state").textContent="Warning feed unavailable. Open BOM for the latest notices.";if($("bom-feed-state"))$("bom-feed-state").className="feed-state warn";if($("warnings-list"))$("warnings-list").innerHTML='<p class="feed-empty">Unable to verify current warning status.</p>';}}
function mapInfo(text){var e=$("map-location-status");e.textContent=text;e.hidden=false;clearTimeout(state.mapStatusTimer);state.mapStatusTimer=setTimeout(function(){e.hidden=true;},5200);}
function updateMapCoords(){if(!state.map)return;var p=state.map.getCenter();setText("map-coordinates",Math.abs(p.lat).toFixed(4)+"°"+(p.lat<0?"S":"N")+", "+Math.abs(p.lng).toFixed(4)+"°"+(p.lng<0?"W":"E")+" · Zoom "+state.map.getZoom());}
function mapResize(){if(state.map)state.map.invalidateSize({pan:false});}
function mapRefresh(){if(state.map){mapResize();state.baseLayer.redraw();}}
function centreSelected(){if(!state.map)return;state.map.flyTo([state.location.lat,state.location.lon],11,{duration:.5});mapInfo("Map Centred on "+state.location.name+".");}
function locateMap(){if(!state.map)return;if(!navigator.geolocation){mapInfo("Browser Location Services Are Unavailable.");return;}var btn=$("map-locate");btn.disabled=true;mapInfo("Requesting Current Location…");navigator.geolocation.getCurrentPosition(function(pos){btn.disabled=false;var ll=[pos.coords.latitude,pos.coords.longitude],accuracy=Math.max(0,Number(pos.coords.accuracy)||0);if(state.gpsMarker)state.map.removeLayer(state.gpsMarker);if(state.gpsAccuracy)state.map.removeLayer(state.gpsAccuracy);state.gpsAccuracy=L.circle(ll,{radius:accuracy,color:"#2b93e5",weight:1,fillColor:"#58b7fd",fillOpacity:.13,interactive:false}).addTo(state.map);state.gpsMarker=L.circleMarker(ll,{radius:8,color:"white",weight:3,fillColor:"#1688e1",fillOpacity:1}).addTo(state.map).bindPopup("Your Current Location (Approximate)");state.map.flyTo(ll,Math.max(11,state.map.getZoom()),{duration:.6});mapInfo("Current Location Found"+(accuracy?" · Accuracy ±"+Math.round(accuracy)+" m":"")+". Your Forecast Location Is Unchanged.");},function(error){btn.disabled=false;mapInfo(error.code===1?"Location Permission Denied — Check Your Browser Settings.":"Unable to Determine Current Location.");},{timeout:15000,maximumAge:60000,enableHighAccuracy:true});}
function fitNearby(){if(!state.map)return;var near=state.incidents.map(function(f){var p=coordinatesOf(f);return p&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&km(state.location.lat,state.location.lon,p[0],p[1])<=state.radius?p:null;}).filter(Boolean);if(!near.length){mapInfo("No Mapped Incidents Found Within the Selected Radius — This Does Not Confirm Safety.");return;}near.push([state.location.lat,state.location.lon]);state.map.fitBounds(L.latLngBounds(near).pad(.22),{maxZoom:12});mapInfo("Showing "+(near.length-1)+" Nearby Mapped RFS Incidents.");}
function syncMapLayerUI(){$("map-layer-warnings").checked=state.warningsEnabled;[["radar",state.radarEnabled],["incidents",state.incidentsEnabled]].forEach(function(v){var b=$(v[0]==="radar"?"radar-toggle":"incidents-toggle");b.classList.toggle("selected",v[1]);b.setAttribute("aria-pressed",String(v[1]));});$("map-layer-radar").checked=state.radarEnabled;$("map-layer-rfs").checked=state.incidentsEnabled;
 if($("map-layer-fire-areas"))$("map-layer-fire-areas").checked=state.fireAreasEnabled;$("map-nearby-only").checked=state.mapNearbyOnly;$("map-wheel-zoom").checked=state.mapWheelZoom;$("map-radar-opacity").value=Math.round(state.radarOpacity*100);setText("map-opacity-label",Math.round(state.radarOpacity*100)+"%");
 radarSyncPreferences();}
function setMapLayer(kind,value){if(kind==="radar"){state.radarEnabled=value;if(!value)stopRadarPlayback();if(state.radarFrames.length)showRadarFrame(state.radarIndex);}else{state.incidentsEnabled=value;updateMarkers();}save();syncMapLayerUI();}
function toggleMapFullscreen(){var el=$("map-viewport");if(document.fullscreenElement===el){document.exitFullscreen().catch(function(){});return;}if(el.classList.contains("map-pseudo-fullscreen")){el.classList.remove("map-pseudo-fullscreen");document.body.classList.remove("map-lock-scroll");setTimeout(mapResize,80);return;}if(el.requestFullscreen){el.requestFullscreen().then(function(){setTimeout(mapResize,80);}).catch(function(){el.classList.add("map-pseudo-fullscreen");document.body.classList.add("map-lock-scroll");setTimeout(mapResize,80);});}else{el.classList.add("map-pseudo-fullscreen");document.body.classList.add("map-lock-scroll");setTimeout(mapResize,80);}}
function initMap(){initRadarPreview();if(!$("weather-map")){if(state.peekMap)loadRadar();return;}if(typeof L==="undefined"){$("weather-map").innerHTML='<p class="map-fallback">Map Unavailable. <a href="https://www.bom.gov.au/australia/radar/" target="_blank" rel="noopener">Open Official BOM Radar ↗</a></p>';return;}
$("weather-map").replaceChildren();
state.map=L.map("weather-map",{zoomControl:false,scrollWheelZoom:false,preferCanvas:true}).setView(state.radarShareView?[state.radarShareView.lat,state.radarShareView.lon]:[state.location.lat,state.location.lon],state.radarShareView?state.radarShareView.zoom:9);
state.baseLayer=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,updateWhenIdle:true,keepBuffer:2,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> Contributors'});
state.baseLayer.on("tileerror",function(){state.mapTileFailures++;if(state.mapTileFailures>=3){setText("map-tile-status","Base Map Tiles Unavailable — Check Your Connection or Use the Official Radar.");$("map-tile-status").hidden=false;}});
state.baseLayer.addTo(state.map);state.markers=L.layerGroup().addTo(state.map);state.warningLayer=L.layerGroup().addTo(state.map);
 state.fireAreaLayer=L.layerGroup().addTo(state.map);
state.locationMarker=L.circleMarker([state.location.lat,state.location.lon],{radius:7,color:"white",weight:3,fillColor:"#278ce6",fillOpacity:1}).addTo(state.map).bindPopup("Selected Location: "+esc(state.location.name));
L.control.scale({metric:true,imperial:false,position:"bottomleft",maxWidth:110}).addTo(state.map);
state.map.on("moveend zoomend",updateMapCoords);updateMapCoords();
if("ResizeObserver" in window)new ResizeObserver(function(){if(state.map)state.map.invalidateSize({pan:false});}).observe($("weather-map"));
 state.map.on("moveend zoomend",radarSyncRegionSelection);
 state.map.on("zoomend",radarUpdateQuality);
 state.map.on("zoomend",renderRadarIncidentMarkers);
 radarUpdateQuality();
document.querySelectorAll('a[href="#map-section"]').forEach(function(a){a.addEventListener("click",function(){setTimeout(function(){state.map.invalidateSize({pan:false});},160);});});
$("map-retry").addEventListener("click",function(){state.mapTileFailures=0;state.radarTileErrors=0;$("map-tile-status").hidden=true;mapRefresh();loadRadar(true);});
$("map-zoom-in").addEventListener("click",function(){state.map.zoomIn();});$("map-zoom-out").addEventListener("click",function(){state.map.zoomOut();});$("map-locate").addEventListener("click",locateMap);$("map-home").addEventListener("click",centreSelected);$("map-fit").addEventListener("click",fitNearby);$("map-fullscreen").addEventListener("click",toggleMapFullscreen);
$("map-layers-button").addEventListener("click",function(){var panel=$("map-layers-panel");panel.hidden=!panel.hidden;this.setAttribute("aria-expanded",String(!panel.hidden));});
$("map-layer-radar").addEventListener("change",function(e){setMapLayer("radar",e.target.checked);});$("map-layer-rfs").addEventListener("change",function(e){setMapLayer("incidents",e.target.checked);});
 on("map-layer-fire-areas","change",function(e){state.fireAreasEnabled=e.target.checked;save();showMapFireExtents();});$("map-layer-warnings").addEventListener("change",function(e){state.warningsEnabled=e.target.checked;save();showRfsWarningMap();syncMapLayerUI();});
$("map-nearby-only").addEventListener("change",function(e){state.mapNearbyOnly=e.target.checked;save();updateMarkers();syncMapLayerUI();});$("map-wheel-zoom").addEventListener("change",function(e){state.mapWheelZoom=e.target.checked;if(state.mapWheelZoom)state.map.scrollWheelZoom.enable();else state.map.scrollWheelZoom.disable();save();syncMapLayerUI();});
$("map-radar-opacity").addEventListener("input",function(e){radarSetOpacity(Number(e.target.value)/100);});
state.map.on("click",function(){$("map-layers-panel").hidden=true;$("map-layers-button").setAttribute("aria-expanded","false");});
document.addEventListener("fullscreenchange",function(){setTimeout(function(){if(state.map)state.map.invalidateSize({pan:false});},100);});
document.addEventListener("keydown",function(e){if(e.key==="Escape"){$("map-layers-panel").hidden=true;$("map-layers-button").setAttribute("aria-expanded","false");if($("map-viewport").classList.contains("map-pseudo-fullscreen"))toggleMapFullscreen();}});
syncMapLayerUI();setTimeout(function(){state.map.invalidateSize({pan:false});},350);updateMarkers();showRfsWarningMap();loadRadar();}
function updateMarkers(){if(!state.map||!state.markers)return;showMapFireExtents();renderRadarIncidentMarkers();}
function showMapFireExtents(){
 if(!state.map||!state.fireAreaLayer)return;
 state.fireAreaLayer.clearLayers();
 if(!state.fireAreasEnabled||!state.incidentsFresh)return;
 state.incidents.slice(0,500).forEach(function(f){
  if(state.mapNearbyOnly&&!hazardNearbyIncident(f))return;
  hazardIncidentPolygons(f).forEach(function(poly){
   L.polygon(poly,{color:"#bc94e7",weight:2.2,dashArray:"6 4",fillColor:"#b991e6",fillOpacity:.10})
    .bindPopup(hazardIncidentPopup(f)).addTo(state.fireAreaLayer);
  });
 });
}
// RainViewer 2026 free API: up to two hours of past imagery, usually every 10 minutes.
// Polling its manifest every five minutes does not create more frequent radar scans.
const RADAR_URL="https://api.rainviewer.com/public/weather-maps.json",RADAR_CHECK_MS=300000;
function radarClock(epoch,full){
 if(!Number.isFinite(Number(epoch)))return "Time unavailable";
 return new Intl.DateTimeFormat("en-AU",{timeZone:"Australia/Sydney",
  ...(full?{day:"numeric",month:"short",year:"numeric"}:{}),
  hour:"numeric",minute:"2-digit",hour12:true,timeZoneName:"short"}).format(new Date(Number(epoch)*1000));
}
function radarAge(ms){var m=Math.max(0,Math.floor(ms/60000));return m<1?"less than 1 minute":m===1?"1 minute":m+" minutes";}
function radarFrame(){return state.radarIndex<0?null:state.radarFrames[state.radarIndex];}
function radarCleanLayer(){
 if(state.radarSwapTimer){clearTimeout(state.radarSwapTimer);state.radarSwapTimer=null;}
 if(state.radarOutgoing&&state.map){state.map.removeLayer(state.radarOutgoing);state.radarOutgoing=null;}
}
function radarControls(){
 var count=state.radarFrames.length,has=count>0;
 ["radar-play","radar-latest","radar-slider","radar-step-back","radar-step-forward"].forEach(function(id){if($(id))$(id).disabled=!has;});
 if($("radar-step-back"))$("radar-step-back").disabled=!has||state.radarIndex===0;
 if($("radar-step-forward"))$("radar-step-forward").disabled=!has||state.radarIndex===count-1;
 if($("radar-latest"))$("radar-latest").disabled=!has||(state.radarIndex===count-1&&state.radarFollowLatest);
}
function radarStatus(){
 var latest=state.radarFrames[state.radarFrames.length-1],indicator=$("radar-freshness-indicator");
 if(!latest){
  if(indicator){indicator.className="radar-freshness waiting";indicator.innerHTML='<span class="radar-pulse"></span> UNAVAILABLE';}
  setText("radar-latest-issued","Radar history unavailable");
  setText("radar-data-age",state.radarLastError?"Provider check failed — try again or open BOM radar":"Waiting for radar history");
  return;
 }
 var age=Date.now()-latest.time*1000,stale=age>45*60000,delayed=age>22*60000;
 var level=stale?"stale":delayed?"delayed":"fresh",text=stale?"STALE IMAGE":delayed?"DELAYED IMAGE":"RECENT FRAME";
 if(state.radarLastError){level="delayed";text="CHECK FAILED";}
 if(indicator){indicator.className="radar-freshness "+level;indicator.innerHTML='<span class="radar-pulse"></span> '+text;}
 setText("radar-latest-issued","Latest issued: "+radarClock(latest.time,true));
 setText("radar-data-age","Source frame issued "+radarAge(age)+" ago"+
  (state.radarLastError?" · Could not verify newer data":stale?" · Historical only; current conditions unknown":delayed?" · Behind usual source schedule":" · Not a live video feed"));
 if($("radar-last-check")&&state.radarFetchedAt)setText("radar-last-check","Last checked: "+radarClock(state.radarFetchedAt/1000,false)+(state.radarLastError?" · Retry pending":""));
 var stamp=$("radar-map-stamp");if(stamp)stamp.className="radar-map-stamp"+(stale?" is-stale":delayed?" is-delayed":"");
}
function radarFrameUI(){
 var f=radarFrame(),n=state.radarFrames.length;if(!f){radarControls();return;}
 var latest=state.radarIndex===n-1,time=radarClock(f.time,true);
 setText("radar-time",radarClock(f.time,false));
 setText("radar-frame-label","Frame issued "+time);
 setText("radar-map-clock",radarClock(f.time,false));
 setText("radar-history-label","Frame "+(state.radarIndex+1)+" of "+n+" · "+(latest?"Latest available":"Historical image")+" · Frame generation time");
 setText("radar-frame-kind",latest?"LATEST AVAILABLE":"HISTORICAL FRAME");
 if($("radar-frame-kind"))$("radar-frame-kind").classList.toggle("historical",!latest);
 if($("radar-map-stamp"))$("radar-map-stamp").hidden=!state.radarShowTimestamp;
 if($("radar-slider")){var s=$("radar-slider");s.min=0;s.max=n-1;s.value=state.radarIndex;s.setAttribute("aria-valuetext",time);}
 setText("radar-oldest-label",radarClock(state.radarFrames[0].time,false));
 setText("radar-newest-label",radarClock(state.radarFrames[n-1].time,false));
 radarSyncPreferences();radarControls();
}
function showRadarFrame(i){
 if((!state.map&&!state.peekMap)||!state.radarFrames.length)return;
 state.radarIndex=Math.max(0,Math.min(state.radarFrames.length-1,Number(i)||0));
 var f=radarFrame(),key=state.radarHost+f.path;
 radarFrameUI();
 if(state.map){
  if(!state.radarEnabled){
   radarCleanLayer();if(state.radarLayer)state.map.removeLayer(state.radarLayer);
   state.radarLayer=null;state.radarRenderedKey="";
  }else if(key!==state.radarRenderedKey||!state.radarLayer){
   radarCleanLayer();var old=state.radarLayer;
   if(old)state.radarOutgoing=old;
   var layer=L.tileLayer(key+"/256/{z}/{x}/{y}/2/1_1.png",{
    opacity:state.radarOpacity,zIndex:350,maxNativeZoom:7,maxZoom:18,updateWhenIdle:true,keepBuffer:1,
    attribution:'Radar imagery <a href="https://www.rainviewer.com/">RainViewer</a>'
   });
   layer.on("load",function(){if(state.radarLayer===layer)radarCleanLayer();});
   layer.on("tileerror",function(){state.radarTileErrors++;if(state.radarTileErrors===5&&$("map-tile-status")){
    setText("map-tile-status","Some radar tiles could not load. Check official BOM radar if imagery appears incomplete.");
    $("map-tile-status").hidden=false;}});
   state.radarLayer=layer;state.radarRenderedKey=key;layer.addTo(state.map);
   if(old)state.radarSwapTimer=setTimeout(radarCleanLayer,2600);
  }
 }
 updateRadarPreview(state.radarIndex);
}

function radarSetSpeed(value){
 state.radarSpeed=radarSettingSpeed(value);save();radarSyncPreferences();
 if(state.radarTimer)startRadarPlayback(true);
}
function radarSetOpacity(value){
 state.radarOpacity=radarSettingOpacity(value);save();
 if(state.radarLayer)state.radarLayer.setOpacity(state.radarOpacity);
 if(state.radarOutgoing)state.radarOutgoing.setOpacity(state.radarOpacity);
 if(state.peekLayer)state.peekLayer.setOpacity(state.radarOpacity);
 radarSyncPreferences();
}
function radarSyncPreferences(){
 const values={"radar-setting-auto":state.radarAutocheck,"radar-setting-follow":state.radarFollowLatest,
 "radar-setting-loop":state.radarLoop,"radar-setting-timestamp":state.radarShowTimestamp};
 Object.keys(values).forEach(function(id){if($(id))$(id).checked=values[id];});
 if($("radar-setting-opacity"))$("radar-setting-opacity").value=Math.round(state.radarOpacity*100);
 if($("radar-setting-opacity-label"))setText("radar-setting-opacity-label",Math.round(state.radarOpacity*100)+"%");
 if($("radar-setting-speed"))$("radar-setting-speed").value=String(state.radarSpeed);
 if($("radar-speed"))$("radar-speed").value=String(state.radarSpeed);
 const stamp=$("radar-map-stamp");if(stamp)stamp.hidden=!state.radarShowTimestamp||!state.radarFrames.length;
}
function radarUpdatePreference(key,value){
 if(key==="auto"){state.radarAutocheck=value;if(value)loadRadar(false);}
 if(key==="follow"){state.radarFollowLatest=value;if(value&&state.radarFrames.length)radarGoLatest();}
 if(key==="loop")state.radarLoop=value;
 if(key==="timestamp")state.radarShowTimestamp=value;
 save();radarSyncPreferences();
 setText("radar-preferences-status","Radar preferences saved on this device.");
}
function radarResetPreferences(){
 state.radarAutocheck=true;state.radarFollowLatest=true;state.radarLoop=true;
 state.radarShowTimestamp=true;state.radarSpeed=3500;state.radarOpacity=.6;
 state.radarEnabled=true;state.incidentsEnabled=true;state.warningsEnabled=true;
 state.mapNearbyOnly=true;state.mapWheelZoom=false;
 stopRadarPlayback();save();
 if(state.map){
  state.map.scrollWheelZoom.disable();
  updateMarkers();showRfsWarningMap();
  if(state.radarFrames.length)radarGoLatest();
 }
 if($("radar-setting-speed"))$("radar-setting-speed").value="3500";
 syncMapLayerUI();radarSyncPreferences();
 setText("radar-preferences-status","Radar defaults restored and saved.");
}

function radarUpdateQuality(){
 var label=$("radar-quality-status");
 if(!label||!state.map)return;
 var zoom=Number(state.map.getZoom()),isScaled=Number.isFinite(zoom)&&zoom>7;
 label.dataset.quality=isScaled?"scaled":"native";
 label.textContent=isScaled?
  "Radar zoom "+zoom+": source images enlarged beyond native zoom 7 (no extra radar detail).":
  "Radar source supports native detail through zoom 7.";
}

function radarSyncRegionSelection(){
 if(!state.map)return;
 document.querySelectorAll("[data-radar-region]").forEach(function(button){
  const active=button.dataset.radarRegion===state.radarCurrentRegion;
  button.classList.toggle("is-selected",active);
  button.setAttribute("aria-pressed",String(active));
 });
}
function radarSetRegion(mode){
 if(!state.map)return;
 state.radarCurrentRegion=mode;
 if(mode==="local")state.map.setView([state.location.lat,state.location.lon],10);
 if(mode==="region")state.map.setView([state.location.lat,state.location.lon],7);
 if(mode==="nsw")state.map.fitBounds([[-37.55,140.9],[-28.1,153.8]],{padding:[15,15]});
 if(mode==="australia")state.map.fitBounds([[-44.0,112.5],[-10.3,154.0]],{padding:[15,15]});
 radarSyncRegionSelection();radarUpdateQuality();
 mapInfo("Map view: "+({local:"Selected Location",region:"Regional Area",nsw:"New South Wales",australia:"Australia"}[mode]||"Selected Location")+".");
}
function radarReadSharedLink(){
 const search=new URLSearchParams(window.location.search);
 const lat=Number(search.get("lat")),lon=Number(search.get("lon")),zoom=Number(search.get("zoom"));
 if(search.has("lat")&&search.has("lon")&&search.has("zoom")&&
   Number.isFinite(lat)&&Math.abs(lat)<=90&&Number.isFinite(lon)&&Math.abs(lon)<=180&&
   Number.isFinite(zoom)&&zoom>=2&&zoom<=18){
  state.radarShareView={lat:lat,lon:lon,zoom:zoom};
  state.radarCurrentRegion="shared";
 }
 const epoch=Number(search.get("frame"));
 if(search.has("frame")&&Number.isFinite(epoch)&&epoch>0&&epoch*1000<Date.now()+600000&&epoch*1000>Date.now()-12*3600000){
  state.radarSharedAt=epoch;
 }
}
async function radarCopyLink(){
 if(!state.map)return;
 const c=state.map.getCenter(),zoom=state.map.getZoom(),current=radarFrame();
 const link=new URL(window.location.href);
 link.hash="";
 link.searchParams.set("lat",c.lat.toFixed(4));
 link.searchParams.set("lon",c.lng.toFixed(4));
 link.searchParams.set("zoom",String(zoom));
 if(current)link.searchParams.set("frame",String(current.time));else link.searchParams.delete("frame");
 try{
  if(!navigator.clipboard||!navigator.clipboard.writeText)throw Error("Clipboard not available");
  await navigator.clipboard.writeText(link.toString());
  message("Radar map link copied. It opens the same area and nearest available historical frame.");
 }catch(e){
  window.prompt("Copy this radar map link:",link.toString());
 }
}
function initRadarPreferences(){
 radarSyncPreferences();
 const panel=$("radar-preferences"),toggle=$("radar-preferences-toggle");
 if(panel&&toggle)toggle.addEventListener("click",function(){
  panel.hidden=!panel.hidden;toggle.setAttribute("aria-expanded",String(!panel.hidden));
 });
 [["auto","radar-setting-auto"],["follow","radar-setting-follow"],["loop","radar-setting-loop"],["timestamp","radar-setting-timestamp"]]
  .forEach(function(pair){on(pair[1],"change",function(e){radarUpdatePreference(pair[0],e.target.checked);});});
 on("radar-setting-opacity","input",function(e){radarSetOpacity(Number(e.target.value)/100);});
 on("radar-setting-speed","change",function(e){radarSetSpeed(e.target.value);});
 on("radar-reset-preferences","click",radarResetPreferences);
 on("radar-copy-link","click",radarCopyLink);
 document.querySelectorAll("[data-radar-region]").forEach(function(btn){
  btn.addEventListener("click",function(){radarSetRegion(btn.dataset.radarRegion);});
 });
 radarSyncRegionSelection();
}

async function loadRadar(force){
 if(!state.map&&!state.peekMap)return;
 if(state.radarLoadingPromise)return state.radarLoadingPromise;
 if(!force&&state.radarAttemptAt&&Date.now()-state.radarAttemptAt<RADAR_CHECK_MS-10000)return;
 state.radarAttemptAt=Date.now();
 if($("radar-check-now"))$("radar-check-now").disabled=true;
 state.radarLoadingPromise=(async function(){
  try{
   var raw=await getJSON(RADAR_URL,13000),u=new URL(String(raw.host||""));
   if(u.protocol!=="https:"||!/(^|\.)rainviewer\.com$/.test(u.hostname)||u.username||u.password)throw Error("Unexpected image server");
   if(!raw.radar||!Array.isArray(raw.radar.past))throw Error("Missing radar history");
   var now=Date.now()/1000,seen=new Map();
   raw.radar.past.forEach(function(f){
    if(f&&Number.isFinite(Number(f.time))&&f.time>0&&f.time<=now+600&&typeof f.path==="string"&&
       /^\/v2\/radar\/[A-Za-z0-9/_-]+$/.test(f.path))seen.set(Number(f.time),{time:Number(f.time),path:f.path});
   });
   var frames=Array.from(seen.values()).sort(function(a,b){return a.time-b.time;}).slice(-24);
   if(!frames.length)throw Error("No recent historical radar frames");
   var old=radarFrame(),oldTime=old?old.time:null,oldNewest=state.radarFrames[state.radarFrames.length-1]?.time;
   state.radarFrames=frames;state.radarHost=u.origin;state.radarFetchedAt=Date.now();state.radarLastError="";
   var index=frames.length-1;
   if(state.radarSharedAt!==null){
    index=frames.reduce(function(best,f,i){return Math.abs(f.time-state.radarSharedAt)<Math.abs(frames[best].time-state.radarSharedAt)?i:best;},0);
    state.radarSharedAt=null;state.radarFollowLatest=false;save();
    if($("radar-preferences-status"))setText("radar-preferences-status","Shared radar link opened. Showing the nearest available historical frame.");
   }else if(!state.radarFollowLatest&&oldTime!=null){
    index=frames.findIndex(function(f){return f.time===oldTime;});
    if(index<0)index=frames.reduce(function(best,f,i){return Math.abs(f.time-oldTime)<Math.abs(frames[best].time-oldTime)?i:best;},0);
   }
   showRadarFrame(index);radarStatus();
   if($("radar-latest"))$("radar-latest").textContent=oldNewest&&frames[frames.length-1].time>oldNewest&&!state.radarFollowLatest?"New Frame Available":"Go to Latest";
  }catch(e){
   state.radarLastError=String(e.message||e);
   if(!state.radarFrames.length){setText("radar-time","Radar unavailable");setText("radar-frame-label","Radar unavailable — check official BOM");}
   if($("radar-last-check"))setText("radar-last-check","Latest check failed"+(state.radarFetchedAt?" · Previously loaded history retained":""));
   radarStatus();
  }finally{state.radarLoadingPromise=null;if($("radar-check-now"))$("radar-check-now").disabled=false;}
 })();
 return state.radarLoadingPromise;
}
function stopRadarPlayback(){
 if(state.radarTimer){clearInterval(state.radarTimer);state.radarTimer=null;}
 if($("radar-play")){$("radar-play").textContent="▶ Play";$("radar-play").setAttribute("aria-label","Play Radar Animation");}
}
function startRadarPlayback(resume){
 if(state.radarFrames.length<2)return;
 stopRadarPlayback();state.radarFollowLatest=false;save();radarSyncPreferences();
 if(!resume&&state.radarIndex===state.radarFrames.length-1)showRadarFrame(0);
 if($("radar-play")){$("radar-play").textContent="Ⅱ Pause";$("radar-play").setAttribute("aria-label","Pause Radar Animation");}
 var speed=state.radarSpeed;
 state.radarTimer=setInterval(function(){
  if(document.visibilityState!=="visible"){stopRadarPlayback();return;}
  if(state.radarIndex+1>=state.radarFrames.length&&!state.radarLoop){stopRadarPlayback();return;}
  showRadarFrame((state.radarIndex+1)%state.radarFrames.length);
 },speed);
}
function toggleRadarPlay(){if(state.radarTimer)stopRadarPlayback();else startRadarPlayback(false);}
function radarSeek(i){
 stopRadarPlayback();state.radarFollowLatest=Number(i)>=state.radarFrames.length-1;save();showRadarFrame(i);
 if($("radar-latest"))$("radar-latest").textContent="Go to Latest";
}
function radarGoLatest(){
 stopRadarPlayback();state.radarFollowLatest=true;save();showRadarFrame(state.radarFrames.length-1);
 if($("radar-latest"))$("radar-latest").textContent="Go to Latest";
}
function initRadarRefresh(){
 setInterval(function(){if(state.radarAutocheck&&document.visibilityState==="visible")loadRadar(false);},RADAR_CHECK_MS);
 setInterval(function(){if(document.visibilityState==="visible")radarStatus();},60000);
 document.addEventListener("visibilitychange",function(){
  if(document.visibilityState!=="visible")stopRadarPlayback();
  else{if(state.radarAutocheck)loadRadar(false);radarStatus();}
 });
 window.addEventListener("pageshow",function(){if(state.radarAutocheck&&document.visibilityState==="visible")loadRadar(false);});
 window.addEventListener("online",function(){if(state.radarAutocheck&&document.visibilityState==="visible")loadRadar(false);});
}
function changeLocation(l){state.location=l;save();updateLocationUI();
 if(state.hazardMap){state.hazardMap.setView([l.lat,l.lon],8);renderFireAreaMap();}if(state.peekMap)state.peekMap.setView([l.lat,l.lon],8);if(state.map){state.map.setView([l.lat,l.lon],9);if(state.locationMarker)state.locationMarker.setLatLng([l.lat,l.lon]).bindPopup("Selected Location: "+esc(l.name));updateMarkers();}state.seen=null;if($("current-temp")||$("temp-chart"))loadWeather();if($("incidents-list")||$("snapshot-incidents"))renderIncidents();window.dispatchEvent(new Event("skypulse:watch-changed"));message("Location changed to "+l.name);}
var searchTimer=null;function searchLocation(text){clearTimeout(searchTimer);if(text.trim().length<2){$("location-results").hidden=true;return;}searchTimer=setTimeout(async function(){try{var q=new URLSearchParams({name:text.trim(),count:"7",language:"en",countryCode:"AU"});var data=await getJSON("https://geocoding-api.open-meteo.com/v1/search?"+q,9000),results=data.results||[];if($("location-input").value.trim()!==text.trim())return;var box=$("location-results");box.innerHTML="";if(!results.length){box.innerHTML='<div class="muted" style="padding:10px">No Australian matches</div>';}results.forEach(function(r){var b=document.createElement("button");b.type="button";b.setAttribute("role","option");b.innerHTML=esc(r.name)+'<small>'+esc([r.admin1,r.country].filter(Boolean).join(", "))+'</small>';b.addEventListener("click",function(){changeLocation({name:r.name,region:r.admin1||"",lat:r.latitude,lon:r.longitude});box.hidden=true;});box.appendChild(b);});box.hidden=false;}catch(e){$("location-results").hidden=true;}},350);}
function setupInstall(){var deferred=null;window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();deferred=e;$("install-button").hidden=false;});function install(){if(deferred){deferred.prompt();deferred.userChoice.finally(function(){deferred=null;$("install-button").hidden=true;});}else message("Install via your browser menu: Add to Home Screen / Install App. On iPhone use Safari → Share → Add to Home Screen.");}$("install-button").addEventListener("click",install);if($("settings-install"))$("settings-install").addEventListener("click",install);}
function setupNav(){
var page=document.body.dataset.page||"overview";
document.querySelectorAll(".mobile-tab,.nav-item,.page-shortcuts a").forEach(function(link){
 var active=link.dataset.tab===page||link.dataset.route===page||
   (page==="news"&&link.getAttribute("href")==="./news.html")||
   (page==="overview"&&link.getAttribute("href")==="./");
 link.classList.toggle("is-active",active&&link.classList.contains("mobile-tab"));
 if(link.classList.contains("nav-item"))link.classList.toggle("active",active);
 if(active)link.setAttribute("aria-current","page");else link.removeAttribute("aria-current");
});
}
function on(id,type,handler){var el=$(id);if(el)el.addEventListener(type,handler);}
function init(){
 window.SkyPulseWatchContext=function(){return {latitude:state.location.lat,longitude:state.location.lon,radiusKm:state.radius,locationName:state.location.name};};
 if(state.location&&state.location.name==="My location"){state.location.name="My Location";save();}
 theme();updateLocationUI();
 setText("year",new Date().getFullYear());
 on("theme-button","click",function(){state.theme=state.theme==="dark"?"light":"dark";save();theme();});
 on("location-input","input",function(e){searchLocation(e.target.value);});
 on("location-input","blur",function(){setTimeout(function(){if($("location-results"))$("location-results").hidden=true;},200);});
 on("geo-button","click",function(){if(!navigator.geolocation){message("Location is not supported on this device.");return;}
 navigator.geolocation.getCurrentPosition(function(p){changeLocation({name:"My Location",region:"Australia",lat:p.coords.latitude,lon:p.coords.longitude});},
 function(){message("Location access denied or unavailable. Use the location search instead.");},{timeout:10000,enableHighAccuracy:false});});
 function refreshPage(){
  if($("current-temp")||$("temp-chart"))loadWeather();
  if($("incidents-list")||$("snapshot-incidents")||$("weather-map"))loadHazards();
  if($("weather-map")||$("radar-peek-map"))loadRadar(true);
 }
 on("refresh-button","click",refreshPage);
 on("forecast-retry","click",loadWeather);
 document.querySelectorAll("[data-forecast-chart]").forEach(function(btn){
  btn.addEventListener("click",function(){state.forecastChartMode=btn.dataset.forecastChart;forecastChartRender();});
 });
 on("hazards-refresh","click",loadHazards);
 on("radius","input",function(e){state.radius=Number(e.target.value);save();setText("radius-label",state.radius+" km");
   renderIncidents();updateMarkers();renderFireAreaMap();window.dispatchEvent(new Event("skypulse:watch-changed"));});
 if($("notify-toggle"))$("notify-toggle").checked=state.notify;
 on("notify-toggle","change",function(e){state.notify=e.target.checked;save();
 setText("notification-state",state.notify?"In-app incident notifications are enabled only while SkyPulse AU is open.":"In-app incident notifications are off. Background push is controlled separately below.");});
 on("notify-permission","click",async function(){if(!("Notification" in window)){message("This browser does not support notifications.");return;}
 var p=await Notification.requestPermission();message("Browser notifications: "+p+". In-app incident notices work only while SkyPulse is open.");});
 on("fdr-district-select","change",function(e){state.fireDistrict=e.target.value;save();renderFireDanger();});
 on("radar-toggle","click",function(){setMapLayer("radar",!state.radarEnabled);});
 on("incidents-toggle","click",function(){setMapLayer("incidents",!state.incidentsEnabled);});
 on("radar-slider","input",function(e){radarSeek(Number(e.target.value));});
 on("radar-play","click",toggleRadarPlay);
 on("radar-speed","change",function(e){radarSetSpeed(e.target.value);});
 on("radar-latest","click",radarGoLatest);
 on("radar-check-now","click",function(){loadRadar(true);});
 on("radar-step-back","click",function(){radarSeek(state.radarIndex-1);});
 on("radar-step-forward","click",function(){radarSeek(state.radarIndex+1);});
 setupInstall();setupNav();
 if($("current-temp")||$("temp-chart"))loadWeather();
 if($("fire-area-map"))initFireAreaMap();
 if($("weather-map"))radarReadSharedLink();
 if($("weather-map")||$("radar-peek-map")){initMap();initRadarRefresh();}
 if($("weather-map"))initRadarPreferences();
 if($("incidents-list")||$("snapshot-incidents")||$("weather-map"))loadHazards();
 setInterval(function(){if(document.visibilityState==="visible"){if($("current-temp")||$("temp-chart"))loadWeather();
   if($("incidents-list")||$("snapshot-incidents")||$("weather-map"))loadHazards();}},15*60*1000);
 setInterval(function(){if(document.visibilityState==="visible"&&state.weather)forecastHealth();},60000);
}
document.addEventListener("DOMContentLoaded",init);
})();