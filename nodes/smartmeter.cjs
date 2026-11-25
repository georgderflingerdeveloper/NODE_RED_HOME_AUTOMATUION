'use strict';

// SunSpec Meter 1, zero-based register addresses used by the existing Modbus client.
const fields = {
  voltage_l1: [196, 203], voltage_l2: [197, 203], voltage_l3: [198, 203],
  current_l1: [191, 194], current_l2: [192, 194], current_l3: [193, 194],
  frequency: [204, 205], grid_power: [206, 210],
  power_l1: [207, 210], power_l2: [208, 210], power_l3: [209, 210],
};
const metrics = {
  voltage: ['voltage_l1', 'voltage_l2', 'voltage_l3'],
  current: ['current_l1', 'current_l2', 'current_l3'],
  power: ['power_l1', 'power_l2', 'power_l3'],
  grid: ['grid_import_w', 'grid_export_w'],
  frequency: ['frequency'],
  energy: ['grid_import_total_kwh', 'grid_export_total_kwh'],
};

function parseSample(payload) {
  const words = Array.isArray(payload) ? payload : payload?.data;
  if (!Array.isArray(words) || words.length !== 21) return null;
  function signed(address) {
    const word = words[address - 190];
    if (!Number.isInteger(word) || word < 0 || word > 65535 || word === 0x8000) return null;
    return word >= 0x8000 ? word - 65536 : word;
  }
  const sample = {};
  for (const [field, [address, scaleAddress]] of Object.entries(fields)) {
    const raw = signed(address), scale = signed(scaleAddress);
    sample[field] = raw === null || scale === null || Math.abs(scale) > 5 ? null : raw * 10 ** scale;
  }
  return Object.values(sample).some(Number.isFinite) ? sample : null;
}

function createSampleWriter(db) {
  const columns = Object.keys(fields);
  const insert = db.prepare(`INSERT INTO smartmeter_samples (observed_at, ${columns.join(',')})
    VALUES (?, ${columns.map(() => '?').join(',')}) ON CONFLICT(observed_at) DO NOTHING`);
  return (payload, time) => {
    const sample = parseSample(payload);
    if (sample) insert.run(time, ...columns.map(key => sample[key]));
  };
}

function trendQuery(query, now = Date.now()) {
  const metric = query.metric ?? 'grid', hours = Number(query.hours ?? 1);
  const end = query.end === undefined ? now : Date.parse(query.end);
  if (!Object.hasOwn(metrics, metric) || ![1, 6, 24, 168, 720].includes(hours) ||
      !Number.isFinite(end) || Math.abs(end) > 1e14) throw Error('Ungültiger Trendzeitraum oder Messgröße.');
  return {metric, start: new Date(end - hours * 3600000).toISOString(), end: new Date(end).toISOString(),
    step: Math.max(30, Math.ceil(hours * 3600 / 360))};
}

function meterConnection(latest, energy, now = Date.now()) {
  const lastSeen = [latest?.observed_at, energy?.observed_at].filter(Boolean).sort().at(-1);
  if (!lastSeen) return {state: 'unknown', lastSeen: null};
  const age = now - Date.parse(lastSeen);
  return {state: age >= 0 && age < 90000 ? 'online' : 'offline', lastSeen};
}

function readDashboard(db, spec) {
  const latest = db.prepare('SELECT * FROM smartmeter_samples ORDER BY observed_at DESC LIMIT 1').get();
  const energy = db.prepare(`SELECT observed_at, grid_import_total_kwh, grid_export_total_kwh
    FROM solaredge_meter_readings ORDER BY observed_at DESC LIMIT 1`).get();
  const table = spec.metric === 'energy' ? 'solaredge_meter_readings' : 'smartmeter_samples';
  const columns = metrics[spec.metric];
  const expression = key => {
    if (key === 'grid_import_w') return 'MAX(0, -grid_power)';
    if (key === 'grid_export_w') return 'MAX(0, grid_power)';
    return key;
  };
  const aggregates = columns.map(key => `AVG(${expression(key)}) AS ${key}`).join(',');
  // Separate runs across outages even when a long chart interval puts both ends into one bucket.
  const points = db.prepare(`WITH timed AS (
      SELECT *, unixepoch(observed_at) AS t, unixepoch(LAG(observed_at) OVER (ORDER BY observed_at)) AS previous
      FROM ${table} WHERE observed_at >= ? AND observed_at < ?
    ), runs AS (
      SELECT *, SUM(CASE WHEN t - previous > 90 THEN 1 ELSE 0 END) OVER (ORDER BY observed_at) AS segment FROM timed
    ) SELECT AVG(t) * 1000 AS time, segment, ${aggregates} FROM runs
    GROUP BY segment, CAST(t / ? AS INTEGER) ORDER BY time`).all(spec.start, spec.end, spec.step);
  return {latest: latest ?? null, energy: energy ?? null, connection: meterConnection(latest, energy), ...spec, columns, points};
}
module.exports = {createSampleWriter, parseSample, readDashboard, trendQuery, meterConnection};
