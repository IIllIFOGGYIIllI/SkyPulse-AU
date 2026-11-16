#!/usr/bin/env python3
"""Diagnostic for real free weather providers. No credentials and no fictional samples."""
import json
import urllib.error
import urllib.parse
import urllib.request
import datetime as dt

base_params={"latitude":-32.8321,"longitude":151.3497,"timezone":"auto","forecast_hours":48,
 "hourly":"temperature_2m,precipitation,wind_gusts_10m"}
cases=[
 ("ECMWF IFS","https://api.open-meteo.com/v1/ecmwf",base_params),
 ("NOAA GFS","https://api.open-meteo.com/v1/gfs",base_params),
 ("Primary Best Match","https://api.open-meteo.com/v1/forecast",
  {"latitude":-32.8321,"longitude":151.3497,"timezone":"auto","forecast_days":7,
   "current":"temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,is_day,pressure_msl,cloud_cover,dew_point_2m",
   "hourly":"temperature_2m,precipitation_probability,precipitation,weather_code,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,is_day",
   "daily":"weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max"})
]
for name,url,params in cases:
 full=url+"?"+urllib.parse.urlencode(params)
 try:
  with urllib.request.urlopen(urllib.request.Request(full,headers={"User-Agent":"SkyPulseAU-QualityCheck/1.0","Accept":"application/json"}),timeout=20) as res:
   payload=json.loads(res.read(500000))
   hourly=payload.get("hourly") or {}
   checks={k:sum(v is not None for v in hourly.get(k,[]))
     for k in ("temperature_2m","precipitation","wind_gusts_10m")}
   print(name,"HTTP",res.status,"offset",payload.get("utc_offset_seconds"),
    "hours",len(hourly.get("time") or []),"valid fields",checks,
    "current-temp",(payload.get("current") or {}).get("temperature_2m"),
    "error",payload.get("error"),"reason",str(payload.get("reason",""))[:100])
 except urllib.error.HTTPError as exc:
  print(name,"HTTP",exc.code,"body",exc.read(500).decode("utf-8","replace"))
 except Exception as exc:
  print(name,type(exc).__name__,str(exc)[:180])
