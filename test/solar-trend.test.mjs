import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
const require=createRequire(import.meta.url);
const {trendRequest,readTrend}=require('../nodes/solar-trend.cjs');
const {streamExport}=require('../nodes/solar-history-export.cjs');
const range={start:'2026-11-15T00:00:00Z',end:'2026-11-16T00:00:00Z'};
function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'solar-trend-')),file=join(dir,'history.sqlite'),db=new DatabaseSync(file);
 db.exec(readFileSync('nodes/home-automation-history.schema.sql','utf8'));
 const insert=db.prepare('INSERT INTO solar_power_samples VALUES(?,?,?,?,?,?,?,?)');
 for(const [time,online,power] of [['10:00',1,10],['10:01',1,9000],['10:02',0,99999],['10:03',1,0],['10:15',1,40],['10:16',1,null]]){
  const stamp=`2026-11-15T${time}:00.000Z`;insert.run(stamp,stamp,online,power,20,10,0,'{}');
 }
 db.close();t.after(()=>rmSync(dir,{recursive:true,force:true}));return file;
}
test('Trend validiert Zeitbereich, Spalten und Status ohne SQL-Interpolation von Eingaben',()=>{
 for(const query of [{start:'2026-02-30T00:00:00Z'},{end:range.start},{mode:'invalid'},{metrics:'pv,sqlite_master'},{metrics:''},{metrics:['pv']},{status:'anything'},{start:'2020-01-01T00:00:00Z'},{start:'2026-11-15T00:00:00'}])assert.throws(()=>trendRequest({...range,...query}));
 assert.deepEqual(trendRequest({...range,metrics:'pv,pv'}).metrics,['pv']);
});
test('Trend behält Spitzen, reale Null und exakte Statistik; Offline und Messlücken werden markiert',t=>{
 const result=readTrend(fixture(t),{...range,metrics:'pv'}),series=result.series[0];
 assert.equal(result.counts.total,6);assert.equal(result.counts.offline,1);
 assert.equal(series.stats.count,4);assert.equal(series.stats.min,0);assert.equal(series.stats.max,9000);assert.equal(series.stats.average,2262.5);
 assert.equal(series.stats.maxAt,'2026-11-15T10:01:00.000Z');
 assert.equal(Math.max(...series.points.map(p=>p.high ?? 0)),9000);
 assert.ok(series.points.some(p=>p.valid<p.samples));assert.ok(series.points.some(p=>p.gap===1));
 assert.ok(series.points.length<=601);
});
test('Statusfilter und leere Bereiche erfinden keine Messwerte',t=>{
 const file=fixture(t);
 const offline=readTrend(file,{...range,status:'offline',metrics:'pv'});assert.equal(offline.counts.total,1);assert.equal(offline.series[0].stats.count,0);assert.equal(offline.series[0].stats.max,null);
 const online=readTrend(file,{...range,status:'online',metrics:'pv'});assert.equal(online.counts.total,5);assert.equal(online.series[0].stats.max,9000);assert.ok(online.series[0].points.some(p=>p.gap===1),'Online-Filter muss ausgeblendete Offline-Lücke erhalten');
 const empty=readTrend(file,{...range,start:'2026-11-15T23:00:00Z'});assert.equal(empty.counts.total,0);assert.deepEqual(empty.series[0].points,[]);
});
test('Trend-CSV nutzt exakten Zeitraum, Status und ausgewählte Spalten; keine Verdichtung',async t=>{
 class Response extends EventEmitter{chunks=[];set(){}write(value){this.chunks.push(value);return true;}end(){}status(code){this.code=code;return this;}json(data){this.data=data;}}
 const file=fixture(t),response=new Response();
 await streamExport(file,{query:{dataset:'trend',...range,start:'2026-11-15T10:01:00Z',end:'2026-11-15T10:15:00Z',metrics:'pv,import',status:'online'}},response);
 const csv=response.chunks.join('');assert.equal(response.chunks.length,3);assert.ok(csv.includes('"9000"'));assert.ok(csv.includes('"0"'));assert.ok(!csv.includes('house_consumption_w'));assert.ok(!csv.includes('raw_json'));assert.ok(!csv.includes('99999'));assert.ok(!csv.includes('10:15:00'));
 const invalid=new Response();await streamExport(file,{query:{dataset:'trend',...range,metrics:'pv;DROP TABLE'}},invalid);assert.equal(invalid.code,400);
});
test('Stundenenergie verwendet kWh und kennzeichnet Stundenmengen statt Leistungsspitzen',t=>{
 const file=fixture(t),db=new DatabaseSync(file);
 db.prepare("INSERT INTO hourly_snapshots(interval_start,interval_end,captured_at,energy_status,pv_energy_kwh,house_consumption_kwh,grid_import_kwh,grid_export_kwh) VALUES(?,?,?,?,?,?,?,?)").run('2026-11-15T10:00:00.000Z','2026-11-15T11:00:00.000Z','2026-11-15T11:00:00.000Z','online',2,3,1,0);db.close();
 const result=readTrend(file,{...range,mode:'energy',metrics:'pv'});assert.equal(result.unit,'kWh');assert.equal(result.series[0].stats.total,2);assert.match(result.note,/keine momentanen Leistungsspitzen/);
});
