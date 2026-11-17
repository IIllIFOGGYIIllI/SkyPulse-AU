#!/usr/bin/env python3
"""Persist a last-good Cessnock model snapshot across free GitHub Actions deployments.

Provider failures never advance the timestamp or overwrite previously validated forecasts.
Browser clients independently reject snapshots more than 18 hours old.
"""
import concurrent.futures
import datetime as dt
import json
import os
import pathlib
import time
import urllib.parse
import urllib.request

ROOT=pathlib.Path(__file__).resolve().parents[1]
PATH=ROOT/"data"/"weather-cessnock.json"
PATH.parent.mkdir(exist_ok=True)
SOURCE="https://api.open-meteo.com"
Q={
 "latitude":-32.8321,"longitude":151.3497,"timezone":"auto",
 "current":"temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,is_day,pressure_msl,cloud_cover,dew_point_2m",
 "hourly":"temperature_2m,precipitation_probability,precipitation,weather_code,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,is_day",
 "daily":"weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max",
 "forecast_days":7
}
MQ={"latitude":-32.8321,"longitude":151.3497,"timezone":"auto",
 "hourly":"temperature_2m,precipitation,wind_gusts_10m","forecast_hours":48}

def stamp():
 return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00","Z")

def valid_primary(data):
 if not isinstance(data,dict) or data.get("error"):raise ValueError("Invalid primary response")
 current,hourly,daily=data.get("current") or {},data.get("hourly") or {},data.get("daily") or {}
 if not isinstance(current.get("temperature_2m"),(float,int)) or not current.get("time"):
  raise ValueError("Missing primary model current time or temperature")
 if len(hourly.get("time") or [])<24 or len(daily.get("time") or [])<2:
  raise ValueError("Primary model missing forecast hours or days")
 if not isinstance(data.get("utc_offset_seconds"),(float,int)):raise ValueError("Missing timezone offset")
 return data

def valid_model(data):
 if not isinstance(data,dict) or data.get("error"):raise ValueError("Invalid model response")
 h=data.get("hourly") or {}
 if len(h.get("time") or [])<24 or not isinstance(data.get("utc_offset_seconds"),(float,int)):
  raise ValueError("Missing model hours/timezone")
 for field in ("temperature_2m","precipitation","wind_gusts_10m"):
  arr=h.get(field)
  if not isinstance(arr,list) or len(arr)!=len(h["time"]) or sum(v is not None for v in arr)<24:
   raise ValueError("Missing "+field)
 return data

def request(path,params):
 url=SOURCE+path+"?"+urllib.parse.urlencode(params)
 errors=[]
 for attempt in range(4):
  try:
   req=urllib.request.Request(url,headers={"Accept":"application/json","User-Agent":"SkyPulseAU-Backup/1.1"})
   with urllib.request.urlopen(req,timeout=9) as response:
    return json.loads(response.read(800_000))
  except Exception as exc:
   errors.append(type(exc).__name__+": "+str(exc)[:90])
   if attempt<3:time.sleep(.45*(attempt+1))
 raise RuntimeError(" | ".join(errors))

def load_previous():
 if not PATH.exists():return {}
 try:
  old=json.loads(PATH.read_text(encoding="utf-8"))
  if old.get("location")!="Cessnock":return {}
  if old.get("primary"):valid_primary(old["primary"])
  else:old.pop("retrieved_at",None)
  models=old.get("models") or {}
  if all(name in models for name in ("ecmwf","gfs")):
   for name in ("ecmwf","gfs"):valid_model(models[name])
  else:
   old.pop("models",None);old.pop("models_retrieved_at",None)
  return old
 except Exception:return {}

def publish():
 data=load_previous()
 data.update({
  "location":"Cessnock",
  "coordinates":{"lat":-32.8321,"lon":151.3497},
  "source":SOURCE+"/v1/forecast",
  "warning":"Forecast MODEL reference only, not a live weather observation or official warning; saved retrieval timestamps can be old.",
  "last_attempt_at":stamp()
 })
 names=("primary","ecmwf","gfs")
 def get(name):
  path="/v1/forecast" if name=="primary" else "/v1/"+name
  q=Q if name=="primary" else MQ
  result=request(path,q)
  return valid_primary(result) if name=="primary" else valid_model(result)
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
  futures={name:pool.submit(get,name) for name in names}
  captures={};errors={}
  for name,future in futures.items():
   try:captures[name]=future.result()
   except Exception as exc:errors[name]=type(exc).__name__+": "+str(exc)[:180]
 fresh="primary" in captures
 if fresh:
  data["primary"]=captures["primary"]
  data["retrieved_at"]=stamp()
 if "ecmwf" in captures and "gfs" in captures:
  data["models"]={name:captures[name] for name in ("ecmwf","gfs")}
  data["models_retrieved_at"]=stamp()
 if errors:data["latest_errors"]=errors
 else:data.pop("latest_errors",None)
 if not fresh and "primary" not in data:
  data["error"]="No last-good forecast available; verify official sources."
 else:data.pop("error",None)
 PATH.write_text(json.dumps(data,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
 print("Cessnock forecast snapshot:",
  "refreshed" if fresh else "preserved previous verified reading" if data.get("primary") else "unavailable",
  "model pair:",bool(data.get("models")),"source failures:",errors)
 output=os.getenv("GITHUB_OUTPUT")
 if output:
  with open(output,"a",encoding="utf-8") as fp:fp.write("fresh_primary="+("true" if fresh else "false")+"\n")

if __name__=="__main__":publish()
