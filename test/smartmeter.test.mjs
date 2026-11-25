import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import smartmeter from '../nodes/smartmeter.cjs';

function registers() {
  const words = Array(21).fill(0x8000);
  function set(register, value) { words[register-190] = value & 0xffff; }
  set(191, 104); set(194, -1);
  set(196, 2308); set(197, 0); set(203, -1);
  set(204, 4999); set(205, -2);
  set(206, -1660); set(207, -556); set(210, 0);
  return words;
}
test('Smartmeter decodes signed power, per-group scales and missing phases', () => {
  const sample = smartmeter.parseSample({data: registers()});
  assert.equal(sample.current_l1, 10.4);
  assert.equal(sample.voltage_l1, 230.8);
  assert.equal(sample.voltage_l2, 0);
  assert.equal(sample.voltage_l3, null);
  assert.equal(sample.grid_power, -1660);
  assert.equal(sample.power_l1, -556);
  assert.equal(sample.frequency, 49.99);
  const invalid = registers();
  invalid[13] = 0x8000;
  assert.equal(smartmeter.parseSample(invalid).voltage_l1, null);
  assert.equal(smartmeter.parseSample(Array(21).fill(0x8000)), null);
  assert.equal(smartmeter.parseSample([]), null);
});
test('Smartmeter history keeps outages and supports existing energy readings', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(readFileSync('nodes/home-automation-history.schema.sql','utf8'));
    const write = smartmeter.createSampleWriter(db);
    const time = '2026-11-25T13:04:00.000Z', later = '2026-11-25T13:08:00.000Z';
    write(registers(), time); write(registers(), time); write(registers(), later);
    db.prepare('INSERT INTO solaredge_meter_readings VALUES (?,?,?,?,?,?)').run(time,'2026-11-25',123,45,0,'{}');
    const query = (metric) => smartmeter.trendQuery({end:'2026-11-25T14:00:00Z',hours:24,metric});
    const result = smartmeter.readDashboard(db, query('grid'));
    assert.equal(result.points.length,2);
    assert.equal(result.points[0].grid_import_w,1660);
    assert.equal(result.points[0].grid_export_w,0);
    assert.notEqual(result.points[0].segment,result.points[1].segment);
    assert.equal(result.latest.observed_at,later);
    assert.equal(result.energy.grid_import_total_kwh,123);
    assert.equal(smartmeter.readDashboard(db,query('energy')).points[0].grid_export_total_kwh,45);
    assert.throws(()=>query('__proto__'));
    assert.throws(()=>smartmeter.trendQuery({end:'ungültig'}));
  } finally { db.close(); }
});
test('Zählerstatus berücksichtigt den letzten erfolgreichen Zählerkontakt und die 90-Sekunden-Grenze', () => {
  const latest = {observed_at:'2026-11-25T13:00:00.000Z'};
  const energy = {observed_at:'2026-11-25T13:00:30.000Z'};
  const time = Date.parse(energy.observed_at);
  assert.equal(smartmeter.meterConnection(null,null,time).state,'unknown');
  assert.deepEqual(smartmeter.meterConnection(latest,energy,time+89999),{state:'online',lastSeen:energy.observed_at});
  assert.deepEqual(smartmeter.meterConnection(latest,energy,time+90000),{state:'offline',lastSeen:energy.observed_at});
});
