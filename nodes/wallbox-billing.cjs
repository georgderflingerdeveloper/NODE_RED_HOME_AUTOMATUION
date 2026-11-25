'use strict';
const {priceSeries,localInstant} = require('./energy-range.cjs');
const {localDay} = require('./reconcile-solaredge-daily-energy.cjs');
const {periodFor,shiftDay} = require('./analysis-periods.cjs');
const iso = t => new Date(t).toISOString();
const vehicles = ['Hyundai','MG','Offen'];

function createBilling(db) {
  const add = db.prepare('INSERT INTO wallbox_energy_deltas(session_id,from_at,to_at,kwh) VALUES(?,?,?,?)');
  const rates = db.prepare('SELECT * FROM tariff_slots WHERE valid_from<? AND valid_until>?');
  const part = db.prepare('INSERT INTO wallbox_price_parts(delta_id,from_at,to_at,local_day,kwh,ct_kwh) VALUES(?,?,?,?,?,?)');
  const clear = db.prepare('DELETE FROM wallbox_price_parts WHERE delta_id=?');
  function price(id, from, to, kwh) {
    const start=Date.parse(from), end=Date.parse(to);
    const prices=priceSeries(rates.all(to,from),start,end);
    const boundaries=new Set([start,end]);
    for(const rate of prices){boundaries.add(rate.from);boundaries.add(rate.to);}
    // Every Vienna midnight is on a UTC hour, including both DST transitions.
    for(let t=(Math.floor(start/3600000)+1)*3600000;t<end;t+=3600000)boundaries.add(t);
    const times=[...boundaries].sort((a,b)=>a-b);
    clear.run(id);
    for(let i=1;i<times.length;i++){
      const a=times[i-1], b=times[i], rate=prices.find(r=>r.from<=a && r.to>=b);
      part.run(id,iso(a),iso(b),localDay(a),kwh*(b-a)/(end-start),rate?.priceCtKwh ?? null);
    }
  }
  function record(id,from,to,kwh){
    if (!(kwh>1e-9)) return;
    // A first reading can already carry energy at the inferred start time.
    if(from>=to)to=iso(Date.parse(from)+1);
    const row=add.run(id,from,to,kwh);
    price(Number(row.lastInsertRowid),from,to,kwh);
  }
  const session = db.prepare('SELECT * FROM wallbox_sessions WHERE id=?');
  function recordChange(id,previous) {
    const row=session.get(id);
    record(id,previous?.last_seen ?? row.started_at,row.ended_at ?? row.last_seen,row.energy_kwh-(previous?.energy_kwh ?? 0));
  }
  function backfill(){
    db.exec('SAVEPOINT wallbox_billing_backfill');
    try {
      const missing=db.prepare(`SELECT * FROM wallbox_sessions s WHERE energy_kwh>0 AND NOT EXISTS
        (SELECT 1 FROM wallbox_energy_deltas d WHERE d.session_id=s.id)`).all();
      const samples=db.prepare('SELECT observed_at,energy_kwh FROM wallbox_samples WHERE session_id=? ORDER BY observed_at');
      for(const row of missing){
        let time=row.started_at, kwh=0;
        for(const sample of samples.iterate(row.id)){
          record(row.id,time,sample.observed_at,sample.energy_kwh-kwh);
          kwh=Math.max(kwh,sample.energy_kwh);time=sample.observed_at;
        }
        record(row.id,time,row.ended_at ?? row.last_seen,row.energy_kwh-kwh);
      }
      db.exec('RELEASE wallbox_billing_backfill');
    }catch(e){db.exec('ROLLBACK TO wallbox_billing_backfill; RELEASE wallbox_billing_backfill');throw e;}
  }
  function reprice(from,to) {
    for(const row of db.prepare('SELECT * FROM wallbox_energy_deltas WHERE to_at>? AND from_at<?').all(from,to))
      price(row.id,row.from_at,row.to_at,row.kwh);
  }
  return {backfill,recordChange,reprice};
}

function saveDetails(db,id,body) {
  if (!Number.isSafeInteger(id) || id<1 || !body || !vehicles.includes(body.vehicle) ||
      !Number.isSafeInteger(body.revision) || body.revision<0 ||
      !(body.appKwh===null || (body.vehicle==='Hyundai' && Number.isFinite(body.appKwh) && body.appKwh>=0 && body.appKwh<=1000)))
    throw Object.assign(Error('Fahrzeug oder App-Wert ungültig.'),{status:400});
  const session=db.prepare('SELECT ended_at FROM wallbox_sessions WHERE id=?').get(id);
  if (!session)
    throw Object.assign(Error('Ladung nicht gefunden.'),{status:404});
  if(body.appKwh!==null && !session.ended_at)throw Object.assign(Error('Den App-Endwert bitte nach Ladeende eintragen.'),{status:400});
  const now=new Date().toISOString();
  const result=body.revision===0
    ? db.prepare('INSERT OR IGNORE INTO wallbox_session_details VALUES(?,?,?,1,?)').run(id,body.vehicle,body.appKwh,now)
    : db.prepare('UPDATE wallbox_session_details SET vehicle=?,app_kwh=?,updated_at=?,revision=revision+1 WHERE session_id=? AND revision=?')
        .run(body.vehicle,body.appKwh,now,id,body.revision);
  if(!result.changes)throw Object.assign(Error('Die Zuordnung wurde inzwischen geändert. Bitte neu öffnen.'),{status:409});
  return {revision:body.revision+1};
}

function sessionCosts(db,rows) {
  const cost=db.prepare(`SELECT SUM(p.cost_eur) AS cost, SUM(CASE WHEN p.ct_kwh IS NOT NULL THEN p.kwh ELSE 0 END) AS priced
    FROM wallbox_energy_deltas d JOIN wallbox_price_parts p ON p.delta_id=d.id WHERE d.session_id=?`);
  const details=db.prepare('SELECT vehicle, app_kwh, revision, updated_at FROM wallbox_session_details WHERE session_id=?');
  return rows.map(s=>{
    const {cost:eur,priced}=cost.get(s.id);
    const complete=Math.abs(s.energy_kwh-(priced||0))<1e-6;
    return {...s,vehicle:'Offen',app_kwh:null,revision:0,...details.get(s.id),
      cost_eur:complete ? (eur ?? 0) : null, partial_eur:eur ?? 0, priced_kwh:priced ?? 0};
  });
}

function rangeSummary(db,start,end) {
  const totals=db.prepare(`SELECT COALESCE(v.vehicle,'Offen') vehicle,COUNT(DISTINCT d.session_id) count,
    SUM(p.kwh) kwh, SUM(p.cost_eur) eur, SUM(CASE WHEN p.ct_kwh IS NULL THEN p.kwh ELSE 0 END) missing
    FROM wallbox_price_parts p JOIN wallbox_energy_deltas d ON d.id=p.delta_id
    LEFT JOIN wallbox_session_details v ON v.session_id=d.session_id
    WHERE p.local_day BETWEEN ? AND ? GROUP BY COALESCE(v.vehicle,'Offen')`);
  const matched=db.prepare(`SELECT COUNT(*) count,SUM(s.energy_kwh) wallbox_kwh,SUM(v.app_kwh) app_kwh
    FROM wallbox_session_details v JOIN wallbox_sessions s ON s.id=v.session_id
    WHERE v.vehicle='Hyundai' AND v.app_kwh IS NOT NULL AND s.ended_at>=? AND s.ended_at<?`);
  const rows=totals.all(start,end);
  const total=rows.reduce((a,r)=>({kwh:a.kwh+r.kwh,eur:a.eur+(r.eur||0),missing:a.missing+r.missing,count:a.count+r.count}),
    {kwh:0,eur:0,missing:0,count:0});
  const comparison=matched.get(iso(localInstant(start+'T00:00')),iso(localInstant(shiftDay(end,1)+'T00:00')));
  return {start,end,total,comparison,vehicles:vehicles.map(vehicle=>rows.find(r=>r.vehicle===vehicle) ||
    {vehicle,kwh:0,eur:0,missing:0,count:0})};
}
function summary(db,day) {
  return ['day','week','month'].map(type=>{
    const {start,end}=periodFor(type,day);
    return {type,...rangeSummary(db,start,end)};
  });
}
function summaryDay(value) {
  if(value===undefined)return localDay(Date.now());
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
     !Number.isFinite(Date.parse(value)) || iso(Date.parse(value)).slice(0,10)!==value)throw Error('Ungültiger Stichtag.');
  return value;
}
function periodType(value='day'){
  if(!['day','week','month'].includes(value))throw Error('Ungültiger Abrechnungszeitraum.');
  return value;
}
function calendarSessions(db,day,type){
  const {start,end}=periodFor(type,day);
  const from=iso(localInstant(start+'T00:00'));
  const to=iso(localInstant(shiftDay(end,1)+'T00:00'));
  return sessionCosts(db,db.prepare(`SELECT * FROM wallbox_sessions WHERE started_at<?
    AND COALESCE(ended_at,last_seen)>=? ORDER BY started_at DESC`).all(to,from));
}
module.exports={rangeSummary,periodType,calendarSessions,createBilling,saveDetails,sessionCosts,summary,summaryDay};
