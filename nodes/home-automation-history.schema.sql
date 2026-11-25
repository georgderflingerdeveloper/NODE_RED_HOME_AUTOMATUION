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
  market_price_eur_mwh REAL,
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

-- Manuelle Monatsabrechnung: separat von Messwerten, Geld als ganze Cent.
CREATE TABLE IF NOT EXISTS user_monthly_bills (
 month TEXT PRIMARY KEY,
 kwh_milli INTEGER NOT NULL,
 total_cents INTEGER NOT NULL,
 energy_cents INTEGER,
 note TEXT NOT NULL DEFAULT '',
 revision INTEGER NOT NULL,
 updated_at TEXT NOT NULL
);

-- Cloud-Messwerte separat halten: lokale Rohdaten werden niemals überschrieben.
CREATE TABLE IF NOT EXISTS solaredge_cloud_energy (
 site_id TEXT NOT NULL,
 interval_start TEXT NOT NULL,
 interval_end TEXT NOT NULL,
 metric TEXT NOT NULL CHECK(metric IN ('house','grid','pv','export')),
 kwh REAL NOT NULL CHECK(kwh>=0),
 fetched_at TEXT NOT NULL,
 PRIMARY KEY(site_id,interval_start,metric)
);
CREATE INDEX IF NOT EXISTS solaredge_cloud_energy_end_idx ON solaredge_cloud_energy(site_id,interval_end);
CREATE TABLE IF NOT EXISTS solaredge_cloud_state (
 site_id TEXT NOT NULL,
 name TEXT NOT NULL,
 value_json TEXT NOT NULL,
 PRIMARY KEY(site_id,name)
);
CREATE TABLE IF NOT EXISTS local_energy_coverage (
 interval_start TEXT PRIMARY KEY,
 covered_ms REAL NOT NULL DEFAULT 0
);

-- Leistungsstichprobe mindestens alle 60 Sekunden sowie bei Online/Offline-Wechsel.
-- Rohdaten bleiben getrennt von integrierten Energie- und Zählerwerten erhalten.
CREATE TABLE IF NOT EXISTS solar_power_samples (
 observed_at TEXT PRIMARY KEY,
 received_at TEXT NOT NULL,
 online INTEGER NOT NULL CHECK(online IN (0,1)),
 pv_power_w REAL,
 house_consumption_w REAL,
 grid_import_w REAL,
 grid_export_w REAL,
 raw_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS smartmeter_samples (
  observed_at TEXT PRIMARY KEY,
  voltage_l1 REAL, voltage_l2 REAL, voltage_l3 REAL,
  current_l1 REAL, current_l2 REAL, current_l3 REAL,
  frequency REAL, grid_power REAL,
  power_l1 REAL, power_l2 REAL, power_l3 REAL
);

CREATE TABLE IF NOT EXISTS wallbox_sessions (
  id INTEGER PRIMARY KEY, started_at TEXT NOT NULL, last_seen TEXT NOT NULL, ended_at TEXT,
  duration_s INTEGER NOT NULL, energy_kwh REAL NOT NULL, incomplete INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS wallbox_one_open ON wallbox_sessions((1)) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS wallbox_sessions_start ON wallbox_sessions(started_at);

CREATE TABLE IF NOT EXISTS wallbox_samples (
  observed_at TEXT PRIMARY KEY, state INTEGER NOT NULL, phases INTEGER NOT NULL,
  limit_a REAL NOT NULL, offered_a REAL NOT NULL, duration_s INTEGER NOT NULL,
  energy_kwh REAL NOT NULL, previous_kwh REAL NOT NULL, penultimate_kwh REAL NOT NULL,
  temperature_c REAL NOT NULL, error_code INTEGER NOT NULL, power_kw REAL,
  session_id INTEGER REFERENCES wallbox_sessions(id)
);

CREATE INDEX IF NOT EXISTS wallbox_samples_session ON wallbox_samples(session_id, observed_at);
CREATE TABLE IF NOT EXISTS wallbox_session_details (
  session_id INTEGER PRIMARY KEY REFERENCES wallbox_sessions(id),
  vehicle TEXT NOT NULL CHECK (vehicle IN ('Hyundai','MG','Offen')),
  app_kwh REAL CHECK (app_kwh IS NULL OR (vehicle='Hyundai' AND app_kwh>=0)),
  revision INTEGER NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS wallbox_energy_deltas (
  id INTEGER PRIMARY KEY, session_id INTEGER NOT NULL REFERENCES wallbox_sessions(id),
  from_at TEXT NOT NULL, to_at TEXT NOT NULL, kwh REAL NOT NULL CHECK(kwh>0)
);
CREATE INDEX IF NOT EXISTS wallbox_delta_session ON wallbox_energy_deltas(session_id);
CREATE INDEX IF NOT EXISTS wallbox_delta_time ON wallbox_energy_deltas(to_at);
CREATE TABLE IF NOT EXISTS wallbox_price_parts (
  delta_id INTEGER NOT NULL REFERENCES wallbox_energy_deltas(id), from_at TEXT NOT NULL, to_at TEXT NOT NULL,
  local_day TEXT NOT NULL, kwh REAL NOT NULL, ct_kwh REAL,
  cost_eur REAL GENERATED ALWAYS AS (kwh * ct_kwh / 100.0) STORED,
  PRIMARY KEY(delta_id,from_at)
);
CREATE INDEX IF NOT EXISTS wallbox_parts_day ON wallbox_price_parts(local_day);
