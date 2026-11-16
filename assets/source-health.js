/* SkyPulse AU: source-status dashboard. Recent retrieval is NEVER an all-clear. */
(function(){
"use strict";
if(!document.getElementById("source-health-centre"))return;
const $=id=>document.getElementById(id),FEEDS=[
 {id:"rfs",name:"NSW RFS Incidents",file:"rfs.json",field:"features",url:"https://www.rfs.nsw.gov.au/"},
 {id:"fdr",name:"Fire Danger & Bans",file:"fdr.json",field:"districts",url:"https://www.rfs.nsw.gov.au/fire-information/fdr-and-tobans"},
 {id:"cap",name:"RFS Warning Areas",file:"rfs-alerts.json",field:"alerts",url:"https://www.rfs.nsw.gov.au/fire-information/alerts-and-warnings"},
 {id:"bom",name:"BOM RSS Notices",file:"bom.json",field:"warnings",url:"https://www.bom.gov.au/weather-and-climate/warnings-and-alerts"},
 {id:"wmo",name:"WMO Publication Index",file:"wmo-bom.json",field:"entries",url:"https://www.bom.gov.au/weather-and-climate/warnings-and-alerts"}
];
let busy=false;
const set=(id,value)=>{if($(id))$(id).textContent=value;};
const clock=time=>new Intl.DateTimeFormat("en-AU",{timeZone:"Australia/Sydney",day:"numeric",month:"short",
 hour:"numeric",minute:"2-digit",timeZoneName:"short",hour12:true}).format(time);
function evaluate(data,source){
 if(!data||data.error||!Array.isArray(data[source.field]))return {kind:"unavailable",label:"Unavailable",info:"No verifiable snapshot. Check the publisher."};
 const timestamp=Date.parse(data.retrieved_at||"");
 if(!Number.isFinite(timestamp)||timestamp>Date.now()+60000)return {kind:"unavailable",label:"Unverified",info:"Retrieval timestamp unavailable or invalid."};
 const age=Date.now()-timestamp;
 const kind=age>180*60000?"stale":age>90*60000?"delayed":"recent";
 return {kind,label:kind==="recent"?"Recent Snapshot":kind==="delayed"?"Delayed Snapshot":"Stale Snapshot",
 info:"Retrieved "+clock(timestamp)+" · "+Math.round(age/60000)+" min old · "+data[source.field].length+
 " source records (not a verified all-clear)"};
}
async function inspect(source){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),9000);
 try{
  const result=await fetch("./data/"+source.file+"?health="+Date.now(),{cache:"no-store",signal:ctrl.signal});
  if(!result.ok)throw Error("HTTP "+result.status);
  return evaluate(await result.json(),source);
 }catch{return {kind:"unavailable",label:"Unavailable",info:"Cannot verify this feed. Open its publisher's official site."};}
 finally{clearTimeout(timer);}
}
async function refresh(){
 if(busy)return;busy=true;
 set("source-health-summary","Checking official feed snapshots…");
 if($("source-health-refresh"))$("source-health-refresh").disabled=true;
 try{
  const results=await Promise.all(FEEDS.map(inspect));
  let problems=0;
  FEEDS.forEach((feed,i)=>{
   const r=results[i],el=$("source-health-"+feed.id);
   el.dataset.health=r.kind;
   set("source-health-"+feed.id+"-state",r.label);
   set("source-health-"+feed.id+"-detail",r.info);
   if(r.kind!=="recent")problems++;
  });
  set("source-health-summary",problems?
   problems+" of "+FEEDS.length+" feeds are delayed, stale or unavailable. Check official sources before making safety decisions.":
   "All five snapshots were retrieved recently. This does NOT confirm that no hazards or warnings exist.");
  set("source-health-checked","Checked "+clock(Date.now()));
 }finally{busy=false;if($("source-health-refresh"))$("source-health-refresh").disabled=false;}
}
const grid=$("source-health-grid");
for(const feed of FEEDS){
 const card=document.createElement("article");card.className="source-health-item";
 card.id="source-health-"+feed.id;card.dataset.health="checking";
 const top=document.createElement("div");top.className="source-health-row";
 const heading=document.createElement("strong");heading.textContent=feed.name;
 const state=document.createElement("span");state.id=card.id+"-state";state.textContent="Checking";
 top.append(heading,state);
 const detail=document.createElement("p");detail.id=card.id+"-detail";detail.textContent="Retrieving source status…";
 const link=document.createElement("a");link.href=feed.url;link.rel="noopener noreferrer";link.target="_blank";link.textContent="View Publisher ↗";
 card.append(top,detail,link);grid.append(card);
}
$("source-health-refresh")?.addEventListener("click",refresh);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")refresh();});
setInterval(()=>{if(document.visibilityState==="visible")refresh();},15*60*1000);
if(document.readyState!=="complete")document.addEventListener("DOMContentLoaded",refresh,{once:true});
else refresh();
})();