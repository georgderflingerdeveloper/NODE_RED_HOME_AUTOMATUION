import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
const {createHistory,definition}=createRequire(import.meta.url)('../nodes/homematic-ip-history.cjs');
const start=Date.parse('2026-10-20T00:00:00Z'),M=60000;
const row=(points,quality='current')=>({id:'d1',name:'Wohnzimmer',rooms:'EG',quality,reachable:true,lowBattery:false,points});
function setup(run,options={}){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hmip-history-'));let history;try{history=createHistory(path.join(dir,'history.sqlite'),{now:()=>start+2*86400000,...options});return run(history,path.join(dir,'history.sqlite'));}finally{history?.close();fs.rmSync(dir,{recursive:true,force:true});}}
test('Historie: Einheiten, Skalierung, Zustände und Geheimnisse',()=>{
 assert.deepEqual(definition({name:'1.valvePosition',value:.5}),{label:'Ventilöffnung · 1.valvePosition',unit:'%',kind:'number',scale:100});
 assert.equal(definition({name:'secret.token',value:5}),null);assert.equal(definition({name:'1.index',value:1}),null);assert.equal(definition({name:'1.label',value:'Gerät'}),null);assert.equal(definition({name:'2.futureSensor',value:0,unit:'x'}).kind,'number');
 setup(h=>{h.record([row([{name:'1.actualTemperature',value:0},{name:'1.valvePosition',value:.35},{name:'1.on',value:false},{name:'1.windowState',value:'CLOSED'},{name:'authToken',value:123}])],start);
  const c=h.catalog();assert.equal(c.series.find(s=>s.point==='1.actualTemperature').latestValue,0);assert.equal(c.series.find(s=>s.point==='1.valvePosition').latestValue,35);assert.equal(c.series.find(s=>s.point==='1.on').latestValue,0);assert.equal(c.series.find(s=>s.point==='1.windowState').states[0],'CLOSED');assert.ok(!JSON.stringify(c).includes('authToken'));
 });
});
test('Historie: echte Abfragen, explizite Lücken bei Fehler/Offline/verschwundenem Datenpunkt',()=>setup(h=>{
 const points=[{name:'1.actualTemperature',value:20},{name:'1.setPointTemperature',value:22}];h.record([row(points)],start);h.record([row(points,'offline')],start+M);h.record([],start+2*M,false);h.record([row([{name:'1.actualTemperature',value:21}])],start+3*M);
 const catalog=h.catalog(),actual=catalog.series.find(s=>s.point==='1.actualTemperature'),set=catalog.series.find(s=>s.point==='1.setPointTemperature');
 const r=h.query({seriesIds:[actual.id,set.id],from:start,to:start+4*M});assert.equal(r.series[0].points.length,4);assert.deepEqual(r.series[0].points.map(p=>p.value),[20,null,null,21]);assert.equal(r.series[1].points.at(-1).value,null);assert.equal(r.series[0].stats.count,2);assert.equal(r.series[0].stats.min,20);assert.equal(r.series[0].stats.max,21);
}));
test('Historie: Daten bleiben über Neustart erhalten; wiederholter Zeitpunkt ist idempotent',()=>setup((h,file)=>{
 h.record([row([{name:'1.actualTemperature',value:20}])],start);h.record([row([{name:'1.actualTemperature',value:21}])],start);h.close();const next=createHistory(file,{now:()=>start+2*M});try{const s=next.catalog().series.find(s=>s.kind==='temperature');const r=next.query({seriesIds:[s.id],from:start,to:start+M});assert.equal(r.series[0].points.length,1);assert.equal(r.series[0].points[0].value,21);}finally{next.close();}
}));
test('Historie: lange Verläufe begrenzt, Extrema und Erfassungslücken bleiben erhalten',()=>setup(h=>{
 for(let i=0;i<1800;i++)h.record([row([{name:'1.actualTemperature',value:i===777?-12:i===1001?45:20}])],start+i*M,i!==900);
 const id=h.catalog().series.find(s=>s.kind==='temperature').id,r=h.query({seriesIds:[id],from:start,to:start+1800*M}),points=r.series[0].points;
 assert.ok(points.length<=1600);assert.ok(points.some(p=>p.value===-12));assert.ok(points.some(p=>p.value===45));assert.ok(points.some(p=>p.value===null));assert.ok(points.some(p=>p.breakBefore));
 const zoom=h.query({seriesIds:[id],from:start+770*M,to:start+780*M});assert.equal(zoom.series[0].points.length,10);assert.ok(zoom.bucketMs<r.bucketMs);
}));
test('Historie: ungültige Bereiche, unbekannte Trends und gemischte Einheiten abgewiesen',()=>setup(h=>{
 h.record([row([{name:'1.actualTemperature',value:20},{name:'1.humidity',value:50},{name:'1.windowState',value:'CLOSED'},{name:'1.doorState',value:'OPEN'}])],start);const c=h.catalog().series,temp=c.find(s=>s.kind==='temperature'),humidity=c.find(s=>s.unit==='%'),states=c.filter(s=>s.kind==='state');
 for(const request of [{seriesIds:[]},{seriesIds:['missing']},{seriesIds:[temp.id,temp.id]},{seriesIds:[temp.id,humidity.id]},{seriesIds:states.map(s=>s.id)}])assert.throws(()=>h.query({...request,from:start,to:start+M}));
 assert.throws(()=>h.query({seriesIds:[temp.id],from:start,to:start-1}));assert.throws(()=>h.query({seriesIds:[temp.id],from:start,to:start+367*86400000}));assert.throws(()=>h.query({seriesIds:[temp.id],mode:'live',hours:999}));
 const live=h.query({seriesIds:[temp.id],mode:'live',hours:24});assert.equal(live.to,start+2*86400000);assert.equal(live.to-live.from,86400000);
 assert.throws(()=>h.query({seriesIds:[temp.id],from:'2026-10-25T02:30',to:'2026-10-25T04:00'}),/doppeldeutig/);
}));
test('Historie: Aufbewahrung löscht abgelaufene Messungen, nicht den Trendkatalog',()=>setup(h=>{
 h.record([row([{name:'1.actualTemperature',value:20}])],start);h.record([row([{name:'1.actualTemperature',value:22}])],start+3*86400000);const s=h.catalog().series.find(s=>s.kind==='temperature');assert.equal(s.firstAt,start+3*86400000);
},{retentionDays:1,now:()=>start+4*86400000}));
