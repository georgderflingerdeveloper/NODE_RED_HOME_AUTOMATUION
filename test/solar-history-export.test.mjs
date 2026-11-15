import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
const require=createRequire(import.meta.url);
const {exportRequest,csvCell,streamExport}=require('../nodes/solar-history-export.cjs');
test('CSV begrenzt UTC-Datumsbereich inklusiv und lehnt SQL/ungültige Daten ab',()=>{
 assert.equal(exportRequest({from:'2026-10-25',to:'2026-10-25'}).to,'2026-10-26T00:00:00.000Z');
 for(const query of [{dataset:'sqlite_master'},{from:'2026-02-30'},{from:'2026-02-02',to:'2026-01-01'},{from:['2026-01-01']}])assert.throws(()=>exportRequest(query));
 assert.equal(csvCell('=1+2'),`"'=1+2"`);assert.equal(csvCell(-2),'"-2"');assert.equal(csvCell('a;"b'),'"a;""b"');assert.equal(csvCell(null),'');
});
test('CSV exportiert Daten inklusiv Endtag ohne andere Datensätze; leere Auswahl mit Kopfzeile',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'solar-export-')),file=join(dir,'db.sqlite');let db=new DatabaseSync(file);
 db.exec(readFileSync('nodes/home-automation-history.schema.sql','utf8'));
 db.prepare('INSERT INTO solar_power_samples VALUES(?,?,?,?,?,?,?,?)').run('2026-10-25T23:59:59.000Z','2026-10-25T23:59:59.000Z',1,100,150,50,0,'{}');db.close();
 class Response extends EventEmitter{chunks=[];set(){}write(text){this.chunks.push(text);return true;}end(){}status(code){this.code=code;return this;}json(data){this.data=data;}}
 try{const response=new Response();await streamExport(file,{query:{dataset:'power',from:'2026-10-25',to:'2026-10-25'}},response);assert.ok(response.chunks.join('').includes('"100"'));const empty=new Response();await streamExport(file,{query:{dataset:'power',from:'2026-10-26'}},empty);assert.equal(empty.chunks.length,1);}finally{rmSync(dir,{recursive:true,force:true});}
});
test('Minutenstichproben, Statuswechsel, Geheimnisfilter und Historie nach Neustart',()=>{
 const dir=mkdtempSync(join(tmpdir(),'solar-power-'));let Constructor;
 const RED={settings:{userDir:dir},nodes:{registerType(_name,C){Constructor=C;},createNode(node){const events=new EventEmitter();node.on=events.on.bind(events);node.emit=events.emit.bind(events);node.status=()=>{};}}};
 require('../nodes/home-automation-history.js')(RED);let node=new Constructor({databasePath:'data.sqlite',cloudAuto:false});
 const send=(seconds,online=true)=>{let failure;node.emit('input',{topic:'history/source/energy',payload:{timestamp:Date.parse('2026-11-15T10:00:00Z')+seconds*1000,OnlineFlag:online,PvPowerWatt:100,HouseConsumptionWatt:200,GridImportWatt:100,FeedInWatt:0,apiKey:'must-not-store'}},()=>{},e=>failure=e);if(failure)throw failure;};
 try{send(0);send(1);send(60);send(61,false);send(62);node.emit('close');let db=new DatabaseSync(join(dir,'data.sqlite'));let rows=db.prepare('SELECT * FROM solar_power_samples ORDER BY observed_at').all();assert.equal(rows.length,4);assert.equal(rows[2].online,0);assert.equal(rows[2].pv_power_w,null);assert.ok(!rows[0].raw_json.includes('must-not-store'));db.close();node=new Constructor({databasePath:'data.sqlite',cloudAuto:false});node.emit('close');db=new DatabaseSync(join(dir,'data.sqlite'));assert.equal(db.prepare('SELECT COUNT(*) AS n FROM solar_power_samples').get().n,4);db.close();}finally{rmSync(dir,{recursive:true,force:true});}
});
