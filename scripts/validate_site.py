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
"forecast-brief-period", "forecast-day-details", "forecast-chart-title",
"forecast-model-comparison", "compare-temp-spread", "compare-rain-spread", "compare-refresh"]),
    "radar.html": ("map-section", ["weather-map", "map-locate", "map-home", "map-zoom-in", "map-zoom-out",
                                  "map-fit", "map-layers-button", "map-fullscreen", "map-layer-radar",
                                  "map-layer-rfs", "map-layer-warnings", "map-radar-opacity",
                                  "map-coordinates", "radar-step-back", "radar-step-forward", "map-layer-fire-areas",
                                  "radar-check-now", "radar-freshness-indicator", "radar-latest-issued",
                                  "radar-last-check", "radar-map-clock", "radar-latest", "radar-speed",
                                  "radar-slider", "radar-frame-kind", "radar-data-age", "radar-source-bom",
                                  "radar-source-weatherzone", "radar-quality-status", "radar-image-state", "radar-retry-hd", "radar-local-bom-link", "radar-local-centre", "radar-local-distance", "map-layer-radar-sites", "cloud-panel", "cloud-model-status", "cloud-model-meta", "cloud-hours", "cloud-refresh", "cloud-value-total", "cloud-value-low", "cloud-value-mid", "cloud-value-high", "cloud-source-bom", "cloud-source-jma", "radar-lightning-open", "radar-setting-hires", "radar-setting-smooth"]),
    "hazards.html": ("hazards", ["fire-area-map", "fire-command-summary", "fire-summary-incidents", "fire-summary-warnings", "fire-summary-extents", "fire-summary-location", "fire-directory-list", "fire-directory-incidents", "fire-directory-warnings", "fire-directory-search", "fire-directory-scope", "fire-directory-sort", "fire-directory-type", "fire-directory-level", "fire-directory-clear", "fire-directory-filter-status", "fire-map-selection", "fire-map-selection-close", "fire-geofence-state", "fire-map-warnings", "fire-map-boundaries", "fire-overlaps", "fire-map-fit", "fire-nav-zoom-in", "fire-nav-zoom-out", "fire-nav-centre", "fire-nav-expand", "fire-map-legend-toggle", "fire-map-layer-summary", "fire-report-prev", "fire-report-next", "fire-report-position", "fire-warning-feed-health", "fire-incident-feed-health", "hazards-refresh", "incidents-list", "rfs-alerts-list", "fdr-district-select", "wmo-warnings-list"]),
    "news.html": ("news", []),
    "settings.html": ("alerts", ["settings-location", "radius", "notify-toggle", "push-enable",
                               "push-consent", "push-include-incidents", "push-disable", "push-test",
                               "app-update-status", "app-update-check", "source-health-centre", "source-health-summary",
                               "source-health-grid", "source-health-refresh"]),
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
check("Higher-detail Newcastle radar externally hosted and opt-in radar station rings",
  'radar=4-newcastle' in text["radar.html"] and "function renderRadarSiteRings()" in js and
  "50,100,200" in js and 'id="map-layer-radar-sites"' in text["radar.html"])
check("Radar official BOM viewer external", 'href="https://www.bom.gov.au/australia/radar/"' in text["radar.html"])
check("Radar Weatherzone viewer external", 'href="https://www.weatherzone.com/au/layers/"' in text["radar.html"])
check("Radar source choice not spoofed", "ACTiVE IN SKYPULSE" not in text["radar.html"] and 'ACTIVE IN SKYPULSE' in text["radar.html"])
check("Cloud model and linked source module", (ROOT / "assets/clouds.js").exists() and "assets/clouds.js?v=" in text["radar.html"] and "./assets/clouds.js" in sw)
check("Cloud intelligence separated from rain radar", 'id="cloud-panel"' in text["radar.html"] and "Cloud Model" in text["radar.html"] and "Cloud Intelligence" in (ROOT / "assets/clouds.js").read_text(encoding="utf-8"))
check("Cloud sources are publisher-run viewers", "www.bom.gov.au/australia/satellite/" in text["radar.html"] and "www.data.jma.go.jp/mscweb/data/himawari/" in text["radar.html"])
check("Radar tile quality can be selected without new resolution claim", "radarTileSize:radarSettingBool" in js and "maxNativeZoom:7" in js and "state.radarTileSize===512" in js and "state.radarSmooth" in js)
check("Lightning links avoid unlicensed on-map markers", 'id="radar-lightning-open"' in text["radar.html"] and "weatherzone.com/au/layers/" in text["radar.html"] and "Strike data is not yet licensed" in text["radar.html"])
check("Radar adaptive transfer fallback and image loading status",
    "function radarFallbackTo256(" in js and "function radarRetryHighDetail(" in js
    and "if(state.radarTilesLoading)return;" in js and '.radar-image-state' in css)
check("Radar detail disclosure", "function radarUpdateQuality()" in js and "native zoom 7" in js)
check("Radar provider research retained", (ROOT / "docs/RADAR_PROVIDER_REVIEW.md").exists())
check("Forecast provisional reference shows while live request is pending",
      "forecastPublishedCessnock(loc).then(function(backup)" in js
      and "Checking Live Model" in js)
check("Provider outage preserves verified snapshot and handles nearby GPS coordinates",
      "forecastNearbyCessnock(location)" in js
      and "forecastRebasePublished(data)" in js
      and "forecastFetchWithRetry(url)" in js
      and "actions/cache/restore@v4" in (ROOT/".github/workflows/deploy.yml").read_text()
      and "load_previous()" in (ROOT/"scripts/sync_forecast.py").read_text())
check("Time-bounded Cessnock source-labelled forecast backup", (ROOT / "scripts/sync_forecast.py").exists()
      and "forecastPublishedCessnock(loc)" in js
      and "Publish Free Cessnock Forecast Backup" in (ROOT / ".github/workflows/deploy.yml").read_text())
check("Forecast test suite present", (ROOT / "scripts/test_forecast_reliability.mjs").exists())
check("Model-forecast stale and cached states", 'FORECAST_CACHE_MS=2*60*60*1000' in js and 'function forecastHealth()' in js)
check("Forecast missing-value safety", 'return ["Conditions unavailable","☁️"]' in js)
check("Forecast hourly field support", "wind_gusts_10m,is_day" in js)
check("Fire area test suites exist", (ROOT / "scripts/test_fire_areas.mjs").exists() and (ROOT / "scripts/test_fire_geometry.py").exists())
check("Incident fire operations view has filterable directory", "function renderFireDirectory()" in js and "function fireSelectMapItem(" in js)
check("Fire Explorer map navigation and report pager", "function fireMapSetExpanded(" in js and "function fireBrowseReports(" in js and "function fireMapNavStatus(" in js and ".fire-map-navigation" in css)
check("Fire directory source-aware filters and reset", 'typeFilter=state.fireDirectoryType' in js and 'levelFilter=state.fireDirectoryLevel' in js and 'on("fire-directory-clear","click"' in js and '.fire-directory-filter-footer' in css)
check("RFS map incidents cluster without a dependency", "function fireClusterGroups(" in js and "function fireRenderIncidentPoints(" in js and "FIRE_CLUSTER_BREAK_ZOOM=13" in js)
check("Radar and Fire Explorer share clustering", 'state.map.on("zoomend",renderRadarIncidentMarkers)' in js and 'state.hazardMap.on("zoomend",function(){renderFireIncidentMarkers();fireMapNavStatus();})' in js)
check("Cluster legend and accessibility", "Grouped Incidents" in js and "highest level" in js and ".fire-map-cluster" in css)
check("Fire Explorer has category-specific local SVG markers", "function fireIconSvg(" in js and "function fireIncidentKind(" in js and "L.divIcon(" in js)
check("Fire Explorer renders exactly one incident panel", 'function fireSelectMapItem(' in js and
      'marker.on("click",function(){fireSelectMapItem("incident",entry.index);});' in js and
      '.bindPopup(' not in js[js.index("function renderFireAreaMap()"):js.index("function renderFireAreaStatus()")])
check("Fire Explorer has matched marker and warning legends", 'id="fire-map-legend-incidents"' in text["hazards.html"] and 'id="fire-map-legend-warnings"' in text["hazards.html"])
check("CAP polygons and incident footprints handled separately", "function hazardWarningPolygons(" in js and "function hazardIncidentPolygons(" in js)
check("NSW RFS published incident description parser", "def parse_rfs_incident_description(" in (ROOT / "scripts/sync_feeds.py").read_text())
check("Incident details shown in both map and cards", "function incidentDetailList(" in js and "incident-rich-card" in js and "hazardIncidentPopup(" in js)
check("Stale feed guarding", "state.incidentsFresh=false" in js and "state.warningsFresh=false" in js)
check("Original map tiles retain source colours", "data-map-tone" not in css and "skypulse-osm-basemap" not in js)
check("RFS information popups styled for dark theme", ':root[data-theme="dark"] #fire-area-map .leaflet-popup-content-wrapper' in css and '.incident-popup .incident-detail-row dd' in css)
check("Map appearance selectors removed", "fire-map-style" not in text["hazards.html"] and "radar-map-style" not in text["radar.html"])
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
check("Independent global model comparison", (ROOT / "assets/forecast-compare.js").exists()
      and "assets/forecast-compare.js?v=" in text["forecast.html"]
      and "/v1/ecmwf" in (ROOT / "assets/forecast-compare.js").read_text()
      and "/v1/gfs" in (ROOT / "assets/forecast-compare.js").read_text())
check("Cessnock published model-pair fallback", "publishedModelPair(loc)" in (ROOT / "assets/forecast-compare.js").read_text()
      and "models_retrieved_at" in (ROOT / "scripts/sync_forecast.py").read_text())
check("Data repair preserves push registration", 'id="app-data-repair"' in text["settings.html"]
      and "repairDataLoading()" in (ROOT / "assets/update.js").read_text()
      and "reg.update()" in (ROOT / "assets/update.js").read_text())
check("Source health checks explicit data retrieval", (ROOT / "assets/source-health.js").exists()
      and "assets/source-health.js?v=" in text["settings.html"]
      and "not a verified all-clear" in (ROOT / "assets/source-health.js").read_text())
check("Overhaul modules offline shell", '"./assets/forecast-compare.js"' in sw
      and '"./assets/source-health.js"' in sw)
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
