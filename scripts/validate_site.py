#!/usr/bin/env python3
"""Small dependency-free build guard for SkyPulse AU's critical map and safety UI."""
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / "index.html").read_text(encoding="utf-8")
js = (ROOT / "assets/app.js").read_text(encoding="utf-8")
css = (ROOT / "assets/styles.css").read_text(encoding="utf-8")
leaflet = (ROOT / "assets/leaflet.css").read_text(encoding="utf-8")
sw = (ROOT / "sw.js").read_text(encoding="utf-8")
errors = []
def check(name, condition):
    if not condition:
        errors.append(name)
check("Self-hosted Leaflet CSS included", 'href="./assets/leaflet.css' in html)
check("Leaflet tile absolute positioning in local CSS", ".leaflet-tile," in leaflet and "position: absolute" in leaflet)
check("No unpkg Leaflet CSS dependency", 'href="https://unpkg.com/leaflet' not in html)
check("PWA preloads the Leaflet CSS", '"./assets/leaflet.css"' in sw)
check("Map controls stylesheet", ".map-control-column" in css and ".map-layers-panel" in css)
for element in ["weather-map", "map-locate", "map-home", "map-zoom-in", "map-zoom-out",
                "map-fit", "map-layers-button", "map-fullscreen", "map-layer-radar", 
                "map-layer-rfs", "map-nearby-only", "map-radar-opacity", "map-wheel-zoom",
                "map-coordinates", "map-location-status", "radar-step-back", "radar-step-forward"]:
    check("HTML map control: " + element, 'id="' + element + '"' in html)
    if element not in ("weather-map", "map-coordinates", "map-location-status"):
        check("Map control wired in JS: " + element, '$("' + element + '")' in js)
for heading in ["Weather Forecast", "NSW Hazard Monitoring", "Nearby RFS Incidents",
                "NSW &amp; ACT Weather Warnings", "Alert Centre &amp; Settings"]:
    check("Professional heading: " + heading, heading in html)
for item in ["tomorrow-date", "tomorrow-condition", "tomorrow-rain-chance", "tomorrow-rain-amount",
             "detail-dewpoint", "detail-pressure", "detail-wind-direction", "detail-cloud-cover",
             "official-observation-link", "radar-peek-map", "snapshot-incidents", "snapshot-warnings",
             "snapshot-fire-danger", "fdr-district-select", "fdr-today-rating", "fdr-tomorrow-rating"]:
    check("Enhanced dashboard element: " + item, 'id="' + item + '"' in html)
check("Peak UV is labelled daily", "TODAY'S PEAK UV" in html)
check("Weather station clearly identified", "Cessnock Airport AWS" in html)
check("Model values never labelled as measured readings", "CURRENT MODEL ESTIMATE" in html)
check("FDR integration present", "loadFireDanger" in js and "renderFireDanger" in js)
for item in ["rfs-alert-feed-state", "rfs-alerts-list", "wmo-warnings-list", "map-layer-warnings",
             "push-consent", "push-include-incidents", "push-status", "push-enable",
             "push-disable", "push-update", "push-test"]:
    check("Official warnings / Push panel: " + item, 'id="' + item + '"' in html)
check("Push client script included", "assets/push.js" in html and "assets/push-config.js" in html)
check("RFS CAP integration", "loadOfficialRfsWarnings()" in js and "showRfsWarningMap" in js)
check("WMO references labelled as recent", "Recent WMO-Indexed BOM Updates" in html)
check("Background alerts require explicit opt-in", "push-consent" in (ROOT / "assets/push.js").read_text(encoding="utf-8"))
check("Worker has VAPID and source-age safeguards", "VAPID_PRIVATE_PKCS8" in (ROOT / "notifications/src/index.js").read_text(encoding="utf-8") and "MAX_FEED_AGE" in (ROOT / "notifications/src/index.js").read_text(encoding="utf-8"))
push_config = (ROOT / "assets/push-config.js").read_text(encoding="utf-8")
check("Client API config is present", "window.SKYPULSE_PUSH_API" in push_config)
check("Push API config contains no private VAPID key", "VAPID_PRIVATE_PKCS8" not in push_config)
check("Push API config does not contain credentials", "Authorization:" not in push_config and "Bearer " not in push_config)
check("Emergency safety disclaimer displayed", "For emergencies call" in html)
check("BOM fallback for unavailable warnings", "Warning feed unavailable" in js)
if errors:
    raise SystemExit("SkyPulse validation FAILED:\n- " + "\n- ".join(errors))
print("SkyPulse AU site validation passed: local Leaflet assets, map controls, labels and emergency fallback.")
