#!/usr/bin/env python3
"""Release and UI integrity checks for dedicated SkyPulse AU pages."""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
pages = {
    "index.html": ("overview", ["forecast-integrity", "forecast-health-pill", "forecast-model-time",
"forecast-checked-time", "forecast-retry", "overview-next-rain-chance", "overview-next-rain-mm",
"overview-next-gust", "overview-next-temps", "current-temp", "tomorrow-date", "detail-dewpoint", "radar-peek-map", "snapshot-incidents", "snapshot-fire-danger"]),
    "forecast.html": ("forecast", ["temp-chart", "hourly-list", "daily-list", "forecast-integrity",
"forecast-health-pill", "forecast-model-time", "forecast-checked-time", "forecast-retry",
"forecast-next-rain-chance", "forecast-next-rain-mm", "forecast-next-gust", "forecast-next-temps",
"forecast-brief-period", "forecast-day-details", "forecast-chart-title"]),
    "radar.html": ("map-section", ["weather-map", "map-locate", "map-home", "map-zoom-in", "map-zoom-out",
                                  "map-fit", "map-layers-button", "map-fullscreen", "map-layer-radar",
                                  "map-layer-rfs", "map-layer-warnings", "map-radar-opacity",
                                  "map-coordinates", "radar-step-back", "radar-step-forward", "map-layer-fire-areas",
                                  "radar-check-now", "radar-freshness-indicator", "radar-latest-issued",
                                  "radar-last-check", "radar-map-clock", "radar-latest", "radar-speed",
                                  "radar-slider", "radar-frame-kind", "radar-data-age", "radar-source-bom",
                                  "radar-source-weatherzone", "radar-quality-status"]),
    "hazards.html": ("hazards", ["fire-area-map", "fire-geofence-state", "fire-map-warnings", "fire-map-boundaries", "fire-overlaps", "fire-map-fit", "fire-warning-feed-health", "fire-incident-feed-health", "hazards-refresh", "incidents-list", "rfs-alerts-list", "fdr-district-select", "wmo-warnings-list"]),
    "news.html": ("news", []),
    "settings.html": ("alerts", ["settings-location", "radius", "notify-toggle", "push-enable",
                               "push-consent", "push-include-incidents", "push-disable", "push-test",
                               "app-update-status", "app-update-check"]),
}
text = {p: (ROOT / p).read_text(encoding="utf-8") for p in pages}
js = (ROOT / "assets/app.js").read_text(encoding="utf-8")
css = (ROOT / "assets/styles.css").read_text(encoding="utf-8")
sw = (ROOT / "sw.js").read_text(encoding="utf-8")
leaflet = (ROOT / "assets/leaflet.css").read_text(encoding="utf-8")
errors = []
def check(label, condition):
    if not condition:
        errors.append(label)
release = ROOT / "app-version.json"
check("Release metadata exists", release.exists())
version = json.loads(release.read_text(encoding="utf-8"))["version"] if release.exists() else ""
check("Version matches service worker", 'skypulse-shell-' + version in sw)
for path, (page_id, required) in pages.items():
    h = text[path]
    check(path + ": exactly one main section", len(re.findall(r'<section id="(overview|forecast|map-section|hazards|news|alerts)"', h)) == 1)
    check(path + ": correct page section", 'id="' + page_id + '"' in h)
    check(path + ": active route", 'data-page="' + page_id + '"' in h)
    check(path + ": stamped version", 'data-build="' + version + '"' in h)
    check(path + ": updater loaded", 'assets/update.js?v=' + version in h)
    check(path + ": responsive CSS loaded", 'assets/styles.css?v=' + version in h)
    check(path + ": official emergency notice", 'For emergencies call' in h)
    check(path + ": six-tab mobile navigation", len(re.findall(r'class="mobile-tab(?: is-active)?"', h)) == 6)
    check(path + ": all six route links", all(url in h for url in
          ('href="./"', 'href="./forecast.html"', 'href="./radar.html"',
           'href="./hazards.html"', 'href="./news.html"', 'href="./settings.html"')))
    check(path + ": no duplicate HTML IDs", len(re.findall(r'\sid="([^"]+)"', h)) ==
          len(set(re.findall(r'\sid="([^"]+)"', h))))
    for id in required:
        check(path + ": element " + id, 'id="' + id + '"' in h)
check("Radar official BOM viewer external", 'href="https://www.bom.gov.au/australia/radar/"' in text["radar.html"])
check("Radar Weatherzone viewer external", 'href="https://www.weatherzone.com/au/layers/"' in text["radar.html"])
check("Radar source choice not spoofed", "ACTiVE IN SKYPULSE" not in text["radar.html"] and 'ACTIVE IN SKYPULSE' in text["radar.html"])
check("Radar detail disclosure", "function radarUpdateQuality()" in js and "native zoom 7" in js)
check("Radar provider research retained", (ROOT / "docs/RADAR_PROVIDER_REVIEW.md").exists())
check("Forecast test suite present", (ROOT / "scripts/test_forecast_reliability.mjs").exists())
check("Model-forecast stale and cached states", 'FORECAST_CACHE_MS=2*60*60*1000' in js and 'function forecastHealth()' in js)
check("Forecast missing-value safety", 'return ["Conditions unavailable","☁️"]' in js)
check("Forecast hourly field support", "wind_gusts_10m,is_day" in js)
check("Fire area test suites exist", (ROOT / "scripts/test_fire_areas.mjs").exists() and (ROOT / "scripts/test_fire_geometry.py").exists())
check("CAP polygons and incident footprints handled separately", "function hazardWarningPolygons(" in js and "function hazardIncidentPolygons(" in js)
check("NSW RFS published incident description parser", "def parse_rfs_incident_description(" in (ROOT / "scripts/sync_feeds.py").read_text())
check("Incident details shown in both map and cards", "function incidentDetailList(" in js and "incident-rich-card" in js and "hazardIncidentPopup(" in js)
check("Stale feed guarding", "state.incidentsFresh=false" in js and "state.warningsFresh=false" in js)
check("Radar poll cadence at 5 minutes", "RADAR_CHECK_MS=300000" in js)
check("Source generation timestamp shown in Sydney time", 'timeZone:"Australia/Sydney"' in js)
check("Radar recent vs stale explicitly distinguished", '"STALE IMAGE"' in js and '"RECENT FRAME"' in js)
check("Radar latest selection survives new frames", "state.radarFollowLatest" in js)
check("Radar browser smoke test present", (ROOT / "scripts/test_radar_studio.mjs").exists())
check("Self-hosted Leaflet CSS", ".leaflet-tile," in leaflet and "position: absolute" in leaflet)
check("Radar page loads Leaflet styles", 'href="./assets/leaflet.css' in text["radar.html"])
check("SW offline caches all pages", all('"./' + p + '"' in sw for p in list(pages)[1:]))
check("SW preserves push support", 'addEventListener("push"' in sw)
check("SW retains non-SkyPulse caches", 'name.startsWith(PREFIX)' in sw)
check("SW navigation cache keyed by request", 'cache.put(request,res.clone())' in sw)
check("Mobile 6 equal-width tabs", "grid-template-columns:repeat(6,minmax(0,1fr))" in css)
check("Forecast scrolling contained", ".hours-scroll{display:flex;max-width:100%;scroll-snap-type:x proximity}" in css)
check("Route-aware JavaScript", "document.body.dataset.page" in js and "function on(id,type,handler)" in js)
check("Official warning integration", "loadOfficialRfsWarnings()" in js and "showRfsWarningMap" in js)
check("Warning feed failures do not imply all clear", "Warning feed unavailable" in js)
check("Push client isolated to Settings", "assets/push.js" in text["settings.html"] and
      all("assets/push.js" not in text[p] for p in pages if p != "settings.html"))
push = (ROOT / "assets/push-config.js").read_text(encoding="utf-8")
check("Push config contains no private key", "VAPID_PRIVATE_PKCS8" not in push)
check("Backend validates VAPID and feed freshness", "VAPID_PRIVATE_PKCS8" in
      (ROOT / "notifications/src/index.js").read_text(encoding="utf-8") and
      "MAX_FEED_AGE" in (ROOT / "notifications/src/index.js").read_text(encoding="utf-8"))
if errors:
    raise SystemExit("SkyPulse page validation FAILED:\n- " + "\n- ".join(errors))
print("SkyPulse AU validation PASSED — six pages, safety, navigation, PWA caching and notification isolation.")
