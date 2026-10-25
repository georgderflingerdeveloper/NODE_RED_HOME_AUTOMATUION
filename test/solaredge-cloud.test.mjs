import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const {cloudHour,normalizeEnergy,effectiveRows,compareSources,createCloudStore}=createRequire(import.meta.url)('../nodes/solaredge-cloud.cjs');
const {calculateRange}=createRequire(import.meta.url)('../nodes/energy-range.cjs');
const H=3600000,from=Date.parse('2026-09-01T00:00:00Z');
const local=(offset=0,value=2)=>({interval_start:new Date(from+offset*H).toISOString(),interval_end:new Date(from+(offset+1)*H).toISOString(),energy_status:'online',sample_count:60,house_consumption_kwh:value*2,grid_import_kwh:value,pv_energy_kwh:0,grid_export_kwh:0});
const payload=meters=>({energyDetails:{timeUnit:'HOUR',unit:'Wh',meters}});
function db(){const d=new DatabaseSync(':memory:');d.exec(fs.readFileSync('nodes/home-automation-history.schema.sql','utf8'));return d;}

test('Cloud: Wh nach kWh, Nullwerte, fehlende Werte, vollständige Stunden und ungültige Einheiten',()=>{
 const r=normalizeEnergy(payload([{type:'Purchased',values:[{date:'2026-09-01 02:00:00',value:1200},{date:'2026-09-01 03:00:00',value:0},{date:'2026-09-01 04:00:00',value:null},{date:'2026-09-01 05:00:00',value:-5}]}]),{from,to:from+6*H,now:from+2*H});
 assert.deepEqual(r.rows,[{start:from,end:from+H,metric:'grid',kwh:1.2},{start:from+H,end:from+2*H,metric:'grid',kwh:0}]);
 assert.throws(()=>normalizeEnergy({energyDetails:{timeUnit:'DAY',unit:'Wh',meters:[]}},{from,to:from+H}));
 assert.throws(()=>normalizeEnergy({energyDetails:{timeUnit:'HOUR',unit:'kWh',meters:[]}},{from,to:from+H}));
});
test('Cloud: Zeitumstellung wird eindeutig behandelt; doppelte Stunde und Dubletten bleiben Lücken',()=>{
 assert.equal(cloudHour('2026-10-25 02:00:00'),null);assert.equal(cloudHour('2026-03-29 02:00:00'),null);
 assert.equal(cloudHour('2026-10-25 03:00:00'),Date.parse('2026-10-25T02:00:00Z'));
 assert.equal(cloudHour('2026-03-29 03:00:00'),Date.parse('2026-03-29T01:00:00Z'));
 const r=normalizeEnergy(payload([{type:'Purchased',values:[{date:'2026-09-01 02:00:00',value:1200},{date:'2026-09-01 02:00:00',value:1300}]}]),{from,to:from+H});assert.equal(r.rows.length,0);assert.equal(r.skipped,1);
});
test('Cloud-Ergänzung: lokale Originalwerte unverändert, Offline/fehlend ergänzt, je Messgröße getrennt',()=>{
 const rows=[local(),{...local(1),energy_status:'offline'}],before=JSON.stringify(rows);
 const cloud=[{start:from,end:from+H,metric:'grid',kwh:99},{start:from+H,end:from+2*H,metric:'grid',kwh:3},{start:from+2*H,end:from+3*H,metric:'grid',kwh:0}];
 const merged=effectiveRows(rows,cloud);assert.equal(JSON.stringify(rows),before);
 assert.equal(merged[0].grid_import_kwh,2);assert.equal(merged[0].source_by_metric.grid,'local');assert.equal(merged[1].grid_import_kwh,3);assert.equal(merged[1].source_by_metric.grid,'cloud');assert.equal(merged[1].source_by_metric.house,'missing');assert.equal(merged[2].grid_import_kwh,0);
 const tariffs=[{valid_from:new Date(from).toISOString(),valid_until:new Date(from+3*H).toISOString(),price_ct_kwh:20}];
 const r=calculateRange(merged,tariffs,{from,to:from+3*H});assert.equal(r.metrics.grid.kwh,5);assert.equal(r.metrics.grid.costEur,1);assert.equal(r.metrics.grid.sources.localKwh,2);assert.equal(r.metrics.grid.sources.cloudKwh,3);assert.equal(r.metrics.house.kwh,4);assert.ok(Math.abs(r.metrics.house.coveragePercent-100/3)<1e-10);
});
test('Bekannte lokale Messlücke erhält vollständige Cloud-Stunde; unbekannte Altdaten bleiben lokal',()=>{
 const row=local(),cloud=[{start:from,end:from+H,metric:'grid',kwh:3}];
 assert.equal(effectiveRows([row],cloud,new Map([[row.interval_start,H/2]]))[0].grid_import_kwh,3);
 assert.equal(effectiveRows([row],cloud)[0].grid_import_kwh,2);
 assert.equal(effectiveRows([row],cloud,new Map([[row.interval_start,H*.99]]))[0].grid_import_kwh,2);
});
test('Vergleich: nur gleiche gültige Stunden, Nullbasis ohne Prozent, Teilstunden ausgeschlossen',()=>{
 const rows=[local(),{...local(1),sample_count:1}],cloud=[{start:from,end:from+H,metric:'grid',kwh:2.01},{start:from+H,end:from+2*H,metric:'grid',kwh:4},{start:from,end:from+H,metric:'pv',kwh:0}];
 const r=compareSources(rows,cloud,{from,to:from+2*H});
 assert.equal(r.summary.grid.pairedHours,1);assert.equal(r.summary.grid.cloudKwh,6.01);assert.equal(r.summary.grid.localKwh,2);assert.equal(r.summary.grid.filledHours,1);assert.equal(r.summary.grid.withinTolerance,true);assert.equal(r.summary.pv.differencePercent,null);assert.equal(r.intervals[1].metrics.grid.differenceKwh,null);
 assert.equal(compareSources(rows,cloud,{from:from+H/2,to:from+2*H}).intervals.length,1);
});
test('API: Server-Abfrage, Cache, Idempotenz, Quellenisolation, keine Zugangsdaten in Status',async()=>{
 const database=db(),calls=[],now=()=>Date.parse('2026-09-04T00:00:00Z');
 const fetchImpl=async url=>{calls.push(new URL(url));return {ok:true,json:async()=>url.pathname.endsWith('/details')?{details:{location:{timeZone:'Europe/Vienna'}}}:payload([{type:'Purchased',values:[{date:'2026-09-01 02:00:00',value:1200}]}])};};
 const store=createCloudStore(database,{siteId:'123',apiKey:'test-only-secret',fetchImpl,now});
 await store.sync(from,from+24*H);assert.equal(calls.length,2);assert.equal(calls[1].searchParams.get('timeUnit'),'HOUR');assert.equal(calls[1].searchParams.get('startTime'),'2026-09-01 02:00:00');assert.equal(store.rows(from,from+H)[0].kwh,1.2);
 await store.sync(from,from+24*H);assert.equal(calls.length,2);assert.equal(database.prepare('SELECT count(*) n FROM solaredge_cloud_energy').get().n,1);
 assert.ok(!JSON.stringify(store.status()).includes('test-only-secret'));assert.equal(createCloudStore(database,{siteId:'456'}).rows(from,from+H).length,0);
 store.close();database.close();
});
test('API: Fehlertexte ohne Schlüssel/Antwortinhalt, Cooldown, falsche Zeitzone und kein Zugang',async()=>{
 for(const mode of ['network','auth','timezone','unit']){const database=db();let calls=0;
  const store=createCloudStore(database,{siteId:'123',apiKey:'hidden-api-key',now:()=>from+72*H,fetchImpl:async url=>{calls++;if(mode==='network')throw Error(String(url));if(mode==='auth')return {ok:false,status:403,json:async()=>({error:'hidden-api-key'})};return {ok:true,json:async()=>url.pathname.endsWith('/details')?{details:{location:{timeZone:mode==='timezone'?'UTC':'Europe/Vienna'}}}:{energyDetails:{unit:'W',timeUnit:'HOUR',meters:[]}}};}});
  await store.sync(from,from+H);assert.match(store.status().error,/SolarEdge:/);assert.ok(!JSON.stringify(store.status()).includes('hidden-api-key'));const count=calls;await store.sync(from,from+H);assert.equal(calls,count);assert.equal(store.rows(from,from+H).length,0);store.close();database.close();
 }
 const database=db();let called=false;const store=createCloudStore(database,{fetchImpl:()=>{called=true;}});await store.sync(from,from+H);assert.equal(called,false);assert.equal(store.status().configured,false);store.close();database.close();
});
test('API: lange Zeiträume in <=28-Tage-Pakete aufgeteilt und Abruf serialisiert',async()=>{
 const database=db(),calls=[];let active=0,max=0;
 const store=createCloudStore(database,{siteId:'123',apiKey:'test',now:()=>from+100*24*H,fetchImpl:async url=>{active++;max=Math.max(max,active);calls.push(new URL(url));await new Promise(r=>setTimeout(r,2));active--;return {ok:true,json:async()=>url.pathname.endsWith('/details')?{details:{location:{timeZone:'Europe/Vienna'}}}:payload([])};}});
 await Promise.all([store.sync(from,from+60*24*H),store.sync(from,from+60*24*H)]);assert.equal(calls.length,4);assert.equal(max,1);store.close();database.close();
});
test('API: Beenden bricht laufenden Abruf ab; Tageslimit bleibt über Neustart erhalten',async()=>{
 const database=db();let start;const started=new Promise(r=>start=r);
 const store=createCloudStore(database,{siteId:'123',apiKey:'test',fetchImpl:(_url,{signal})=>new Promise((resolve,reject)=>{start();signal.addEventListener('abort',()=>reject(Error('aborted')));})});
 const pending=store.sync(from,from+H);await started;store.close();database.close();await pending;
 const d=db(),day=new Date(from+100*H).toISOString().slice(0,10);
 d.prepare('INSERT INTO solaredge_cloud_state VALUES (?,?,?)').run('123','usage',JSON.stringify({day,count:250}));let called=false;
 const limited=createCloudStore(d,{siteId:'123',apiKey:'test',now:()=>from+100*H,fetchImpl:()=>{called=true;}});await limited.sync(from,from+H);assert.equal(called,false);assert.match(limited.status().error,/Tageslimit/);limited.close();d.close();
});
