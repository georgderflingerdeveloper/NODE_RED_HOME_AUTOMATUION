import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const core=require('../nodes/phidget-discovery-core.cjs');
const servers='Phidget22 Server   hub5000                        hub5000:5661             192.168.0.200\nPhidget22 Server   pientry                        pientry:5661             192.168.0.190';
const devices=` hub5000 - (597039) 6-Port Network VINT Hub Phidget v106
 (597039//0) VINT Hub
 (597039/5) Hub Port - Digital Output Mode v100
 (597039/5/0) Digital Output
 (597039/5) 16x Isolated Solid State Relay Phidget v212
 (597039/5/0) Digital Output Isolated Frequency Control
 (597039/5/8) Digital Output Isolated
 (597039/2) Humidity Phidget v105
 (597039/2/0) Humidity Sensor
 (597039/2/0) Temperature Sensor
 (597039/0) 4x Isolated Digital Input Phidget v103
 (597039/0/0) Digital Input Isolated
 hub5000 - (2) Dictionary v100 [Phidget22 Control]
 (2//0) Dictionary
 pientry - (311883) PhidgetInterfaceKit 0/16/16 v605
 (311883//0) Digital Input
 (311883//0) Digital Output
`;
test('Georgs Topologie: ein Hub, drei Module und InterfaceKit; Fähigkeiten und Dictionaries zählen nicht als Hardware',()=>{
 const r=core.parseInventory(servers,devices);assert.equal(r.servers.length,2);assert.equal(r.devices.length,5);
 const hub=r.devices.find(d=>d.hub);assert.equal(hub.serial,'597039');assert.equal(hub.capabilities.length,1);assert.equal(hub.channels.length,1);
 const humidity=r.devices.find(d=>d.port===2);assert.equal(humidity.channels.length,2);assert.notEqual(humidity.channels[0].type,humidity.channels[1].type);
});
test('Doppelte Meldung desselben Hubs wird zusammengeführt',()=>{
 const r=core.parseInventory(servers,devices+'\n other - (597039) 6-Port Network VINT Hub Phidget v106\n (597039//0) VINT Hub');
 assert.equal(r.devices.filter(d=>d.hub).length,1);assert.deepEqual(r.devices[0].servers,['hub5000','other']);
});
test('Verschwinden, Wiederkehr und Fehler erhalten das bekannte Inventar',()=>{
 const a=core.mergeInventory({},core.parseInventory(servers,devices),100);
 const b=core.mergeInventory(a,{servers:[],devices:[]},200);assert.ok(b.devices.every(d=>d.state==='offline'));assert.equal(b.devices[0].lastSeen,100);
 const c=core.unknownInventory(a);assert.ok(c.devices.every(d=>d.state==='unknown'));assert.equal(c.lastSuccess,100);
 const d=core.mergeInventory(b,core.parseInventory(servers,devices),300);assert.ok(d.devices.every(d=>d.state==='online'));assert.equal(d.devices[0].firstSeen,100);
 assert.throws(()=>core.parseInventory('', 'not a device format'),/Format|format/);
});
function harness(dir,fail=false){
 const messages=[],handlers={},calls=[];let Constructor;
 const RED={settings:{userDir:dir},nodes:{registerType(_,C){Constructor=C;},createNode(n){n.id='test';n.on=(k,v)=>handlers[k]=v;n.send=m=>messages.push(JSON.parse(JSON.stringify(m)));n.status=()=>{};}}};
 const sandbox={module:{exports:{}},process,Date,console,setTimeout:()=>1,clearTimeout(){},setInterval:()=>2,clearInterval(){},
 require(name){if(name==='node:child_process')return {execFile(bin,args,opt,cb){calls.push({bin,args});queueMicrotask(()=>{
 if(bin==='systemctl')cb(null,'active\n','');
 else if(fail){const e=Error('missing');e.code='ENOENT';cb(e,'','');}
 else cb(null,args.includes('-s')?servers:devices,'');});return {kill(){}};}};
 return require(name==='./phidget-discovery-core.cjs'?'../nodes/phidget-discovery-core.cjs':name);}};
 vm.runInNewContext(fs.readFileSync('nodes/home-automation-phidget-discovery.js','utf8'),sandbox);
 sandbox.module.exports(RED);new Constructor({interval:60});
 return {messages,calls,input:handlers.input,close:handlers.close};
}
test('Node führt nur Listenbefehle aus, verhindert parallele Scans und persistiert über Neustart',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'phidget-test-'));
 try{
 const h=harness(dir);h.input({topic:'phidgets/scan'});h.input({topic:'phidgets/scan'});
 await new Promise(r=>setImmediate(r));
 assert.equal(h.calls.filter(c=>c.bin==='phidget22admin').length,2);
 assert.deepEqual(h.calls.filter(c=>c.bin==='phidget22admin').map(c=>Array.from(c.args)),[['-s','-w','5'],['-R','-d','-w','5']]);
 assert.equal(h.messages.at(-1).payload.inventory.devices.length,5);
 const restarted=harness(dir);restarted.input({topic:'phidgets/get'});
 assert.equal(restarted.messages.at(-1).payload.inventory.devices.length,5);
 assert.equal(restarted.messages.at(-1).payload.inventory.rawScan.devices,devices);
 assert.equal(restarted.messages.at(-1).payload.inventory.rawScan.servers,servers);
 assert.equal(restarted.messages.at(-1).payload.inventory.devices.find(d=>d.hub).serial,'597039');
 assert.ok(restarted.messages.at(-1).payload.inventory.devices.every(d=>d.state==='unknown'));
 h.close();restarted.close();
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Fehlendes Scanprogramm liefert verständlichen Dashboardfehler',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'phidget-test-'));try{
 const h=harness(dir,true);h.input({topic:'phidgets/scan'});await new Promise(r=>setImmediate(r));
 const health=h.messages.at(-1).payload.health;assert.equal(health.state,'error');assert.match(health.error,/phidget22admin fehlt/);h.close();
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Dashboard und IP-Scanner sind über Links an den Erkennungsflow angeschlossen',()=>{
 const flows=JSON.parse(fs.readFileSync('flows.json'));const get=id=>flows.find(n=>n.id===id);
 assert.ok(get('system_scan_result').wires[0].includes('ph_discovery_network_out'));
 assert.ok(get('ph_discovery_network_out').links.includes('ph_discovery_request_in'));
 assert.ok(get('ph_discovery_result_in').wires[0].includes('phidget_dashboard_template'));
 assert.ok(get('phidget_dashboard_template').format.includes('phidgets/scan'));
});
