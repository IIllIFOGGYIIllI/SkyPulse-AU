#!/usr/bin/env python3
"""Non-blocking smoke test of the live Open-Meteo fields used by SkyPulse AU."""
import json
import urllib.parse
import urllib.request

query = {
    "latitude": -32.8321,
    "longitude": 151.3497,
    "current": "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,is_day,pressure_msl,cloud_cover,dew_point_2m",
    "hourly": "temperature_2m,precipitation_probability,precipitation,weather_code,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,is_day",
    "daily": "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max",
    "timezone": "auto",
    "forecast_days": 7,
}
url = "https://api.open-meteo.com/v1/forecast?" + urllib.parse.urlencode(query)
req = urllib.request.Request(url, headers={"User-Agent": "SkyPulseAU/1.0", "Accept": "application/json"})
with urllib.request.urlopen(req, timeout=18) as response:
    raw = response.read(2_000_000)
data = json.loads(raw)
assert not data.get("error"), data.get("reason", "API returned an error")
for key in ("temperature_2m", "pressure_msl", "cloud_cover", "dew_point_2m", "wind_direction_10m"):
    assert isinstance(data.get("current", {}).get(key), (int, float)), "Missing current " + key
for key in ("precipitation", "wind_gusts_10m", "relative_humidity_2m", "is_day"):
    assert len(data.get("hourly", {}).get(key, [])) >= 24, "Missing hourly " + key
for key in ("precipitation_probability_max", "wind_gusts_10m_max", "sunrise", "sunset", "uv_index_max"):
    assert len(data.get("daily", {}).get(key, [])) >= 2, "Missing daily " + key
print("SkyPulse API smoke test PASSED: current observations explicitly model-based; day 1/day 2 forecast fields available")
