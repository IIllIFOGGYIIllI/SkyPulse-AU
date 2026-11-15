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

### Radar Studio (16 November 2026)
Dedicated [Radar & Map](radar.html) shows the **actual frame generation time in AEST/AEDT**, a five-minute manifest check while visible, a status badge for delayed/stale or failed checks, a roughly two-hour 10-minute-interval timeline, latest-frame follow, manual scrubbing, playback pause/speed/step controls and retained history if the provider briefly fails. Radar layer swaps are buffered to minimise blank frames. The RainViewer free service has a maximum native zoom of 7 and Universal Blue imagery only; the interface does not claim five-minute radar imagery or near-term nowcasts. See [RainViewer's API limits](https://www.rainviewer.com/api/transition-faq.html) and [the official BOM radar](https://www.bom.gov.au/australia/radar/) for a separate five-minute source. The browser regression suite includes `scripts/test_radar_studio.mjs`.

### Radar Preferences & Sharing
Radar Studio now has region shortcuts (selected location, regional view, NSW and Australia), a separate settings drawer, device-saved controls for layer visibility, radar opacity, overlay timestamp, looping, follow-latest, playback speed and optional 5-minute checks. A **Copy Map Link** action shares map coordinates, zoom and selected radar frame timestamp; the receiving browser shows the closest available historical frame, if it remains in RainViewer's rolling history. Shared map coordinates do not change saved forecast/watch location. `Restore Defaults` applies only to radar preferences. All settings are stored locally in `skypulse.preferences.radar` and preserved alongside existing weather and notification preferences.

### Official five-minute radar access
SkyPulse AU links directly to the [Bureau of Meteorology radar](https://www.bom.gov.au/australia/radar/) and [Weatherzone Layers](https://www.weatherzone.com/au/layers/) for their five-minute imagery, without reproducing their restricted tiles. A dynamic indicator flags when the interactive RainViewer radar is being enlarged beyond its native maximum zoom level 7. See [Radar Provider Review](docs/RADAR_PROVIDER_REVIEW.md) for verified licensing and possible future high-resolution integration options.

### Forecast and overview reliability (16 November 2026)
The Open-Meteo weather pages now show a model-valid timestamp, last successful retrieval, an explicit recent/delayed/stale/cached/failed status, and a six-hour model summary. The dedicated forecast includes three hourly chart modes, 24 hourly cards and selectable 7-day details. The source is numerical weather modelling, not observed station conditions, and precipitation probabilities refer to the modelled hour. The app validates the response and uses a location-keyed, time-limited cache only with visible labelling. Failed requests never imply that old values are newly verified.

### NSW Fire Area Explorer (16 November 2026)
[NSW Hazards](hazards.html) includes a dedicated map of official RFS CAP warning polygons, a separate incident GeoJSON polygon layer, incident point locations, monitoring-radius overlay and warning proximity assessment. Clicking warning/incident cards focuses the relevant mapped area. The [radar](radar.html) map also has a distinct incident extent layer. Stale/unavailable feeds disable automated overlap conclusions. Published geometry may be incomplete or delayed: no-overlap does **not** mean safe. Tests: `scripts/test_fire_geometry.py` and `scripts/test_fire_areas.mjs`.

### Detailed NSW RFS incident information
SkyPulse parses the RFS Current Incidents GeoJSON `description` (a structured list of HTML-separated fields) into plain-text, source-provided alert level, location, council area, fire control status, incident type, whether a fire, size in hectares, responsible agency, and update time. The native `category` is a backup for alert level; it must never be inferred from control status. The imported data remains attributable to NSW RFS and appears in nearby-incident cards, expandable details and both fire/radar map popups. The separately displayed incident updated time must not be confused with the time the feed was retrieved; the published 30-minute feed schedule does not imply real-time accuracy. Values absent from the official feed are omitted rather than invented.

### Fire Explorer user-experience redesign
The Fire Explorer now uses a two-panel incident operations layout: live-source-labelled summary counters (nearby mapped incidents, published warning polygons, published incident footprints, monitoring location), a searchable/sortable nearby or statewide report directory, tabs separating incident records from CAP warnings, a large interactive map and an on-map detail inspector. Incident rows and markers open field-by-field RFS details including fire size, control status, agency and last published update where available. Warning records without geometry can still be inspected, without inventing a polygon. Mobile uses a full-width map followed by an independently scrolling report list; 320px and 390px behaviour is regression-tested.

### Dark incident panels (16 November 2026)
SkyPulse AU retains unmodified **original-colour OpenStreetMap basemap tiles** on the Radar and NSW Fire Explorer maps. The Leaflet incident/official warning popups and map controls use SkyPulse's dark-panel styling when the website is in dark mode; in light website mode, information popups remain light. Warning-area colours, radar image tiles, incident markers and base-map details are never filter-inverted. No separate map-theme selector or API key is required.

### Fire Explorer SVG markers and one-panel interaction (16 November 2026)
Published RFS incident type determines locally drawn SVG map pins (fire, vegetation/grass fire, hazardous materials, flood, storm, road, rescue, generic incident) with alert-level border colours. Warning icons reflect Advice, Watch and Act and Emergency Warning, while the legend distinguishes polygon warning zones, mapped fire extents and the monitoring radius. Icons in the incident directory, detail panel, nearby feed and Radar Studio use the same visual vocabulary; ambiguous types fall back to generic icons. Clicking a Fire Explorer marker or spatial polygon **never opens a second Leaflet popup**: it selects and highlights the report and opens only the right-side incident/official warning detail panel. Radar Studio keeps its single native popup because it has no side inspector. Original-colour OpenStreetMap tiles remain unchanged.

### Smaller incident pins and zoom-aware marker clustering
The Fire Explorer and Radar Studio use smaller, consistent SVG source-type markers (32×39 px rather than 40×48 px). When zoomed out, nearby RFS point features are grouped using a lightweight Web Mercator pixel-distance algorithm with no new libraries, API keys or hosting costs. Cluster badges report **the number of published incident point records**, not fire size or people affected. Their outline reflects the highest warning level among grouped incidents, and clicking a badge zooms in; at zoom level 13 and above individual incident pins are displayed. The original incident coordinates, warning polygons, fire boundaries, source labels and incident directory are unchanged. The Fire Explorer continues to use exactly one right-hand details panel for a selected individual incident; clusters never show invented combined incident details.
