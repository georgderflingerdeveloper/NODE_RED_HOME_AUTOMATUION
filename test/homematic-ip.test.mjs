import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const {normalize,mergeRows}=require('../nodes/homematic-ip-core.cjs');
const sample=()=>({connected:true,devices:{dev1:{id:'dev1',label:'Küche',type:'SWITCH',serializedGlobalTradeItemNumber:'TEST-SERIAL',functionalChannels:{0:{functionalChannelType:'DEVICE_BASE',unreach:false,lowBat:false},1:{on:false,dimLevel:0,actualTemperature:20.5}}}},groups:{room:{id:'room',type:'META',label:'Küche',groups:['switch']},switch:{id:'switch',type:'SWITCHING',channels:[{deviceId:'dev1',channelIndex:1}]}}});
test('HAP: Räume über META-Gruppe, SGTIN, Basiskanal und FALSE/0 erhalten',()=>{
 const d=normalize(sample(),123).rows[0];assert.equal(d.rooms,'Küche');assert.equal(d.serial,'TEST-SERIAL');assert.equal(d.reachable,true);assert.equal(d.lowBattery,false);assert.equal(d.lastSeen,123);
 assert.deepEqual(d.points.find(p=>p.name==='1.on'),{name:'1.on',value:false,unit:''});assert.equal(d.points.find(p=>p.name==='1.dimLevel').value,0);assert.equal(d.points.find(p=>p.name==='1.actualTemperature').unit,'°C');
});
test('HAP: unbekannte Datenpunkte, Batterie/Verbindung unbekannt und Geheimnisse',()=>{
 const raw=sample();raw.devices.dev1.functionalChannels={2:{futureValue:12,authToken:'DO-NOT-LEAK',nested:{pin:'123',v:0}}};raw.devices.dev1.secret='secret';const d=normalize(raw).rows[0];
 assert.equal(d.reachable,null);assert.equal(d.lowBattery,null);assert.ok(d.points.some(p=>p.name==='2.futureValue'));assert.ok(!JSON.stringify(d).includes('DO-NOT-LEAK'));assert.ok(!d.points.some(p=>/pin|secret/i.test(p.name)));
});
test('HAP: Offline, HAP offline, verschwundene Geräte und Wiederkehr',()=>{
 const raw=sample();raw.devices.dev1.functionalChannels[0].unreach=true;assert.equal(normalize(raw).rows[0].quality,'offline');raw.connected=false;assert.equal(normalize(raw).rows[0].quality,'stale');
 const old=normalize(sample(),1).rows;const missing=mergeRows(old,[]);assert.equal(missing[0].quality,'missing');assert.equal(missing[0].lastSeen,1);assert.equal(mergeRows(missing,normalize(sample(),2).rows)[0].quality,'current');
 assert.throws(()=>normalize({}));assert.throws(()=>normalize({devices:[]}));
});
function harness(dir){
 const events={},sent=[],timers=[],calls=[];let Type;
 const RED={settings:{userDir:dir},nodes:{createNode(node){node.id='test';node.on=(k,f)=>events[k]=f;node.send=m=>sent.push(structuredClone(m));node.status=()=>{};node.warn=()=>{};},registerType(_name,ctor){Type=ctor;}}};
 const customRequire=id=>id==='node:child_process'?{execFile:(exe,args,options,callback)=>{calls.push({exe,args,options,callback,killed:false});return {kill(){calls.at(-1).killed=true;}};}}:id==='./homematic-ip-core.cjs'?{normalize,mergeRows}:require(id);
 const box={module:{exports:{}},require:customRequire,__dirname:'/runtime/nodes',process:{env:{}},setTimeout:(fn)=>{timers.push(fn);return timers.length;},clearTimeout:()=>{},Date};
 vm.runInNewContext(fs.readFileSync('nodes/home-automation-homematic-ip.js','utf8'),box);box.module.exports(RED);new Type({intervalMs:1});return {events,sent,timers,calls};
}
test('HAP runtime: unkonfiguriert keine Cloud-Anfrage; fremde Befehle werden ignoriert',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hmip-test-'));try{const h=harness(dir);h.timers[0]();assert.equal(h.calls.length,0);assert.equal(h.sent.at(-1).payload.status,'idle');h.events.input({topic:'AllLightsOn'},null,()=>{});assert.equal(h.calls.length,0);h.events.close(false,()=>{});}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('HAP runtime: Snapshot, Neustart veraltet, Rate-Limit auch nach Fehlern, kein Secret im Output',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hmip-test-'));try{
  fs.mkdirSync(path.join(dir,'homematic-ip-runtime/bin'),{recursive:true});fs.writeFileSync(path.join(dir,'homematic-ip-runtime/bin/python'),'');fs.mkdirSync(path.join(dir,'homematic-ip'));fs.writeFileSync(path.join(dir,'homematic-ip/credentials.json'),'secret');
  const h=harness(dir);h.timers[0]();assert.equal(h.calls.length,1);assert.equal(h.calls[0].options.timeout,45000);assert.deepEqual(Array.from(h.calls[0].args),['/runtime/nodes/homematic-ip-bridge.py','snapshot']);
  h.events.input({topic:'homematic-ip/refresh'});assert.equal(h.calls.length,1);
  h.calls[0].callback(null,JSON.stringify(sample()));assert.equal(h.sent.at(-1).payload.status,'running');assert.equal(h.sent.at(-1).payload.intervalMs,60000);
  const saved=JSON.parse(fs.readFileSync(path.join(dir,'homematic-ip/test-snapshot.json')));assert.equal(saved.rows.length,1);
  h.events.input({topic:'homematic-ip/refresh'});assert.equal(h.calls.length,1);
  h.timers.at(-1)();h.calls[1].callback(Error('secret token'),'', 'secret token');assert.equal(h.sent.at(-1).payload.status,'error');assert.equal(h.sent.at(-1).payload.rows[0].quality,'stale');assert.ok(!JSON.stringify(h.sent).includes('secret token'));
  h.events.input({topic:'homematic-ip/refresh'});assert.equal(h.calls.length,2);
  const next=harness(dir);next.events.input({topic:'homematic-ip/get'});assert.equal(next.sent.at(-1).payload.rows[0].quality,'stale');next.events.close(false,()=>{});
  h.timers.at(-1)();h.events.close(false,()=>{});assert.equal(h.calls.at(-1).killed,true);const count=h.sent.length;h.calls.at(-1).callback(null,JSON.stringify(sample()));assert.equal(h.sent.length,count);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('HAP dashboard: Update bewahrt Suchtext und offene Details; Link-Schnittstellen ohne Geräteaktionen',()=>{
 const html=fs.readFileSync('flow-src/flows/homematic-ip--hmip_flow/templates/homematic-ip-dashboard.html','utf8');let watch;const sent=[];const scope={$watch:(_key,fn)=>watch=fn,send:m=>sent.push(m)};vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],{scope});scope.query='Küche';scope.expanded.dev1=true;
 watch({topic:'homematic-ip/state',payload:{rows:normalize(sample()).rows}});assert.equal(scope.query,'Küche');assert.equal(scope.expanded.dev1,true);assert.equal(scope.display(0),0);assert.equal(scope.display(false),'FALSE');assert.equal(sent[0].topic,'homematic-ip/get');
 const nodes=JSON.parse(fs.readFileSync('flows.json'));assert.equal(nodes.find(n=>n.id==='hmip_ui').fwdInMessages,false);assert.deepEqual(nodes.find(n=>n.id==='hmip_link_out').links,[]);
});
test('Python bridge: Sanitizing, atomic private credentials and mocked SDK contract',()=>{execFileSync('python3',['-m','unittest','discover','-s','test/homematic','-p','test_*.py'],{stdio:'pipe'});});
test('HAP dashboard: Messwerte, Mehrkanäle, Nullwerte, Warnungen und Filter',()=>{
 const html=fs.readFileSync('flow-src/flows/homematic-ip--hmip_flow/templates/homematic-ip-dashboard.html','utf8');
 const watches={};const scope={$watch:(key,fn)=>watches[key]=fn,send:()=>{}};
 vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],{scope});
 const raw=sample();Object.assign(raw.devices.dev1.functionalChannels[1],{setPointTemperature:22,humidity:0,valvePosition:0.35,windowState:'CLOSED'});
 raw.devices.dev1.functionalChannels[2]={actualTemperature:0,on:true};
 const rows=normalize(raw).rows;
 watches.msg({topic:'homematic-ip/state',payload:{rows:[...rows,{...rows[0],id:'warn',rooms:'Bad',lowBattery:true,quality:'stale'}]}});
 const metrics=scope.state.rows[0].metrics;
 assert.equal(metrics.find(m=>m.name==='1.setPointTemperature').text,'22');
 assert.equal(metrics.find(m=>m.name==='1.valvePosition').text,'35');
 assert.equal(metrics.find(m=>m.name==='1.humidity').text,'0');
 assert.equal(metrics.find(m=>m.name==='2.actualTemperature').text,'0');
 assert.equal(metrics.find(m=>m.name==='1.actualTemperature').channel,'1');
 assert.equal(metrics.find(m=>m.name==='2.actualTemperature').channel,'2');
 assert.equal(metrics.find(m=>m.name==='1.on').text,'Aus');
 assert.equal(metrics.find(m=>m.name==='1.windowState').text,'Geschlossen');
 assert.equal(scope.summary.battery,1);assert.equal(scope.summary.stale,1);assert.equal(scope.summary.current,1);
 scope.warningsOnly=true;watches.warningsOnly();assert.equal(scope.visibleRows.length,1);assert.equal(scope.visibleRows[0].id,'warn');
 scope.room='Küche';watches.room();assert.equal(scope.visibleRows.length,0);
 scope.warningsOnly=false;scope.query='test-serial';watches.query();assert.equal(scope.visibleRows.length,1);
 watches.msg({topic:'homematic-ip/state'});assert.equal(scope.state.rows.length,2);
});
