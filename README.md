# SkyPulse AU
**Australian Weather, Warnings & Emergency Information**

An independent, free, responsive Australian weather website and installable Progressive Web App (PWA). Cessnock, NSW is the initial location, but weather search supports towns throughout Australia.

> **Emergency disclaimer:** SkyPulse AU is **not a government or emergency warning service**. In immediate danger call **000**. Always use official [Hazards Near Me NSW](https://www.nsw.gov.au/emergency/hazards-near-me-app), [BOM](https://www.bom.gov.au/weather-and-climate/warnings-and-alerts), [NSW RFS](https://www.rfs.nsw.gov.au/) and [NSW SES HazardWatch](https://hazardwatch.gov.au/) information. Absence of mapped incidents is not evidence of safety.

## Features implemented
- Responsive dark/light interface, mobile navigation and local preferences.
- Model-based current conditions, an hourly temperature chart, 12-hour outlook, seven-day forecast, detailed pressure/dew-point/wind/cloud estimates and a written, automatically generated tomorrow outlook from Open-Meteo.
- Australian location search, optional browser geolocation and configurable incident radius.
- Interactive OpenStreetMap map, historical RainViewer radar frames with time slider/animation and NSW RFS incident markers.
- NSW RFS incident locations plus **official NSW RFS Fire Danger Ratings and Total Fire Ban status** by district, today/tomorrow; publication timestamp and stale-feed detection. Statewide BOM warning RSS integration remains temporarily unavailable due to HTTP 403.
- Local hazard snapshot, compact historical rain radar preview, official satellite viewing link, Cessnock Airport AWS observation link, and NSW SES/Hazards Near Me/Live Traffic/power/local news **official source links**.
- PWA manifest, service-worker shell and offline safety information.
- Opt-in **browser-only** notifications for new mapped incidents when the application is open and permission granted.

## Features not yet implemented
- **Background push alerts** when the app is closed; this needs a dedicated backend (for example, Cloudflare Workers + a subscription store), consent, deduplication, safe geographic matching and operational monitoring.
- NSW SES warning API integration; direct access requires permission and warnings must be republished in full.
- Live news headline aggregation; the News section currently provides curated publisher links.
- Native app-store installation, verified public notification SLAs, road closures or power outages as live API integrations.
- Direct republication of BOM weather-station observations. Cessnock Airport readings are provided as a link to BOM; the on-site figures are **model estimates**, not measured station readings. Source access and republishing permissions would need to be arranged before embedding the actual observations.
- Inline satellite tiles. The satellite panel currently links to the official BOM satellite viewer, with a clearly labelled illustrative graphic.
- Guaranteed correct warning polygons or emergency notification delivery. Fire markers are *incident coordinates*, not definitive warning areas.

## Publish free with GitHub Pages
1. Open repository **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Go to **Actions → Deploy SkyPulse AU** and run the workflow manually once if needed (or use a new push).
4. Once the workflow finishes successfully, the site should be available at:
   **https://iillifoggyiilli.github.io/SkyPulse-AU/** (GitHub Pages URL paths are case-sensitive; use the link shown by the deployment).
5. Open the website and use your browser's **Install App** / **Add to Home Screen** function. iOS requires Safari → Share → Add to Home Screen.

Scheduled workflows run about every 30 minutes **on a best-effort basis**, not guaranteed to the minute. Each run retrieves NSW RFS incident GeoJSON, NSW RFS district fire danger and total fire ban XML, and attempts NSW/ACT BOM RSS warning links and deploys a refreshed static snapshot. GitHub can delay scheduled jobs, and upstream services may be unavailable. On retrieval failure, **data is marked unavailable rather than making up incidents or warnings**.

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
- `scripts/sync_feeds.py` — scheduled NSW RFS incident and fire danger data retrieval, plus BOM warning feed attempts
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

## Enhanced Weather Dashboard (November 2026)
SkyPulse AU distinguishes three types of information:

1. **Model estimates:** Open-Meteo current estimated temperature, humidity, wind, direction, pressure, dew point, cloud cover and the daily peak UV. These are estimates from weather models, *not station observations*.
2. **Model forecasts:** daily minimum/maximum temperature, the maximum forecast *hourly* precipitation probability for the local calendar day, modelled daily precipitation totals, sunrise/sunset, tomorrow's generated narrative and a seven-day outlook. “Today's Rainfall” must never be confused with “Rain Since 9 am”, an observed measurement.
3. **Official data or links:** NSW RFS mapped incidents and fire danger district forecasts/total fire bans (sourced from RFS feeds, with retrieval and stale warnings), plus direct links to BOM Cessnock Airport station observations and official satellite imagery. BOM RSS alerts currently return 403 from the GitHub Actions runner and must be treated as unavailable.

The **Greater Hunter** RFS district covers Cessnock. The live RFS district feed has been verified in GitHub Actions with 21 districts, including the Greater Hunter. Other NSW locations can select their district manually to avoid implying an unverified district mapping. The radar dashboard preview uses historical RainViewer data and a static OpenStreetMap base; imagery may be delayed.

## NSW official alerts and opt-in background Web Push
The `scripts/sync_warnings.py` importer publishes source-labelled `data/rfs-alerts.json` (RFS CAP) and `data/wmo-bom.json` (recent WMO-indexed BOM CAP references). Neither source is allowed to silently assert a location is safe. RFS warning polygons are shown only when actually published in CAP; some RFS alerts provide no map geometry. The BOM NSW RSS importer still returns 403 from GitHub Actions and is clearly marked unavailable.

An optional Cloudflare Worker/D1 gateway is included at `notifications/`, with VAPID signing and explicit consent controls at the top-level PWA. **Background push is NOT active until the Worker is deployed, D1 configured and `assets/push-config.js` points to the real Worker URL.** This is a user-controlled setup step: no VAPID private key is committed to GitHub. Background delivery is best effort and **cannot replace the official Hazards Near Me app**. Full step-by-step setup: [docs/PUSH_SETUP.md](docs/PUSH_SETUP.md).

## Dedicated Pages (November 2026)
SkyPulse AU now uses **separate static, bookmarkable pages** for [Overview](index.html), [Forecast](forecast.html), [Radar & Map](radar.html), [NSW Hazards](hazards.html), [News & Resources](news.html), and [Settings & Notifications](settings.html). The desktop sidebar, six mobile tabs and category shortcuts navigate between those pages; the PWA keeps their offline shells in its versioned cache. Saved location, theme, radius and notification preferences persist via same-origin localStorage. Each page initialises only the required weather, map or hazard feeds. Background push registration remains on the dedicated Settings page, while push delivery continues through the service worker.
