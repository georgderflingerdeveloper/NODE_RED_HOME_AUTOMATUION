import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
const register=createRequire(import.meta.url)('../nodes/home-automation-history.js');
test('Echte History-Node: Abrechnung speichern/laden und Fehler als Antwort; Messdaten unverändert',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'history-range-'));let C;register({settings:{userDir:dir},nodes:{createNode(n){const e=new EventEmitter();n.on=e.on.bind(e);n.emit=e.emit.bind(e);n.status=()=>{};},registerType(_,c){C=c;}}});const n=new C({databasePath:'test.sqlite'});
 function deliver(payload){let result;n.emit('input',{topic:'history/dashboard',socketid:'client-a',payload},r=>result=r,e=>{if(e)throw e;});assert.equal(result.socketid,'client-a');return result;}
 let r=deliver({action:'bill-save',requestId:1,bill:{month:'2026-09',kwh:'10',totalEur:'5',energyEur:'',note:'',revision:0}});assert.equal(r.topic,'history/bill/result');assert.equal(r.payload.bill.revision,1);assert.equal(r.payload.comparison.metrics.grid.kwh,null);
 r=deliver({action:'range',requestId:2,from:'2026-09-01T00:00',to:'2026-09-02T00:00'});assert.equal(r.topic,'history/range/result');assert.equal(r.payload.metrics.grid.kwh,null);
 r=deliver({action:'range',requestId:3,from:'bad',to:'bad'});assert.ok(r.payload.error);assert.equal(r.payload.requestId,3);
 n.emit('close',()=>{});fs.rmSync(dir,{recursive:true,force:true});
});
test('Neue Ergebnis-Topics sind bis zum Dashboard verdrahtet',()=>{
 const nodes=JSON.parse(fs.readFileSync('flows.json','utf8'));const by=new Map(nodes.map(n=>[n.id,n]));const router=by.get('datenbank_result_router');
 for(const topic of ['history/range/result','history/bill/result']){const index=router.rules.findIndex(r=>r.t==='eq'&&r.v===topic);assert.ok(index>=0);assert.deepEqual(router.wires[index],['datenbank_dashboard_out']);}
 assert.equal(router.outputs,router.wires.length);
});
test('Cloud-Nachladen: echte History-Node ergänzt nur Lücken und vergleicht Kosten auf gleicher Basis',async()=>{
 const {DatabaseSync}=await import('node:sqlite');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'history-cloud-'));let C,n;
 const originalFetch=globalThis.fetch;let calls=0;
 globalThis.fetch=async url=>{calls++;return {ok:true,json:async()=>String(url).includes('/details?')?{details:{location:{timeZone:'Europe/Vienna'}}}:{energyDetails:{timeUnit:'HOUR',unit:'Wh',meters:[{type:'Purchased',values:[{date:'2026-09-01 02:00:00',value:1100},{date:'2026-09-01 03:00:00',value:3000}]},{type:'Consumption',values:[{date:'2026-09-01 02:00:00',value:2200},{date:'2026-09-01 03:00:00',value:4000}]}]}}};};
 try{
  register({settings:{userDir:dir},nodes:{createNode(node){node.credentials={cloudApiKey:'only-in-test'};const e=new EventEmitter();node.on=e.on.bind(e);node.emit=e.emit.bind(e);node.status=()=>{};},registerType(_,c){C=c;}}});
  n=new C({databasePath:'test.sqlite',cloudSiteId:'123',cloudAuto:false});const database=new DatabaseSync(path.join(dir,'test.sqlite'));
  database.prepare("INSERT INTO hourly_snapshots(interval_start,interval_end,captured_at,energy_status,sample_count,grid_import_kwh,house_consumption_kwh) VALUES (?,?,?,'online',60,1,2)").run('2026-09-01T00:00:00.000Z','2026-09-01T01:00:00.000Z','2026-09-01T01:00:00.000Z');
  database.prepare("INSERT INTO hourly_snapshots(interval_start,interval_end,captured_at,energy_status,sample_count,grid_import_kwh,house_consumption_kwh) VALUES (?,?,?,'offline',1,0.1,0.2)").run('2026-09-01T01:00:00.000Z','2026-09-01T02:00:00.000Z','2026-09-01T02:00:00.000Z');
  database.prepare("INSERT INTO tariff_slots VALUES (?,?,'test',200,20,?,'{}')").run('2026-09-01T00:00:00.000Z','2026-09-01T02:00:00.000Z','2026-09-01T00:00:00.000Z');
  database.prepare("UPDATE hourly_snapshots SET energy_cost_eur=0.2, market_price_ct_kwh=20 WHERE energy_status='online'").run();
  const before=database.prepare('SELECT * FROM hourly_snapshots ORDER BY interval_start').all();
  const deliver=payload=>new Promise((resolve,reject)=>{let result;n.emit('input',{topic:'history/dashboard',socketid:'private-client',payload},msg=>result=msg,error=>error?reject(error):resolve(result));});
  const range={from:'2026-09-01T02:00',to:'2026-09-01T04:00'};
  let r=await deliver({...range,action:'range',requestId:1});assert.equal(r.payload.metrics.grid.kwh,4);assert.equal(r.payload.metrics.grid.costEur,.8);assert.equal(r.payload.metrics.grid.sources.localKwh,1);assert.equal(r.payload.metrics.grid.sources.cloudKwh,3);assert.equal(r.socketid,'private-client');assert.equal(calls,2);
  r=await deliver({...range,action:'solar-compare',requestId:2});assert.equal(r.topic,'history/solar/result');assert.equal(r.payload.summary.grid.pairedHours,1);assert.equal(r.payload.summary.grid.pairedCloudKwh,1.1);assert.equal(r.payload.summary.grid.filledHours,1);
  assert.equal(r.payload.costComparison.grid.local.costEur,.2);assert.ok(Math.abs(r.payload.costComparison.grid.cloud.costEur-.22)<1e-12);assert.equal(calls,2);
  assert.deepEqual(database.prepare('SELECT * FROM hourly_snapshots ORDER BY interval_start').all(),before);assert.ok(!JSON.stringify(r).includes('only-in-test'));
  r=await deliver({action:'solar-status',requestId:3});assert.equal(r.payload.cloud.configured,true);assert.equal(r.payload.cloud.auto,false);
  r=await deliver({period:'day',anchor:'2026-09-01T12:00:00Z'});assert.equal(r.payload.totals.gridImportKWh,4);assert.equal(r.payload.totals.houseConsumptionKWh,6);assert.equal(r.payload.totals.gridImportCostEur,.8);assert.equal(r.payload.rows.flatMap(r=>r.hours).filter(h=>h.cloudSupplemented).length,1);
  database.close();
 }finally{globalThis.fetch=originalFetch;n?.emit('close',()=>{});fs.rmSync(dir,{recursive:true,force:true});}
});
test('SolarEdge-Vergleich ist über Menü und Router verdrahtet; API-Schlüssel bleibt Credential',()=>{
 const nodes=JSON.parse(fs.readFileSync('flows.json','utf8')),by=new Map(nodes.map(n=>[n.id,n]));
 const tab=by.get('solaredge_compare_tab');assert.equal(tab.name,'SolarEdge Vergleich');
 assert.ok(by.get('kosten_history_result_in').wires[0].includes('solaredge_compare_ui'));
 assert.deepEqual(by.get('solaredge_compare_ui').wires,[['kosten_dashboard_request_router']]);
 const router=by.get('datenbank_result_router'),index=router.rules.findIndex(r=>r.v==='history/solar/result');assert.ok(index>=0);assert.deepEqual(router.wires[index],['datenbank_dashboard_out']);
 assert.equal(by.get('datenbank_history_store').cloudApiKey,undefined);
 assert.ok(fs.readFileSync('tools/install-storage-nodes.mjs','utf8').includes('"solaredge-cloud.cjs"'));
});
