# SkyPulse AU — Background Push Setup (Free Tier)

This is a **one-time deployment step**. The website itself remains on GitHub Pages.

**Status when this repository was updated:** Backend source code is ready, but **no Cloudflare Worker/database/VAPID credentials have been deployed or connected**. The PWA shows **NOT CONFIGURED** until a valid API URL is added. Never claim background push is live until tested on a real device.

## What this service does

- Uses Cloudflare Workers (free tier where within limits), D1, a 15-minute Cron Trigger and VAPID Web Push.
- Allows users to opt in, choose a 10–150 km watch radius and save approximate coordinates, rounded to 2 decimal places (~1 km latitude).
- Checks the official NSW RFS CAP warning feed and mapped incidents from the **GitHub Pages snapshots**.
- Sends **empty-payload Web Push** notifications if a *new* verified RFS warning polygon intersects the saved area. Optional incident notifications use mapped incident **point coordinates**, which are not warning areas.
- The service worker displays an informational notification and opens the hazard page when tapped. The notification does not claim to be a current official emergency instruction.
- No user accounts, private messaging, guaranteed delivery or personal alert history.

**Important:** Some NSW RFS CAP warnings do not include polygons; these warnings can be listed but **must not trigger location-targeted push**. BOM warnings are **not** sent via this service while the BOM data feed remains unavailable and WMO listings cannot be confirmed active. This is supplemental monitoring, not a safety-critical emergency alert service.

## 1. Create your free Cloudflare account

Visit [Cloudflare](https://dash.cloudflare.com/) and choose the free plan. You'll need Node.js 20+ on your computer, access to the GitHub repository and the Wrangler CLI. The Cloudflare free-tier limits may change, and high traffic can hit daily limits; it is not unlimited.

Open a terminal in a local clone of `SkyPulse-AU`:

```sh
cd notifications
npx wrangler login
npx wrangler d1 create skypulse-au-alerts
```

Wrangler will show a `database_id`. Copy that UUID into `notifications/wrangler.toml`, replacing **REPLACE_WITH_YOUR_D1_DATABASE_ID**.

## 2. Create the database schema

```sh
npx wrangler d1 execute skypulse-au-alerts --remote --file=./schema.sql
```

This creates `subscriptions`, `observed_events` and `deliveries`. Keep the database private.

## 3. Generate and secure VAPID keys

Run:

```sh
node generate-vapid.mjs
```

It displays two keys, **VAPID_PUBLIC_KEY** and **VAPID_PRIVATE_PKCS8**. Do not commit either value or paste the private key into GitHub issues, chat, screenshots or a public config file.

Store each value as a separate Cloudflare Worker secret:

```sh
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_PKCS8
```

When prompted, paste its respective value. This service uses the HTTPS site URL as the Web Push VAPID contact subject, so no personal email address is required.

## 4. Deploy the Worker

```sh
npx wrangler deploy
```

Record the actual Worker URL that Cloudflare returns, such as:

`https://skypulse-au-alerts.YOUR-SUBDOMAIN.workers.dev`

Visit `https://YOUR-WORKER-URL/health` (use the real URL). A correctly configured service returns **"ready": true**.

The Cron Trigger runs every 15 minutes, but its checks depend on GitHub Pages publishing fresh RFS snapshots (typically about every 30 minutes, best effort). Some notifications will be late or missed, particularly when an upstream feed or the free-tier quota is unavailable.

## 5. Connect your PWA

In **`assets/push-config.js`** in your public repository, set:

```js
window.SKYPULSE_PUSH_API = "https://skypulse-au-alerts.YOUR-SUBDOMAIN.workers.dev";
```

Replace that example with your actual Worker URL. This URL is public; **never put private VAPID keys in the site**.

Commit the config change to `main` and confirm **Deploy SkyPulse AU** succeeds in GitHub Actions. The installed PWA may need to be fully closed and reopened to pick up the updated file.

## 6. Opt in and test

1. Open SkyPulse AU → **Alert Centre & Settings → Background Push Notifications**.
2. Choose a saved Australian location and alert radius. On iPhone/iPad, first add SkyPulse AU to the Home Screen and **launch it from the Home Screen** (iOS/iPadOS 16.4+).
3. Review the consent notice and tick the consent checkbox.
4. Tap **Enable Background Alerts** and grant browser permission.
5. Confirm the status is shown as enabled, then press **Test Notification**. This checks only local display, not delivery from Cloudflare.
6. Use **Update Watch Zone** after changing your saved location/radius. Normal location changes are also synced automatically.
7. Use **Disable Alerts** to unsubscribe and remove your associated database subscription.

**A true end-to-end test requires a new official warning polygon intersecting the watched area**, or a newly mapped incident if the optional incident setting is enabled. Do not create a fake emergency warning to test a public system.

## Privacy and reliability

Opting in stores a random-looking browser push endpoint, watch radius, rounded coordinates and incident preference in your own Cloudflare D1 database. The endpoint is needed to deliver Web Push, and the location is used only for approximate matching. If the user disables alerts, the endpoint record and delivery references are deleted. No tracking analytics are added.

The service checks the `Origin` of browser requests, uses a push-service hostname allowlist and protects the private VAPID key with Worker secrets. For a public service at scale, add abuse protection, monitoring, automated real-device tests, delivery backoff and a more robust queue before inviting many users.

**No emergency promise:** Web Push may not arrive or may arrive late. Never rely on this service instead of [Hazards Near Me NSW](https://www.nsw.gov.au/emergency/hazards-near-me-app), [NSW RFS](https://www.rfs.nsw.gov.au/) or [BOM warnings](https://www.bom.gov.au/weather-and-climate/warnings-and-alerts). In immediate danger call 000.

### Troubleshooting

- **NOT CONFIGURED:** Worker URL is still empty, wrong, or credentials/database aren't set.
- **Unsupported device:** Use a compatible browser; on iPhone, the installed Home Screen PWA is necessary.
- **Subscribed but no alerts:** Confirm Cron Trigger, fresh source snapshots, RFS polygons, subscription watch radius, official RFS source and device push permissions. General fires are not sent unless incident updates are specifically opted into.
- **HTTP 403 from the Worker:** The request's Origin does not match `ALLOWED_ORIGIN`; preserve `https://iillifoggyiilli.github.io` in the Worker config.
- **Daily limits:** Cloudflare Workers and D1 can stop handling operations after free quotas are exceeded. There is no automatic fallback to emergency SMS.
