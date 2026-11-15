-- Privacy: stores only the push endpoint and rounded (~1 km) watch-zone coordinates.
CREATE TABLE IF NOT EXISTS subscriptions (
 id TEXT PRIMARY KEY NOT NULL,
 endpoint TEXT NOT NULL,
 latitude REAL NOT NULL,
 longitude REAL NOT NULL,
 radius_km INTEGER NOT NULL DEFAULT 50,
 include_incidents INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS observed_events (
 id TEXT PRIMARY KEY NOT NULL,
 kind TEXT NOT NULL,
 latitude REAL,
 longitude REAL,
 polygons_json TEXT NOT NULL DEFAULT '[]',
 first_seen INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS deliveries (
 subscription_id TEXT NOT NULL,
 event_id TEXT NOT NULL,
 sent_at INTEGER NOT NULL,
 PRIMARY KEY(subscription_id,event_id)
);
CREATE INDEX IF NOT EXISTS idx_event_first_seen ON observed_events(first_seen);
CREATE INDEX IF NOT EXISTS idx_deliveries_sent ON deliveries(sent_at);
