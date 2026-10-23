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
