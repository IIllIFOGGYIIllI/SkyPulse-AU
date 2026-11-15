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

def safe_geometry(g):
    """Preserve published fire incident point and area geometry without inventing shapes.

    GeoJSON uses [longitude, latitude]. Reject unbounded/invalid partial rings.
    """
    if not isinstance(g, dict):
        return None

    def coord(p):
        if not isinstance(p, (tuple, list)) or len(p) < 2:
            return None
        try:
            a, b = float(p[0]), float(p[1])
            if all(map(lambda n: n == n and abs(n) != float("inf"), (a, b))) and 110 <= a <= 155 and -45 <= b <= -8:
                return [a, b]
        except (TypeError, ValueError, OverflowError):
            pass
        return None

    def ring(raw):
        if not isinstance(raw, list) or not 3 <= len(raw) <= 5000:
            return None
        points = [coord(p) for p in raw]
        if None in points:
            return None
        # Leave original vertices intact; an artificial clip is not a valid fire boundary.
        if points[0] != points[-1]:
            points.append(points[0])
        return points if len({tuple(p) for p in points}) >= 3 else None

    def polygon(raw):
        if not isinstance(raw, list) or not 1 <= len(raw) <= 12:
            return None
        rings = [ring(r) for r in raw]
        if not rings or rings[0] is None:
            return None
        # Skip invalid holes rather than silently displaying one as filled land.
        if any(r is None for r in rings):
            return None
        return rings

    typ = g.get("type")
    if typ == "Point":
        p = coord(g.get("coordinates"))
        return {"type": "Point", "coordinates": p} if p else None
    if typ == "Polygon":
        p = polygon(g.get("coordinates"))
        return {"type": "Polygon", "coordinates": p} if p else None
    if typ == "MultiPolygon":
        raw = g.get("coordinates")
        if not isinstance(raw, list) or not 1 <= len(raw) <= 35:
            return None
        parts = [polygon(p) for p in raw]
        return {"type": "MultiPolygon", "coordinates": parts} if parts and all(p is not None for p in parts) else None
    if typ == "GeometryCollection":
        raw = g.get("geometries")
        if not isinstance(raw, list) or len(raw) > 45:
            return None
        geometries = [safe_geometry(part) for part in raw]
        geometries = [part for part in geometries if part]
        return {"type": "GeometryCollection", "geometries": geometries} if geometries else None
    return None


def load_rfs():
    source = "https://www.rfs.nsw.gov.au/feeds/majorIncidents.json"
    try:
        payload = json.loads(download(source).decode("utf-8-sig"))
        if not isinstance(payload, dict) or not isinstance(payload.get("features"), list):
            raise ValueError("Response is not a GeoJSON FeatureCollection")
        # Keep only bounded, ordinary GeoJSON features; avoid unnecessary properties.
        features = []
        for item in payload["features"][:3000]:
            if not isinstance(item, dict):
                continue
            shape = safe_geometry(item.get("geometry"))
            if shape is None:
                continue
            p = item.get("properties") or {}
            if not isinstance(p, dict):
                p = {}
            names = ("title", "name", "incidentName", "eventName", "alertLevel", "alert-level", "alert", "status", "link", "url", "guid", "id", "type", "fire", "location", "updated", "pubDate", "date", "category", "size", "responsibleAgency", "statusDescription")
            features.append({"type": "Feature", "id": str(item.get("id", ""))[:200], "geometry": shape, "properties": {k: str(p.get(k, ""))[:800] for k in names if p.get(k) is not None}})
        write("rfs.json", {"source": source, "retrieved_at": now(), "features": features, "warning": "Indicative incident locations and published fire-area outlines only. Spatial updates can differ from incident updates; these are NOT warning areas or emergency instructions.",
            "attribution": "© State of New South Wales (NSW Rural Fire Service). For current information go to www.rfs.nsw.gov.au."})
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
