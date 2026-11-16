#!/usr/bin/env python3
"""Free same-origin Cessnock model snapshot. Never invent values or reuse failed captures."""
import datetime as dt
import json
import pathlib
import urllib.parse
import urllib.request

ROOT=pathlib.Path(__file__).resolve().parents[1]
PATH=ROOT/"data"/"weather-cessnock.json"
PATH.parent.mkdir(exist_ok=True)
Q={
 "latitude":-32.8321,"longitude":151.3497,
 "current":"temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,is_day,pressure_msl,cloud_cover,dew_point_2m",
 "hourly":"temperature_2m,precipitation_probability,precipitation,weather_code,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,is_day",
 "daily":"weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max",
 "timezone":"auto","forecast_days":7
}
snapshot={
 "location":"Cessnock","retrieved_at":None,
 "source":"https://api.open-meteo.com/v1/forecast",
 "note":"Numerical model forecast for fixed Cessnock coordinates only, not direct observations, current weather or official warnings."
}
try:
 url=snapshot["source"]+"?"+urllib.parse.urlencode(Q)
 req=urllib.request.Request(url,headers={"Accept":"application/json","User-Agent":"SkyPulseAU-Backup/1.0"})
 with urllib.request.urlopen(req,timeout=20) as response:
  data=json.loads(response.read(600_000))
 if data.get("error") or not isinstance((data.get("current") or {}).get("temperature_2m"),(float,int)):
  raise ValueError("Primary model data missing")
 if len((data.get("hourly") or {}).get("time",[]))<24 or len((data.get("daily") or {}).get("time",[]))<2:
  raise ValueError("Incomplete forecast hours/days")
 snapshot["primary"]=data
 snapshot["retrieved_at"]=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00","Z")
 print("Cessnock backup ready:",data["current"].get("time"),data["current"]["temperature_2m"],"C")
except Exception as exc:
 snapshot["error"]="Source check failed: no verified backup available."
 print("Cessnock backup unavailable:",type(exc).__name__,str(exc)[:170])
PATH.write_text(json.dumps(snapshot,separators=(",",":"),ensure_ascii=False)+"\n",encoding="utf-8")
