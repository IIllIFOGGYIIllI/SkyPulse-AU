#!/usr/bin/env python3
"""Stamp each SkyPulse AU HTML route and service worker for a coherent PWA release."""
import datetime as dt
import json
import os
import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
sha = os.environ.get("GITHUB_SHA", "").strip()
if not re.fullmatch(r"[0-9a-fA-F]{40}", sha):
    sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
if not re.fullmatch(r"[0-9a-fA-F]{40}", sha):
    raise SystemExit("No valid commit SHA for release")
version = sha[:12].lower()
pages = ("index.html", "forecast.html", "radar.html", "hazards.html", "news.html", "settings.html")
assets = ("assets/styles.css", "assets/leaflet.css", "assets/app.js",
          "assets/push.js", "assets/push-config.js", "assets/update.js",
          "assets/forecast-compare.js", "assets/source-health.js",
          "assets/severe-centre.js", "assets/quarter-hour.js")
for page in pages:
    path = ROOT / page
    html = path.read_text(encoding="utf-8")
    if "__SKYPULSE_BUILD__" not in html:
        raise SystemExit("Build identifier missing in " + page)
    html = html.replace("__SKYPULSE_BUILD__", version)
    for asset in assets:
        url = "./" + asset
        if url not in html:
            continue
        pattern = re.escape(url) + r'\?v=[^"\s]+'
        html, count = re.subn(pattern, url + "?v=" + version, html)
        if count != 1:
            raise SystemExit("Expected exactly one asset version tag for " + page + ": " + asset + " (" + str(count) + ")")
    path.write_text(html, encoding="utf-8")
sw_path = ROOT / "sw.js"
sw = sw_path.read_text(encoding="utf-8")
if "__SKYPULSE_BUILD__" not in sw:
    raise SystemExit("Service worker build identifier missing")
sw = sw.replace("__SKYPULSE_BUILD__", version)
sw_path.write_text(sw, encoding="utf-8")
metadata = {"version": version, "commit": sha.lower(),
            "deployed_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")}
(ROOT / "app-version.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
assert version in sw and all(version in (ROOT / p).read_text(encoding="utf-8") for p in pages)
print("Stamped 6 SkyPulse AU pages and service worker:", version)
