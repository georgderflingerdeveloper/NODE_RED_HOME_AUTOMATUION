'use strict';
const charges = require('./wallbox-billing.cjs');
const meter = require('./smartmeter.cjs');

const metrics = {
  power: ['power_kw'], energy: ['energy_kwh'], current: ['offered_a', 'limit_a'],
  duration: ['minutes'], temperature: ['temperature_c']
};
const trendQuery = (query, now) => ({...meter.trendQuery(query, now, metrics, 'power'), day: charges.summaryDay(query.day), period:charges.periodType(query.period)});
const iso = ms => new Date(ms).toISOString();

function parseSample(payload) {
  // PCE 40101–40111, function 03, zero-based address 100.
  const words = Array.isArray(payload) ? payload : payload?.data;
  if (!Array.isArray(words) || words.length !== 11 ||
      !words.every(x => Number.isInteger(x) && x >= 0 && x <= 65535)) return null;
  const [state, relay, limit, , offered, ticks, energy, previous, penultimate, temp, error] = words;
  if (state > 7 || relay > 2) return null;
  return {state, phases: [0,1,3][relay], limit_a: limit / 1000, offered_a: offered / 1000,
    duration_s: ticks * 10, energy_kwh: energy / 100, previous_kwh: previous / 100,
    penultimate_kwh: penultimate / 100, temperature_c: (temp > 32767 ? temp - 65536 : temp) / 10,
    error_code: error & 15};
}

function createSampleWriter(db, billing = charges.createBilling(db)) {
  billing.backfill();
  const latest = db.prepare('SELECT * FROM wallbox_samples ORDER BY observed_at DESC LIMIT 1');
  const open = db.prepare('SELECT * FROM wallbox_sessions WHERE ended_at IS NULL');
  const begin = db.prepare(`INSERT INTO wallbox_sessions(started_at,last_seen,duration_s,energy_kwh,incomplete)
    VALUES(?,?,?,?,?)`);
  const update = db.prepare(`UPDATE wallbox_sessions SET last_seen=?, duration_s=MAX(duration_s,?),
    energy_kwh=MAX(energy_kwh,?), incomplete=MAX(incomplete,?) WHERE id=?`);
  const finish = db.prepare(`UPDATE wallbox_sessions SET ended_at=?, energy_kwh=MAX(energy_kwh,?),
    duration_s=MAX(duration_s,?), incomplete=MAX(incomplete,?) WHERE id=?`);
  const minute = db.prepare(`SELECT energy_kwh,observed_at FROM wallbox_samples
    WHERE observed_at BETWEEN ? AND ? AND session_id=? ORDER BY observed_at DESC LIMIT 1`);
  const insert = db.prepare(`INSERT INTO wallbox_samples(observed_at,state,phases,limit_a,offered_a,duration_s,
    energy_kwh,previous_kwh,penultimate_kwh,temperature_c,error_code,power_kw,session_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  return (payload, time) => {
    const s = parseSample(payload);
    if (!s) return;
    const now = Date.parse(time);
    db.exec('BEGIN IMMEDIATE');
    try {
      const prev = latest.get();
      if (prev && time <= prev.observed_at) { db.exec('ROLLBACK'); return; }
      const gap = !prev || now - Date.parse(prev.observed_at) > 90000;
      const active = s.state === 6, paused = s.state === 5;
      let session = open.get();
      const previousSession = session;
      if (session) {
        const reset = s.duration_s < session.duration_s || s.energy_kwh < session.energy_kwh;
        const sameAcrossGap = active && !reset && Math.abs(
          (now - Date.parse(session.last_seen)) / 1000 - (s.duration_s - session.duration_s)) <= 20;
        if ((!active && !paused) || reset || (gap && !sameAcrossGap)) {
          // On a counter rollover the device moves the completed energy to its previous slot.
          const rotated = !gap && prev && (s.previous_kwh !== prev.previous_kwh ||
            s.penultimate_kwh !== prev.penultimate_kwh);
          const finalEnergy = rotated ? s.previous_kwh : (!gap && !reset ? s.energy_kwh : session.energy_kwh);
          finish.run(gap || reset && active ? session.last_seen : time, finalEnergy,
            !gap && !reset ? s.duration_s : session.duration_s, Number(gap || reset && active), session.id);
          session = null;
        }
      }
      if (!session && active) {
        // First observation, including a charge already running when recording began.
        const inferred = now - s.duration_s * 1000;
        const start = prev && !gap ? Math.max(Date.parse(prev.observed_at), inferred) : inferred;
        const row = begin.run(iso(start), time, s.duration_s, s.energy_kwh, Number(gap));
        session = {id: Number(row.lastInsertRowid)};
      } else if (session) {
        update.run(time, s.duration_s, s.energy_kwh, Number(gap), session.id);
      }
      let power = null;
      if (!active && !s.phases) power = 0;
      else if (active && !gap && session) {
        const ref = minute.get(iso(now - 75000), iso(now - 50000), session.id);
        if (ref && ref.energy_kwh <= s.energy_kwh) {
          power = (s.energy_kwh - ref.energy_kwh) * 3600000 / (now - Date.parse(ref.observed_at));
        }
      }
      insert.run(time,s.state,s.phases,s.limit_a,s.offered_a,s.duration_s,s.energy_kwh,s.previous_kwh,
        s.penultimate_kwh,s.temperature_c,s.error_code,power,session?.id ?? null);
      if (previousSession) billing.recordChange(previousSession.id,previousSession);
      if (session && session.id !== previousSession?.id) billing.recordChange(session.id,null);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  };
}

function readDashboard(db, spec) {
  const latest = db.prepare(`SELECT s.*, session.started_at FROM wallbox_samples s
    LEFT JOIN wallbox_sessions session ON session.id=s.session_id ORDER BY s.observed_at DESC LIMIT 1`).get() ?? null;
  const columns = metrics[spec.metric];
  const aggregates = columns.map(k => k === 'minutes' ? 'AVG(duration_s)/60 AS minutes' : `AVG(${k}) AS ${k}`);
  const points = meter.readPoints(db,spec,'wallbox_samples',aggregates.join(','));
  const sessions = db.prepare(`SELECT * FROM wallbox_sessions WHERE started_at < ?
    AND COALESCE(ended_at,last_seen) >= ? ORDER BY started_at DESC`).all(spec.end,spec.start);
  const calendar=charges.calendarSessions(db,spec.day,spec.period);
  return {calendarSessions:calendar,latest, connection: meter.meterConnection(latest,null), ...spec, columns, points, sessions:charges.sessionCosts(db,sessions), periods:charges.summary(db,spec.day)};
}
module.exports = {parseSample,createSampleWriter,trendQuery,readDashboard};
