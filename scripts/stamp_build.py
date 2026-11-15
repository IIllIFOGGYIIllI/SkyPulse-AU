#!/usr/bin/env python3
"""Stamp the *deployed* build with its source commit; scheduled redeploys do not create new versions."""
import datetime as dt
import json
import os
import pathlib
import re
import subprocess
ROOT=pathlib.Path(__file__).resolve().parents[1]
sha=os.environ.get("GITHUB_SHA","").strip()
if not re.fullmatch(r"[0-9a-fA-F]{40}",sha):
    sha=subprocess.check_output(["git","rev-parse","HEAD"],cwd=ROOT,text=True).strip()
if not re.fullmatch(r"[0-9a-fA-F]{40}",sha):
    raise SystemExit("Unable to identify a valid commit SHA for this build")
version=sha[:12].lower()
# Stamp each real route with the same source revision and versioned assets.
page_paths=("index.html","forecast.html","radar.html","hazards.html","news.html","settings.html")
assets=("assets/styles.css","assets/leaflet.css","assets/app.js",
        "assets/push.js","assets/push-config.js","assets/update.js")
for page in page_paths:
    html_path=ROOT/page
    html=html_path.read_text(encoding="utf-8")
    if '__SKYPULSE_BUILD__' not in html:
        raise SystemExit("Missing source-build marker in "+page)
    html=html.replace("__SKYPULSE_BUILD__",version)
    for asset in assets:
        pattern=r'(?P<path>\\./'+re.escape(asset)+r')\\?v=[^"\\s]+'
        html,count=re.subn(pattern,
            lambda m:m.group("path")+"?v="+version,html)
        expected=1 if "./"+asset in html else 0
        if count!=expected:
            raise SystemExit("Unexpected local asset version count: "+page+" / "+asset+" : "+str(count))
    html_path.write_text(html,encoding="utf-8")
sw_path=ROOT/"sw.js"
sw=sw_path.read_text(encoding="utf-8")
if "__SKYPULSE_BUILD__" not in sw:
    raise SystemExit("Missing source-build marker in sw.js")
sw=sw.replace("__SKYPULSE_BUILD__",version)
sw_path.write_text(sw,encoding="utf-8")
metadata={"version":version,"commit":sha.lower(),
          "deployed_at":dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00","Z")}
(ROOT/"app-version.json").write_text(json.dumps(metadata,indent=2)+"\n",encoding="utf-8")
assert version in sw and all(version in (ROOT / page).read_text(encoding="utf-8") for page in page_paths)
print("Stamped SkyPulse AU source version:",version)
