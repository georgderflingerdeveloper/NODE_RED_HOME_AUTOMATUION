PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS telemetry_events (
  id INTEGER PRIMARY KEY,
  observed_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  source TEXT NOT NULL,
  topic TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS telemetry_events_observed_at_idx ON telemetry_events(observed_at);
CREATE INDEX IF NOT EXISTS telemetry_events_topic_observed_at_idx ON telemetry_events(topic, observed_at);

CREATE TABLE IF NOT EXISTS tariff_slots (
  valid_from TEXT PRIMARY KEY,
  valid_until TEXT NOT NULL,
  provider TEXT NOT NULL,
  market_price_eur_mwh REAL NOT NULL,
  price_ct_kwh REAL NOT NULL,
  fetched_at TEXT NOT NULL,
  raw_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tariff_slots_valid_until_idx ON tariff_slots(valid_until);

CREATE TABLE IF NOT EXISTS cost_intervals (
  interval_start TEXT PRIMARY KEY,
  interval_end TEXT NOT NULL,
  grid_import_kwh REAL,
  grid_export_kwh REAL,
  tariff_ct_kwh REAL,
  energy_cost_eur REAL,
  data_quality TEXT NOT NULL DEFAULT 'pending'
);
CREATE TABLE IF NOT EXISTS daily_costs (
  day TEXT PRIMARY KEY,
  grid_import_kwh REAL,
  grid_export_kwh REAL,
  energy_cost_eur REAL,
  calculated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_state (
  source TEXT PRIMARY KEY,
  observed_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  status TEXT NOT NULL,
  error_text TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hourly_snapshots (
  interval_start TEXT PRIMARY KEY,
  interval_end TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  energy_status TEXT NOT NULL DEFAULT 'offline',
  weather_status TEXT NOT NULL DEFAULT 'offline',
  tariff_status TEXT NOT NULL DEFAULT 'offline',
  pv_energy_kwh REAL NOT NULL DEFAULT 0,
  house_consumption_kwh REAL NOT NULL DEFAULT 0,
  grid_import_kwh REAL NOT NULL DEFAULT 0,
  grid_export_kwh REAL NOT NULL DEFAULT 0,
  energy_cost_eur REAL NOT NULL DEFAULT 0,
  market_price_ct_kwh REAL,
  temperature_c REAL,
  cloud_cover_percent REAL,
  sunshine_percent REAL,
  precipitation_probability_percent REAL,
  sample_count INTEGER NOT NULL DEFAULT 0,
  data_quality TEXT NOT NULL DEFAULT 'offline'
);
CREATE INDEX IF NOT EXISTS hourly_snapshots_interval_end_idx ON hourly_snapshots(interval_end);
