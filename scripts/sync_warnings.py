#!/usr/bin/env python3
"""Publish source-labelled, validated NSW warning snapshots. No HTML scraping."""
from __future__ import annotations
import datetime as dt
import email.utils
import json
import pathlib
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

DATA = pathlib.Path(__file__).resolve().parents[1] / "data"
DATA.mkdir(exist_ok=True)
UA = "SkyPulseAU/1.1 (+https://github.com/IIllIFOGGYIIllI/SkyPulse-AU; non-commercial)"
RFS = "https://www.rfs.nsw.gov.au/feeds/IncidentAlerts.xml"
WMO = "https://severeweather.wmo.int/v2/cap-alerts/au-bom-en/rss.xml"
NSW_WORDS = re.compile(
    r"\b(NSW|ACT|New South Wales|Australian Capital Territory|Hunter|Maitland|Cessnock|Newcastle|"
    r"Illawarra|Sydney|Northern Rivers|Mid North Coast|Central Coast|Southern Tablelands|"
    r"Riverina|Snowy Mountains|North West Slopes|Northern Tablelands|Central Tablelands|"
    r"South Coast|Western Slopes|Upper Western|Lower Western|Far West|North Coast|"
    r"South West Slopes|Canberra|Queanbeyan|Warrego River)\b", re.I
)

def utcnow():
    return dt.datetime.now(dt.timezone.utc)

def iso(d=None):
    return (d or utcnow()).isoformat(timespec="seconds").replace("+00:00", "Z")

def local(tag):
    return tag.split("}")[-1]

def child(element, name):
    return next((x for x in element if local(x.tag) == name), None)

def value(element, name):
    x = child(element, name)
    return (x.text or "").strip() if x is not None else ""

def download(url, max_bytes=2_000_000):
    request = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept": "application/xml,application/rss+xml,text/xml,*/*"
    })
    with urllib.request.urlopen(request, timeout=16) as res:
        return res.read(max_bytes)

def dump(name, data):
    (DATA / name).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", "utf-8")

def parse_iso(value_str):
    try:
        return dt.datetime.fromisoformat(value_str.replace("Z", "+00:00")).astimezone(dt.timezone.utc)
    except Exception:
        return None

def valid_link(url, allowed):
    try:
        u = urllib.parse.urlparse(url)
        if u.scheme == "https" and u.hostname in allowed:
            return url
    except Exception:
        pass
    return None

def polygons_from_info(info):
    """CAP polygons have latitude,longitude pairs separated by spaces."""
    polygons = []
    for area in info:
        if local(area.tag) != "area":
            continue
        for item in area:
            if local(item.tag) != "polygon" or not (item.text or "").strip():
                continue
            points = []
            for pair in item.text.strip().split()[:3000]:
                try:
                    lat, lon = [float(v) for v in pair.split(",", 1)]
                    if -44 <= lat <= -10 and 110 <= lon <= 155:
                        points.append([lat, lon])
                except (ValueError, TypeError):
                    continue
            if len(points) >= 3:
                polygons.append(points)
    return polygons[:12]

def load_rfs():
    try:
        content = download(RFS)
        if not content.strip():
            # RFS documents that an empty response can mean no warning polygons.
            dump("rfs-alerts.json", {"source": RFS, "retrieved_at": iso(), "alerts": [],
                 "note": "Empty source response; check official NSW RFS for authoritative status."})
            return
        root = ET.fromstring(content)
        alerts = []
        for alert in root.iter():
            if local(alert.tag) != "alert":
                continue
            status = value(alert, "status")
            msg_type = value(alert, "msgType")
            if status != "Actual" or msg_type in ("Cancel", "Error", "Ack"):
                continue
            for info in [x for x in alert if local(x.tag) == "info"][:3]:
                expiration = parse_iso(value(info, "expires"))
                if expiration and expiration < utcnow():
                    continue
                link = valid_link(value(info, "web"), {"www.rfs.nsw.gov.au", "rfs.nsw.gov.au"})
                item = {
                    "id": value(alert, "identifier")[:250],
                    "incident_id": value(alert, "incidents")[:160],
                    "sent": value(alert, "sent"),
                    "status": status,
                    "message_type": msg_type,
                    "event": value(info, "event")[:150],
                    "headline": value(info, "headline")[:450] or value(info, "event")[:150],
                    "severity": value(info, "severity")[:80],
                    "urgency": value(info, "urgency")[:80],
                    "expires": value(info, "expires"),
                    "web": link or "https://www.rfs.nsw.gov.au/fire-information/alerts-and-warnings",
                    "polygons": polygons_from_info(info),
                }
                if item["headline"]:
                    alerts.append(item)
        dump("rfs-alerts.json", {"source": RFS, "retrieved_at": iso(), "alerts": alerts,
             "scope": "NSW RFS published warnings; a warning with no polygon cannot be automatically location-matched",
             "attribution": "© State of New South Wales (NSW Rural Fire Service). For current information go to www.rfs.nsw.gov.au."})
        print("RFS CAP warning alerts:", len(alerts), "with polygons:", sum(bool(x["polygons"]) for x in alerts))
    except Exception as e:
        dump("rfs-alerts.json", {"source": RFS, "retrieved_at": None, "alerts": [],
             "error": "Source unavailable; consult NSW RFS."})
        print("RFS CAP warning feed unavailable:", type(e).__name__, str(e)[:150])

def load_wmo():
    """Supplementary WMO CAP listing; not a verified NSW-local active-warning API."""
    try:
        root = ET.fromstring(download(WMO))
        items = root.findall(".//item")
        candidates = []
        now = utcnow()
        seen = set()
        for item in items[:500]:
            title = (item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            published = (item.findtext("pubDate") or "").strip()
            try:
                published_at = email.utils.parsedate_to_datetime(published).astimezone(dt.timezone.utc)
            except Exception:
                continue
            if (now - published_at).total_seconds() > 8 * 3600 or published_at > now + dt.timedelta(minutes=15):
                continue
            if not NSW_WORDS.search(title):
                continue
            if re.search(r"\b(Cancellation|Cancelled|Test|Exercise)\b", title, re.I):
                continue
            if not valid_link(link, {"severeweather.wmo.int"}):
                continue
            normal = re.sub(r"\s+", " ", title.lower())
            if normal in seen:
                continue
            seen.add(normal)
            candidates.append({"title": title[:300], "link": link,
                               "published": published, "published_utc": iso(published_at)})
            if len(candidates) >= 30:
                break
        dump("wmo-bom.json", {"source": WMO, "retrieved_at": iso(),
             "entries": candidates, "scope": "Recent WMO-indexed BOM-related publications with NSW/ACT-related title terms",
             "warning": "Recent publications are NOT verified active alerts and are NOT location-filtered. Check BOM directly."})
        print("WMO recent NSW-term publications:", len(candidates))
    except Exception as e:
        dump("wmo-bom.json", {"source": WMO, "retrieved_at": None, "entries": [],
             "error": "Supplementary WMO feed unavailable."})
        print("WMO warnings unavailable:", type(e).__name__, str(e)[:150])

if __name__ == "__main__":
    load_rfs()
    load_wmo()
