import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import wallbox from '../nodes/wallbox.cjs';

const t = sec => new Date(Date.UTC(2026,10,25,14) + sec*1000).toISOString();
const words = (state=1, ticks=0, energy=0, previous=0) =>
  [state,state===6?2:0,16000,0,state===6?12000:0,ticks,energy,previous,1336,168,0];
function archive() {
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync('nodes/home-automation-history.schema.sql','utf8'));
  return db;
}
test('PCE-Leseblock skaliert Energie, Vorgabe, Zeit und Temperatur',()=>{
  const s=wallbox.parseSample(words(6,21,107));
  assert.equal(s.phases,3); assert.equal(s.offered_a,12); assert.equal(s.duration_s,210);
  assert.equal(s.energy_kwh,1.07); assert.equal(s.penultimate_kwh,13.36); assert.equal(s.temperature_c,16.8);
  assert.equal(wallbox.parseSample([]),null);
  assert.equal(wallbox.parseSample(Array(11).fill(65535)),null);
});
test('Ladung mit Pause, Neustart und beendetem Energiezähler wird einmal archiviert',()=>{
  const db=archive();
  try{
    let write=wallbox.createSampleWriter(db);
    write(words(),t(0));
    for (let n=0;n<=4;n++) write(words(6,Math.floor(n*1.5),3*n),t(15+n*15));
    write=wallbox.createSampleWriter(db);
    write(words(5,6,12),t(90));
    write(words(6,7,15),t(105));
    write(words(1,0,0,16),t(120));
    write(words(1,0,0,16),t(120));
    const spec=wallbox.trendQuery({end:t(150),metric:'power',hours:1});
    const {sessions,latest,points}=wallbox.readDashboard(db,spec);
    assert.equal(sessions.length,1);
    assert.deepEqual([sessions[0].started_at,sessions[0].ended_at,sessions[0].duration_s,sessions[0].energy_kwh,sessions[0].incomplete],
      [t(15),t(120),70,.16,0]);
    assert.equal(latest.power_kw,0);assert.equal(latest.previous_kwh,.16);
    assert.equal(db.prepare('SELECT power_kw FROM wallbox_samples WHERE observed_at=?').get(t(75)).power_kw,7.2);
    assert(points.length>1);
    for (const metric of ['energy','current','duration','temperature']){
      assert(wallbox.readDashboard(db,wallbox.trendQuery({end:t(150),metric})).points.length);
    }
    assert.throws(()=>wallbox.trendQuery({metric:'unknown'}));
  }finally{db.close();}
});
test('Erfassung mitten in einer Ladung und Lücken erhalten nachvollziehbare Zeitangaben',()=>{
  const db=archive();
  try{
    const write=wallbox.createSampleWriter(db);
    write(words(6,12,24),t(150));
    write(words(6,24,48),t(270));
    write(words(),t(600));
    const {sessions,points}=wallbox.readDashboard(db,wallbox.trendQuery({end:t(610)}));
    assert.equal(sessions.length,1);
    assert.equal(sessions[0].started_at,t(30));
    assert.equal(sessions[0].ended_at,t(270));
    assert.equal(sessions[0].incomplete,1);
    assert.equal(points[0].power_kw,null);
    assert.notEqual(points[0].segment,points.at(-1).segment);
  }finally{db.close();}
});
