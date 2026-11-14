# SkyPulse AU
**Australian Weather, Warnings & Emergency Information**

An independent, free, responsive Australian weather website and installable Progressive Web App (PWA). Cessnock, NSW is the initial location, but weather search supports towns throughout Australia.

> **Emergency disclaimer:** SkyPulse AU is **not a government or emergency warning service**. In immediate danger call **000**. Always use official [Hazards Near Me NSW](https://www.nsw.gov.au/emergency/hazards-near-me-app), [BOM](https://www.bom.gov.au/weather-and-climate/warnings-and-alerts), [NSW RFS](https://www.rfs.nsw.gov.au/) and [NSW SES HazardWatch](https://hazardwatch.gov.au/) information. Absence of mapped incidents is not evidence of safety.

## Features implemented
- Responsive dark/light interface, mobile navigation and local preferences.
- Live current weather, hourly temperature chart, 12-hour outlook and seven-day forecast from Open-Meteo.
- Australian location search, optional browser geolocation and configurable incident radius.
- Interactive OpenStreetMap map, historical RainViewer radar frames with time slider/animation and NSW RFS incident markers.
- NSW RFS nearby incident list (approximate distances) and NSW/ACT BOM statewide warning links; publication timestamp and stale-source indicator.
- NSW SES, Hazards Near Me, Live Traffic, power information and local news **official source links**.
- PWA manifest, service-worker shell and offline safety information.
- Opt-in **browser-only** notifications for new mapped incidents when the application is open and permission granted.

## Features not yet implemented
- **Background push alerts** when the app is closed; this needs a dedicated backend (for example, Cloudflare Workers + a subscription store), consent, deduplication, safe geographic matching and operational monitoring.
- NSW SES warning API integration; direct access requires permission and warnings must be republished in full.
- Live news headline aggregation; the News section currently provides curated publisher links.
- Native app-store installation, verified public notification SLAs, road closures or power outages as live API integrations.
- Guaranteed correct warning polygons or emergency notification delivery. Fire markers are *incident coordinates*, not definitive warning areas.

## Publish free with GitHub Pages
1. Open repository **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Go to **Actions → Deploy SkyPulse AU** and run the workflow manually once if needed (or use a new push).
4. Once the workflow finishes successfully, the site should be available at:
   **https://iillifoggyiilli.github.io/SkyPulse-AU/** (GitHub Pages URL paths are case-sensitive; use the link shown by the deployment).
5. Open the website and use your browser's **Install App** / **Add to Home Screen** function. iOS requires Safari → Share → Add to Home Screen.

Scheduled workflows run about every 30 minutes **on a best-effort basis**, not guaranteed to the minute. Each run retrieves NSW RFS GeoJSON and NSW/ACT BOM RSS warning links and deploys a refreshed static snapshot. GitHub can delay scheduled jobs, and upstream services may be unavailable. On retrieval failure, **data is marked unavailable rather than making up incidents or warnings**.

> GitHub Pages serves the frontend. It does **not** run a persistent server or send background push notifications.

## Local development
Run from the repository root using any local static HTTP server, for example:

```sh
python3 scripts/sync_feeds.py
python3 -m http.server 8000
```

Visit http://localhost:8000/ . The `sync_feeds.py` task uses only Python's standard library. Weather and radar APIs are called directly from the browser.

## Project layout
- `index.html` — main dashboard
- `assets/styles.css` — responsive design system
- `assets/app.js` — browser data and interface logic
- `assets/icon.svg`, `manifest.webmanifest`, `sw.js` — installable PWA
- `scripts/sync_feeds.py` — scheduled NSW RFS/BOM data retrieval
- `.github/workflows/deploy.yml` — GitHub Pages publication
- `privacy.html`, `terms.html`, `sources.html` — policies, disclaimer and attributions

## Licensing and data
The repository's code licence is MIT (see `LICENSE`). **Third-party data, tiles and logos are not relicensed by the project.**
- [Open-Meteo](https://open-meteo.com/) — forecast data, CC BY 4.0 attribution; non-commercial free tier.
- [RainViewer](https://www.rainviewer.com/api.html) — radar tile API subject to personal/educational/community non-commercial terms and limits.
- [OpenStreetMap](https://www.openstreetmap.org/copyright) — map attribution, tile usage conditions.
- [NSW RFS](https://www.rfs.nsw.gov.au/news-and-media/stay-up-to-date/feeds) / [Data.NSW](https://data.nsw.gov.au/data/dataset/nsw-rural-fire-service-current-incidents-feed) — GeoJSON incidents, Creative Commons Attribution.
- [BOM RSS](https://www.bom.gov.au/rss/) — warnings for personal/non-commercial use with attribution and direct links; not sole source of emergency information.

See [Data Sources](sources.html), [Privacy](privacy.html) and [Terms](terms.html).

**SkyPulse AU is not affiliated with, approved by or endorsed by any emergency authority.**

## Diagnosing unavailable feeds
GitHub Pages must publish from **GitHub Actions**, not **Deploy from a branch**. A branch-based Pages deployment can run after the custom feed-fetch workflow and overwrite its generated `data/rfs.json` and `data/bom.json`. In **Settings → Pages → Build and deployment**, choose **GitHub Actions** and rerun **Actions → Deploy SkyPulse AU → Run workflow**. If a second **pages build and deployment** run appears after each push, the branch setting is still active.

The BOM RSS endpoint currently returns HTTP 403 to the automated runner. SkyPulse therefore links to the official BOM warnings rather than falsely displaying “no warnings”. The map has a new Reload Map control for tile-loading failures.

## Map Viewer v4
The Leaflet 1.9.4 stylesheet is **self-hosted** at `assets/leaflet.css`, resolving the failure mode where map tiles appear as scattered, unpositioned image squares when remote Leaflet CSS is unavailable. Map controls now include zoom, precise device location (with user consent), return to the selected town, fit to nearby mapped incidents, fullscreen, layer visibility, a nearby-only filter, radar opacity, radar frame navigation, optional mouse-wheel zoom, coordinates, metric scale and a clear incident legend. Using **Current Location** on the map does **not** silently replace the saved weather location. Map tiles remain online-only and subject to OSM tile availability and its usage policy.

The GitHub Actions deployment runs a static validation script, in addition to JavaScript syntax checks, before publishing changes. This validation does not replace a real-device rendering check.
