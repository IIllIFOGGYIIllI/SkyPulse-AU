# SkyPulse AU — Five-Minute Radar Data Provider Review
**Reviewed:** 16 November 2026  
**Purpose:** identify a lawful, dependable, higher-detail Australian radar source for SkyPulse AU's public PWA.

## Conclusion

**Do not republish BOM or Weatherzone radar tiles without permission.** Their public viewing websites and FTP access do not, by themselves, grant permission to rebroadcast imagery in SkyPulse AU. Keep the current RainViewer historical interactive layer while linking to official/first-party five-minute viewers. Pursue a radar tile/data licence or authorised commercial weather data provider for a genuine in-app upgrade.

| Service | Australian observation interval | In-app SkyPulse status | Usage considerations |
|---|---|---|---|
| **RainViewer free Weather Maps API** | 10-minute past frames, approximately 2 hours | **Integrated** in SkyPulse AU | Historical only; 2026 free tier limited to zoom 7 and Universal Blue; non-commercial/personal/educational/small community use, source attribution |
| **Bureau of Meteorology** | **5-minute observations** | **Official viewer link** | Copyright page forbids onward distribution without applicable permission; radar products can require data licensing; access as a registered user through paid services |
| **Weatherzone Layers** | **5-minute Australian composite** | **External viewer link** | No verified grant to redistribute its map tiles inside SkyPulse AU |
| **The Weather Company — Precipitation Type Global Radar** | **5-minute radar**, Australia included; ~5 km spatial resolution | **Candidate for licensed integration** | Obtain API access and confirm billing, Australia availability and display/redistribution terms; attribution for Australian radar imagery may apply |
| **WeatherAPI.com radar.json** | 5-minute in available countries | **Not a candidate for Australia presently** | Documentation as of November 2026 lists US and selected European countries, not Australia; paid Pro+ |
| **Zoom Earth** | Australian imagery shown on its website | **Not an integration candidate without a licence** | Terms prohibit mirroring, bulk downloads and transferring materials to another server |

### Verified primary documentation

- [RainViewer API transition](https://www.rainviewer.com/api/transition-faq.html) and [Weather Maps API](https://www.rainviewer.com/api/weather-maps-api.html)
- [BOM radar data services](https://www.bom.gov.au/catalogue/data-feeds.shtml), [BOM copyright](https://www.bom.gov.au/copyright), [BOM anonymous FTP products](https://www.bom.gov.au/catalogue/anon-ftp.shtml), [Registered Users services](https://www.bom.gov.au/resources/data-services)
- [Weatherzone Layers help](https://www.weatherzone.com/au/layers/)
- [The Weather Company Australia-covering radar product](https://developer.weather.com/docs/openapi/precipitation-type-global-radar-2-0) and [image tiles attribution](https://developer.weather.com/docs/openapi/weather-imagery-image-tileserver-3-0)
- [WeatherAPI.com coverage](https://www.weatherapi.com/docs/radar-api/)
- [Zoom Earth usage terms](https://zoom.earth/legal/terms/)

## Proposed licensed integration: what to verify before development

1. **Authorisation:** written licence/contract explicitly permitting map overlays on a public website and PWA, caching, user map views and non-commercial community use.
2. **Australian coverage:** current NSW coastal/inland radar coverage (particularly Hunter and Cessnock); any blind spots; exact issue and acquisition times.
3. **Resolution:** native spatial resolution and tiles/colour legend; compare against RainViewer's free zoom 7; zoom level alone is not a guarantee of more measured detail.
4. **Latency:** observed time-to-publication across at least several update cycles; five-minute *update interval* does not guarantee data issued within five minutes.
5. **API contract:** metadata feed with validated UTC timestamps; Web Mercator tiles or properly georeferenced radar imagery; JavaScript/Leaflet interoperability.
6. **Credentials:** keep keys server-side in a separate authenticated Cloudflare Worker; never embed a vendor key in public GitHub Pages JavaScript. Cache/limit requests and handle 429/503 responses.
7. **Graceful fallback:** keep RainViewer as a selectable fallback; label each source and source-specific freshness accurately.
8. **Attribution and emergency safety:** visible source and legend; no implication of official endorsement; continue official links and warning disclaimer.

## Suggested enquiry to BOM

Contact: **webreg@bom.gov.au** (listed on BOM data services website; confirm current contact details).

Subject: Australian radar imagery redistribution and GIS2Web licence enquiry — SkyPulse AU

Hello,

I maintain SkyPulse AU, an independent, publicly accessible, non-commercial Australian weather and emergency-awareness website and PWA. We currently link to BOM's official radar and use separately licensed historical radar data for our interactive map.

We are interested in displaying BOM's five-minute Australian radar imagery, with clear attribution, in an interactive NSW/Australia map. Could you please advise whether a registered-user radar imagery subscription or GIS2Web service permits public website/PWA display and what permissions, costs and delivery formats would apply? We would also like to know whether historical time steps and georeferenced overlays are available.

We would only proceed after confirming the appropriate licence and attribution requirements.

Thank you,
SkyPulse AU

**Do not send this request automatically or claim access is authorised.** The enquiry is a starting point for the owner's decision.

## Current implementation

SkyPulse radar source cards provide links to the publisher-operated five-minute viewers. The RainViewer interactive layer is unchanged, with a zoom-quality advisory showing when its imagery is enlarged beyond native zoom 7. There is **no direct five-minute map tile integration yet**.

## Rain image quality, lightning and cloud integration note (16 November 2026)
SkyPulse now requests 512px RainViewer raster tiles by default, with selectable 256px alternatives and independent smoothing controls, as documented by RainViewer. Leaflet still lays out tiles on a **256 CSS-pixel grid**. This improves high-density screen sampling without circumventing the free zoom-7 source limit. The supported free RainViewer palette remains Universal Blue.
Cloud fraction data from Open-Meteo is labelled **numerical-model estimates**, not remotely detected satellite clouds. The radar page also links directly to the official BOM and JMA satellite viewers rather than copying imagery.
**Lightning strikes:** Weatherzone's [Layers](https://www.weatherzone.com/au/layers/) viewer displays Australian strikes observed by the Weatherzone Total Lightning Network over the prior 60 minutes, but the public page is not documented as a strike-coordinate redistribution licence. [Blitzortung](https://www.blitzortung.org/en/contact.php) explicitly reserves its raw strike feeds for participants or approved external projects, and [LightningMaps.org](https://www.lightningmaps.org/about?lang=us) prohibits third-party iframes. Do not integrate either raw feed or iframe without authorisation. Commercial lightning strike APIs ([Vaisala Xweather](https://www.xweather.com/docs/weather-api/endpoints/lightning), [The Weather Company](https://developer.weather.com/docs/recent-lightning-strikes-for-global)) are candidate sources if a licensed feed can be secured; keep API credentials on a backend and document latency, accuracy and regional coverage. Existing Weatherzone links are only launch shortcuts, **not an internal live lightning layer**.

## Verified follow-up: 16 November 2026 — Australian higher-detail radar access
BOM's [2026–27 public service specification](https://www.bom.gov.au/sites/default/files/2026-10/public-weather-service-level-specification-2026-2027.pdf) confirms radar maps include estimated rainfall rate, radar reflectivity and Doppler velocity; its Registered User Service supports individual 64 km (selected sites), 128 km, 256 km and 512 km image views and GIS2Web (charges apply). Individual radar images are typically produced at five-minute intervals. [BOM copyright rules](https://www.bom.gov.au/copyright) explicitly flag specialised radar/high-resolution content as possibly governed by a separate licence.
The Weather Company documents an Australian-inclusive [Precipitation Type Global Radar API](https://developer.weather.com/docs/openapi/precipitation-type-global-radar-2-0), refreshed every five minutes with 5-km resolution, and a separate [Image TileServer radarAustralian layer](https://developer.weather.com/docs/openapi/weather-imagery-image-tileserver-3-0). Both require contracted access/API credentials, and Australian radar attribution requirements depend on the product.
**No confirmed no-cost provider grants more native detail for embedding** under SkyPulse's current terms. RainViewer remains active as a fallback until authorisation is established. Do not proxy public BOM or Weatherzone images to bypass permission.
Interim improvement: SkyPulse now links directly to the [official Newcastle radar page](https://www.bom.gov.au/weather-and-climate/rain-radar-and-weather-maps?radar=4-newcastle) and has an opt-in site-centred distance reference overlay based on Newcastle's station at -32.7317, 152.0250 (Lemon Tree Passage), corroborated by [Weatherzone station details](https://www.weatherzone.com/au/radar/nsw/newcastle). Approximate 50/100/200 km rings show distance only, **not official sensor availability**, source pixel resolution or range-based accuracy.
Before connecting a licensed provider, confirm in writing: public PWA rebroadcast rights; display and cache clauses; max requests and key privacy; timestamp and frame retention; measured spatial resolution in Hunter and the rest of Australia; georeferenced XYZ tiles/WMS delivery; BOM credit; commercial vs community grant; and monthly cost. Access should be proxied through an authorised server component with server-side credentials and fail closed to RainViewer when absent.
