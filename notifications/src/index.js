/**
 * SkyPulse AU opt-in Web Push gateway.
 * Free-tier starter: non-payload VAPID Web Push, D1 subscriptions,
 * Cloudflare Cron, official RFS data. NOT an emergency warning service.
 */
const SITE = "https://iillifoggyiilli.github.io/SkyPulse-AU/";
const DEFAULT_ORIGIN = "https://iillifoggyiilli.github.io";
const FEEDS = {
  warnings: SITE + "data/rfs-alerts.json",
  incidents: SITE + "data/rfs.json"
};
const MAX_FEED_AGE = 90 * 60 * 1000;
const MAX_SENDS_PER_RUN = 15;
const encoder = new TextEncoder();
const json = (data, status=200, headers={}) => new Response(JSON.stringify(data), {
  status, headers: {"content-type":"application/json; charset=utf-8","cache-control":"no-store",...headers}
});
function originOf(env) {return String(env.ALLOWED_ORIGIN || DEFAULT_ORIGIN).replace(/\/$/,"");}
function cors(env, request) {
  const origin = request.headers.get("Origin");
  if(origin !== originOf(env)) return {};
  return {"access-control-allow-origin":origin,"access-control-allow-methods":"GET, POST, OPTIONS",
    "access-control-allow-headers":"content-type","vary":"Origin","access-control-max-age":"600"};
}
function validEndpoint(value) {
  if(typeof value!=="string"||value.length>1800)return false;
  try {
    const u=new URL(value), h=u.hostname.toLowerCase();
    return u.protocol==="https:" && !u.username && !u.password &&
      (h==="fcm.googleapis.com" || h==="web.push.apple.com" ||
       h.endsWith(".push.services.mozilla.com") || h.endsWith(".push.apple.com"));
  } catch {return false;}
}
function base64url(bytes) {
  let str="";for(const x of new Uint8Array(bytes))str+=String.fromCharCode(x);
  return btoa(str).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function unbase64url(s) {
  const t=s.replace(/-/g,"+").replace(/_/g,"/");
  const raw=atob(t+"=".repeat((4-t.length%4)%4));
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
async function endpointId(endpoint) {
  return base64url(await crypto.subtle.digest("SHA-256",encoder.encode(endpoint)));
}
function configured(env) {
  return Boolean(env.DB && env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_PKCS8 &&
      env.VAPID_PUBLIC_KEY.length>40 && env.VAPID_PRIVATE_PKCS8.length>60);
}
async function handleFetch(request,env) {
  const u=new URL(request.url), pathname=u.pathname, headers=cors(env,request);
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(request.method==="GET" && pathname==="/health")
    return json({service:"SkyPulse AU Background Alerts",ready:configured(env),mode:"opt-in",sources:["NSW RFS warning polygons","NSW RFS incident locations"],guaranteed_delivery:false},200,headers);
  if(request.method==="GET" && pathname==="/public-key") {
    if(!configured(env))return json({error:"Notification gateway not configured"},503,headers);
    return json({publicKey:env.VAPID_PUBLIC_KEY},200,headers);
  }
  if(!["/subscribe","/unsubscribe"].includes(pathname) || request.method!=="POST")
    return json({error:"Not found"},404,headers);
  if(request.headers.get("Origin")!==originOf(env))return json({error:"Origin not permitted"},403);
  if(!configured(env))return json({error:"Push backend not configured"},503,headers);
  if(Number(request.headers.get("content-length")||0)>5000)return json({error:"Request too large"},413,headers);
  let payload;
  try {payload=await request.json();}catch{return json({error:"Invalid JSON"},400,headers);}
  if(!validEndpoint(payload?.endpoint))return json({error:"Invalid subscription endpoint"},400,headers);
  const id=await endpointId(payload.endpoint);
  if(pathname==="/unsubscribe") {
    await env.DB.prepare("DELETE FROM subscriptions WHERE id=?").bind(id).run();
    await env.DB.prepare("DELETE FROM deliveries WHERE subscription_id=?").bind(id).run();
    return json({unsubscribed:true},200,headers);
  }
  const lat=Number(payload.latitude),lon=Number(payload.longitude),radius=Number(payload.radiusKm);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat < -44||lat > -10||lon < 110||lon > 155||
      !Number.isInteger(radius)||radius < 10||radius > 150)
    return json({error:"Please select a valid Australian watch location and 10–150 km radius"},400,headers);
  const roundedLat=Math.round(lat*100)/100,roundedLon=Math.round(lon*100)/100;
  const includeIncidents=payload.includeIncidents===true?1:0,now=Date.now();
  await env.DB.prepare(
    "INSERT INTO subscriptions (id,endpoint,latitude,longitude,radius_km,include_incidents,created_at,updated_at) "+
    "VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET latitude=excluded.latitude, longitude=excluded.longitude, "+
    "radius_km=excluded.radius_km,include_incidents=excluded.include_incidents,updated_at=excluded.updated_at"
  ).bind(id,payload.endpoint,roundedLat,roundedLon,radius,includeIncidents,now,now).run();
  return json({subscribed:true,watchRadiusKm:radius,approximateLocation:true,
    message:"Background alerts are informational, best-effort and not emergency warnings."},200,headers);
}
function toRad(v){return v*Math.PI/180;}
function km(a,b,c,d){const dp=toRad(c-a),dl=toRad(d-b);
 const x=Math.sin(dp/2)**2+Math.cos(toRad(a))*Math.cos(toRad(c))*Math.sin(dl/2)**2;
 return 12742*Math.atan2(Math.sqrt(x),Math.sqrt(Math.max(0,1-x)));}
function featurePoint(feature) {
  const g=feature?.geometry||{},c=g.coordinates;
  if(g.type==="Point"&&Array.isArray(c)&&c.length>=2)return [Number(c[1]),Number(c[0])];
  if(g.type==="GeometryCollection"){
    const point=(g.geometries||[]).find(g=>g?.type==="Point"&&Array.isArray(g.coordinates));
    if(point)return [Number(point.coordinates[1]),Number(point.coordinates[0])];
  }
  // Do not guess a point for a non-point geometry when matching incident proximity.
  return null;
}
function pointInPolygon(lat,lon,poly){
  let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const yi=poly[i][0],xi=poly[i][1],yj=poly[j][0],xj=poly[j][1];
    if(((yi>lat)!==(yj>lat)) && lon < (xj-xi)*(lat-yi)/(yj-yi)+xi)inside=!inside;
  }return inside;
}
function distanceToSegmentKm(lat,lon,a,b){
  // Equirectangular projection at the watch location; suitable for local NSW matching.
  const scaleX=111.32*Math.cos(toRad(lat)),scaleY=111.2;
  const ax=(a[1]-lon)*scaleX,ay=(a[0]-lat)*scaleY;
  const bx=(b[1]-lon)*scaleX,by=(b[0]-lat)*scaleY;
  const dx=bx-ax,dy=by-ay;
  const t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(ax+t*dx,ay+t*dy);
}
function withinWarning(sub,ev){
  let polygons;try{polygons=JSON.parse(ev.polygons_json||"[]");}catch{return false;}
  if(!Array.isArray(polygons))return false;
  for(const p of polygons){
    if(!Array.isArray(p)||p.length<3||p.length>3000)continue;
    if(pointInPolygon(sub.latitude,sub.longitude,p))return true;
    for(let i=0;i<p.length;i++){
      if(distanceToSegmentKm(sub.latitude,sub.longitude,p[i],p[(i+1)%p.length])<=sub.radius_km)return true;
    }
  }return false;
}
function relevant(sub,ev) {
  if(ev.kind==="warning")return withinWarning(sub,ev);
  if(ev.kind==="incident"&&sub.include_incidents===1&&ev.latitude!==null&&ev.longitude!==null)
    return km(sub.latitude,sub.longitude,ev.latitude,ev.longitude)<=sub.radius_km;
  return false;
}
async function fetchFresh(url){
  const response=await fetch(url,{headers:{"accept":"application/json"},cf:{cacheTtl:0,cacheEverything:false}});
  if(!response.ok)throw Error("Source returned HTTP "+response.status);
  const data=await response.json();
  const age=Date.now()-Date.parse(data?.retrieved_at);
  if(!data?.retrieved_at||data.error||!Number.isFinite(age)||age<0||age>MAX_FEED_AGE)
    throw Error("Source stale or unavailable");
  return data;
}
function sourcesToEvents(warnings,incidents){
  const output=[];
  if(warnings?.alerts&&Array.isArray(warnings.alerts)){
    for(const w of warnings.alerts.slice(0,100)){
      if(w.status!=="Actual"||["Cancel","Error","Ack"].includes(w.message_type))continue;
      if(!Array.isArray(w.polygons)||!w.polygons.length)continue;
      const expires=Date.parse(w.expires);if(Number.isFinite(expires)&&expires<Date.now())continue;
      const stable=String(w.incident_id||w.id||"").slice(0,160);
      if(!stable)continue;
      const polygon=JSON.stringify(w.polygons);
      if(polygon.length>45000)continue;
      output.push({event_id:"warning:"+stable+":"+String(w.severity||"").slice(0,30),
        kind:"warning",latitude:null,longitude:null,polygons_json:polygon});
    }
  }
  if(incidents?.features&&Array.isArray(incidents.features)){
    for(const f of incidents.features.slice(0,300)){
      const p=featurePoint(f);if(!p||!p.every(Number.isFinite))continue;
      const props=f.properties||{};
      const id=String(f.id||props.guid||props.id||props.link||"").slice(0,240);
      if(!id)continue;
      output.push({event_id:"incident:"+id,kind:"incident",latitude:p[0],longitude:p[1],polygons_json:"[]"});
    }
  }
  return output;
}
async function vapidToken(endpoint,env){
  const key=await crypto.subtle.importKey("pkcs8",unbase64url(env.VAPID_PRIVATE_PKCS8),
    {name:"ECDSA",namedCurve:"P-256"},false,["sign"]);
  const payload={aud:new URL(endpoint).origin,exp:Math.floor(Date.now()/1000)+3600,sub:SITE};
  const input=base64url(encoder.encode(JSON.stringify({typ:"JWT",alg:"ES256"})))+"."+
    base64url(encoder.encode(JSON.stringify(payload)));
  const sig=await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},key,encoder.encode(input));
  return input+"."+base64url(sig);
}
async function sendPush(endpoint,env){
  if(!validEndpoint(endpoint))return 410;
  const jwt=await vapidToken(endpoint,env);
  const r=await fetch(endpoint,{method:"POST",headers:{
      "Authorization":"vapid t="+jwt+", k="+env.VAPID_PUBLIC_KEY,
      "TTL":"3600","Urgency":"normal"
    }});
  return r.status;
}
async function scheduled(env){
  if(!configured(env))return;
  const now=Date.now();let warnings=null,incidents=null;
  // Individual source failures never imply the absence of warnings.
  try{warnings=await fetchFresh(FEEDS.warnings);}catch(e){console.warn("RFS warnings unavailable:",String(e));}
  try{incidents=await fetchFresh(FEEDS.incidents);}catch(e){console.warn("RFS incidents unavailable:",String(e));}
  if(!warnings&&!incidents)return;
  const incoming=sourcesToEvents(warnings,incidents);
  const count=await env.DB.prepare("SELECT COUNT(*) AS total FROM observed_events").first();
  const initial=Number(count?.total||0)===0;
  const firstSeen=initial?now-86400000:now;
  for(const ev of incoming){
    await env.DB.prepare("INSERT OR IGNORE INTO observed_events "+
      "(id,kind,latitude,longitude,polygons_json,first_seen) VALUES (?,?,?,?,?,?)")
      .bind(ev.event_id,ev.kind,ev.latitude,ev.longitude,ev.polygons_json,firstSeen).run();
  }
  // Keep only recent events so reappearing old events may legitimately be notified again.
  await env.DB.prepare("DELETE FROM observed_events WHERE first_seen < ?").bind(now-7*86400000).run();
  await env.DB.prepare("DELETE FROM deliveries WHERE sent_at < ?").bind(now-8*86400000).run();
  const [subscriptions,events]=await Promise.all([
    env.DB.prepare("SELECT * FROM subscriptions ORDER BY updated_at DESC LIMIT 150").all(),
    env.DB.prepare("SELECT * FROM observed_events WHERE first_seen > ? ORDER BY first_seen ASC LIMIT 150")
      .bind(now-3*3600000).all()
  ]);
  const activeIds=new Set(incoming.map(x=>x.event_id));
  let sent=0;
  for(const sub of subscriptions.results||[]){
    for(const ev of events.results||[]){
      if(sent>=MAX_SENDS_PER_RUN)return;
      if(!activeIds.has(ev.id)||ev.first_seen<=sub.created_at||!relevant(sub,ev))continue;
      const already=await env.DB.prepare("SELECT 1 AS sent FROM deliveries WHERE subscription_id=? AND event_id=?")
        .bind(sub.id,ev.id).first();
      if(already)continue;
      try{
        const status=await sendPush(sub.endpoint,env);
        if(status===404||status===410){
          await env.DB.prepare("DELETE FROM subscriptions WHERE id=?").bind(sub.id).run();break;
        }
        if(status>=200&&status<300){
          await env.DB.prepare("INSERT OR IGNORE INTO deliveries (subscription_id,event_id,sent_at) VALUES (?,?,?)")
            .bind(sub.id,ev.id,now).run();
          sent++;
        }else{console.warn("Push endpoint returned",status);}
      }catch(e){console.warn("Push delivery failed:",String(e));}
    }
  }
  console.log("SkyPulse opt-in delivery: "+sent+" best-effort notifications");
}
export default {
  async fetch(request,env){try{return await handleFetch(request,env);}catch(e){console.error("Request failed:",String(e));return json({error:"Service temporarily unavailable"},503,cors(env,request));}},
  async scheduled(event,env,ctx){ctx.waitUntil(scheduled(env));}
};
