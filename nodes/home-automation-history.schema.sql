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

CREATE TABLE IF NOT EXISTS solaredge_meter_readings (
  observed_at TEXT PRIMARY KEY,
  local_day TEXT NOT NULL,
  grid_import_total_kwh REAL NOT NULL,
  grid_export_total_kwh REAL NOT NULL,
  scale_factor INTEGER NOT NULL,
  raw_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS solaredge_meter_readings_day_idx
  ON solaredge_meter_readings(local_day, observed_at);

CREATE TABLE IF NOT EXISTS solaredge_inverter_readings (
  observed_at TEXT PRIMARY KEY,
  local_day TEXT NOT NULL,
  pv_production_total_kwh REAL NOT NULL,
  scale_factor INTEGER NOT NULL,
  raw_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS solaredge_inverter_readings_day_idx
  ON solaredge_inverter_readings(local_day, observed_at);

CREATE TABLE IF NOT EXISTS daily_energy_balance (
  day TEXT PRIMARY KEY,
  quality TEXT NOT NULL,
  baseline_observed_at TEXT,
  latest_observed_at TEXT,
  meter_pv_production_kwh REAL,
  meter_house_consumption_kwh REAL,
  integrated_pv_production_kwh REAL NOT NULL DEFAULT 0,
  integrated_house_consumption_kwh REAL NOT NULL DEFAULT 0,
  pv_difference_kwh REAL,
  house_difference_kwh REAL,
  fallback_pv_production_kwh REAL,
  fallback_house_consumption_kwh REAL,
  calculated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS daily_energy_balance_calculated_idx
  ON daily_energy_balance(calculated_at);

CREATE TABLE IF NOT EXISTS daily_energy_reconciliation (
  day TEXT PRIMARY KEY,
  quality TEXT NOT NULL,
  baseline_kind TEXT NOT NULL,
  baseline_observed_at TEXT,
  latest_observed_at TEXT,
  meter_import_kwh REAL,
  meter_export_kwh REAL,
  integrated_import_kwh REAL NOT NULL DEFAULT 0,
  integrated_export_kwh REAL NOT NULL DEFAULT 0,
  import_difference_kwh REAL,
  export_difference_kwh REAL,
  fallback_import_kwh REAL,
  fallback_export_kwh REAL,
  average_tariff_ct_kwh REAL,
  integrated_import_cost_eur REAL NOT NULL DEFAULT 0,
  import_comparison_cost_eur REAL,
  export_comparison_value_eur REAL,
  calculated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS daily_energy_reconciliation_calculated_idx
  ON daily_energy_reconciliation(calculated_at);
