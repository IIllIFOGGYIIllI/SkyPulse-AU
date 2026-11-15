#!/usr/bin/env python3
"""Download public data into static JSON for GitHub Pages. No scraping or third-party proxy."""
from __future__ import annotations
import datetime as dt
import json
import pathlib
import urllib.request
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "data"
OUT.mkdir(exist_ok=True)
UA = "SkyPulseAU/1.0 (+https://github.com/IIllIFOGGYIIllI/SkyPulse-AU; non-commercial aggregation)"

def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

def download(url):
    request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json, application/xml, text/xml, */*"})
    with urllib.request.urlopen(request, timeout=24) as response:
        return response.read(8_000_000)

def write(filename, payload):
    (OUT / filename).write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

def load_rfs():
    source = "https://www.rfs.nsw.gov.au/feeds/majorIncidents.json"
    try:
        payload = json.loads(download(source).decode("utf-8-sig"))
        if not isinstance(payload, dict) or not isinstance(payload.get("features"), list):
            raise ValueError("Response is not a GeoJSON FeatureCollection")
        # Keep only bounded, ordinary GeoJSON features; avoid unnecessary properties.
        features = []
        for item in payload["features"][:3000]:
            if not isinstance(item, dict) or not isinstance(item.get("geometry"), dict):
                continue
            p = item.get("properties") or {}
            if not isinstance(p, dict):
                p = {}
            names = ("title", "name", "incidentName", "eventName", "alertLevel", "alert-level", "alert", "status", "link", "url", "guid", "id", "type", "fire", "location", "updated")
            features.append({"type": "Feature", "id": str(item.get("id", ""))[:200], "geometry": item["geometry"], "properties": {k: str(p.get(k, ""))[:800] for k in names if p.get(k) is not None}})
        write("rfs.json", {"source": source, "retrieved_at": now(), "features": features, "warning": "Indicative incident location data. Not emergency instructions."})
        print("RFS features:", len(features))
    except Exception as exc:
        print("RFS feed unavailable:", type(exc).__name__, str(exc)[:200])
        write("rfs.json", {"source": source, "retrieved_at": None, "features": [], "error": "Source retrieval failed; verify with NSW RFS."})

def load_bom():
    source = "https://www.bom.gov.au/fwo/IDZ00054.warnings_nsw.xml"
    try:
        root = ET.fromstring(download(source))
        items = []
        for item in root.findall(".//item")[:60]:
            title = (item.findtext("title") or "").strip()[:500]
            link = (item.findtext("link") or "").strip()
            date = (item.findtext("pubDate") or "").strip()[:120]
            if title and link.startswith("https://www.bom.gov.au/"):
                items.append({"title": title, "link": link, "published": date})
            elif title and link.startswith("http://www.bom.gov.au/"):
                items.append({"title": title, "link": link.replace("http://", "https://", 1), "published": date})
        write("bom.json", {"source": source, "retrieved_at": now(), "warnings": items, "scope": "NSW/ACT statewide — not location-filtered"})
        print("BOM warning entries:", len(items))
    except Exception as exc:
        print("BOM feed unavailable:", type(exc).__name__, str(exc)[:200])
        write("bom.json", {"source": source, "retrieved_at": None, "warnings": [], "error": "Source retrieval failed; verify with BOM."})

def load_fire_danger():
    """Parse the RFS's CC BY district ratings and total fire bans (today/tomorrow)."""
    source = "https://www.rfs.nsw.gov.au/feeds/fdrToban.xml"
    try:
        root = ET.fromstring(download(source))
        if root.tag.split("}")[-1] != "FireDangerMap":
            raise ValueError("Unexpected Fire Danger Map root element")
        districts = []
        for item in root.iter():
            if item.tag.split("}")[-1] != "District":
                continue
            data = {child.tag.split("}")[-1]: (child.text or "").strip() for child in item}
            name = data.get("Name", "")
            if not name:
                continue
            toban_today = data.get("FireBanToday", "").lower()
            toban_tomorrow = data.get("FireBanTomorrow", "").lower()
            districts.append({
                "name": name[:100],
                "rating_today": data.get("DangerLevelToday", "")[:60],
                "rating_tomorrow": data.get("DangerLevelTomorrow", "")[:60],
                "ban_today": toban_today == "yes" if toban_today in ("yes", "no") else None,
                "ban_tomorrow": toban_tomorrow == "yes" if toban_tomorrow in ("yes", "no") else None
            })
        if not districts:
            raise ValueError("No district data found")
        write("fdr.json", {
            "source": source,
            "retrieved_at": now(),
            "districts": districts,
            "scope": "NSW RFS fire weather districts",
            "warning": "Check the official NSW RFS site for current fire danger and total fire ban instructions."
        })
        print("RFS fire-danger districts:", len(districts),
              "Greater Hunter:", next((x for x in districts if x["name"].lower() == "greater hunter"), "not present"))
    except Exception as exc:
        print("RFS fire danger unavailable:", type(exc).__name__, str(exc)[:220])
        write("fdr.json", {"source": source, "retrieved_at": None, "districts": [], "error": "Source retrieval failed. Check NSW RFS."})


if __name__ == "__main__":
    load_rfs()
    load_bom()
    load_fire_danger()
