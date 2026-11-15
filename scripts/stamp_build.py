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
html_path=ROOT/"index.html"
html=html_path.read_text(encoding="utf-8")
if '__SKYPULSE_BUILD__' not in html:
    raise SystemExit("Missing source-build marker in index.html")
html=html.replace("__SKYPULSE_BUILD__",version)
# Cache-bust all local application code/style URLs on each source commit.
assets=["assets/styles.css","assets/leaflet.css","assets/app.js",
        "assets/push.js","assets/push-config.js","assets/update.js"]
for asset in assets:
    html,count=re.subn(r'(?P<path>\./'+re.escape(asset)+r')\?v=[^"\s]+',
        lambda m:m.group("path")+"?v="+version,html)
    if count!=1:raise SystemExit("Expected one versioned asset reference: "+asset)
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
assert version in html and version in sw
print("Stamped SkyPulse AU source version:",version)
