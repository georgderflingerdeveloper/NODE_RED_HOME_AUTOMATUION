import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import billing from '../nodes/wallbox-billing.cjs';
import wallbox from '../nodes/wallbox.cjs';
function fixture(){
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync('nodes/home-automation-history.schema.sql','utf8'));
  return db;
}
const tariff=(db,a,b,price)=>db.prepare('INSERT INTO tariff_slots VALUES(?,?,?,?,?,?,?)')
  .run(a,b,'Test',null,price,a,'{}');
const sample=(active,elapsed,kwh)=>[active?6:1,active?1:0,16000,0,6000,elapsed,Math.round(kwh*100),0,0,160,0];
const time=s=>new Date('2026-11-29T22:59:00.000Z').getTime()+s*1000;
const iso=s=>new Date(time(s)).toISOString();

test('Preis und Kalenderanteile über Mitternacht und Wochenwechsel, Nachlieferung und Fahrzeugvergleich',()=>{
  const db=fixture();
  try{
    const engine=billing.createBilling(db),write=wallbox.createSampleWriter(db,engine);
    tariff(db,iso(-3540),iso(60),30);
    write(sample(false,0,0),iso(0));
    write(sample(true,0,0),iso(45));
    write(sample(true,3,.08),iso(75));
    write(sample(false,0,0),iso(90));
    const get=()=>billing.sessionCosts(db,db.prepare('SELECT * FROM wallbox_sessions').all())[0];
    assert.equal(get().cost_eur,null);assert.equal(get().priced_kwh,.04);
    tariff(db,iso(60),iso(3660),-10);
    engine.reprice(iso(60),iso(3660));
    assert(Math.abs(get().cost_eur-.008)<1e-10);
    assert.equal(get().vehicle,'Offen');
    billing.saveDetails(db,1,{vehicle:'Hyundai',appKwh:.07,revision:0});
    assert.throws(()=>billing.saveDetails(db,1,{vehicle:'MG',appKwh:null,revision:0}),e=>e.status===409);
    for(const type of ['day','week']){
      const sunday=billing.summary(db,'2026-11-29').find(p=>p.type===type);
      const monday=billing.summary(db,'2026-11-30').find(p=>p.type===type);
      assert.equal(sunday.total.kwh,.04);assert.equal(monday.total.kwh,.04);
      assert.equal(sunday.comparison.count,0);assert.equal(monday.comparison.count,1);
      assert.equal(monday.vehicles[0].eur,-.004);
    }
    assert.equal(billing.summary(db,'2026-11-30')[2].comparison.app_kwh,.07);
    billing.saveDetails(db,1,{vehicle:'MG',appKwh:null,revision:1});
    assert.equal(billing.summary(db,'2026-11-30')[2].vehicles[1].kwh,.08);
    assert.throws(()=>billing.saveDetails(db,1,{vehicle:'MG',appKwh:2,revision:2}));
  }finally{db.close();}
});

test('Vorhandene Ladung rekonstruieren, Abschlusskorrektur und Wiederanlauf ohne doppelte Energie',()=>{
  const db=fixture();
  try{
    const w=wallbox.createSampleWriter(db);
    w(sample(true,0,0),iso(0));w(sample(true,3,.02),iso(30));
    const end=sample(false,0,0);end[7]=4;w(end,iso(60));
    db.exec('DELETE FROM wallbox_price_parts; DELETE FROM wallbox_energy_deltas');
    const engine=billing.createBilling(db);engine.backfill();engine.backfill();
    assert.equal(db.prepare('SELECT SUM(kwh) AS k FROM wallbox_price_parts').get().k,.04);
    assert.equal(db.prepare('SELECT count(*) AS n FROM wallbox_energy_deltas').get().n,2);
    assert.throws(()=>billing.summaryDay('2026-02-30'));
  }finally{db.close();}
});
