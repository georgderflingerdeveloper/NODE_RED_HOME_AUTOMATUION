import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const {describe,readValue,Monitor}=require('../nodes/phidget-io-core.cjs');
const inventory={servers:[{name:'hub',ip:'192.168.0.200',endpoint:'hub:5661',state:'online'}],devices:[{serial:'597039',port:2,name:'Humidity',server:'hub',state:'online',channels:[{index:0,type:'Humidity Sensor'},{index:0,type:'Temperature Sensor'}]},{serial:'597039',port:5,name:'Relay',server:'hub',state:'online',channels:[{index:15,type:'Digital Output Isolated'}]}]};
function sdk(){
 const instances=[];let connected=true,fail=false;
 class NetworkConnection{constructor(port,host,opts){this.name=opts.name;this.connected=true;this.port=port;}async connect(){}close(){this.connected=false;}delete(){}}
 class Channel{constructor(){instances.push(this);this.attached=true;}setDeviceSerialNumber(v){this.serial=v;}setChannel(v){this.index=v;}setHubPort(v){this.port=v;}setIsRemote(v){this.remote=v;}setIsHubPortDevice(v){this.hub=v;}async open(){}async close(){this.attached=false;}getAttached(){return this.attached;}getConnection(){return {name:'hub',connected};}getHumidity(){if(fail)throw Error('Messwert unbekannt');return 42.5;}getTemperature(){return 20;}getDutyCycle(){return 0.7;}getState(){return true;}}
 return {sdk:{NetworkConnection,HumiditySensor:Channel,TemperatureSensor:Channel,DigitalOutput:Channel},instances,disconnect(){connected=false;},reconnect(){connected=true;},fail(){fail=true;}};
}
test('Identität trennt Kanaltypen mit identischem Index; Kanal 15 bleibt erhalten',()=>{
 const rows=describe(inventory);assert.equal(new Set(rows.map(r=>r.key)).size,3);assert.equal(rows[2].index,15);
});
test('FALSE und Nullwert sind gültig; PWM-State wird nicht aus duty > 0 abgeleitet',()=>{
 assert.deepEqual(readValue({getState:()=>false},{className:'DigitalInput',getter:'getState'}),{value:0,boolean:false});
 assert.deepEqual(readValue({getDutyCycle:()=>0.2,getState:()=>false},{className:'DigitalOutput',getter:'getDutyCycle'}),{value:20,boolean:false});
 assert.throws(()=>readValue({getTemperature:()=>NaN},{getter:'getTemperature'}));
});
test('Lesedienst adressiert dynamisch und verwendet ausschließlich Getter für Werte',async()=>{
 const mock=sdk(),m=new Monitor(mock.sdk,[],()=>100);m.update(inventory);await m.tick();
 assert.equal(m.snapshot().filter(r=>r.quality==='live').length,3);
 const output=mock.instances.find(c=>c.index===15);assert.equal(output.port,5);assert.equal(output.serial,597039);assert.equal(output.remote,true);assert.equal(output.hub,false);
 assert.equal(m.snapshot()[2].value,70);await m.close();assert.ok(mock.instances.every(c=>!c.attached));
});
test('Neustart, Lesefehler und Verbindungsverlust zeigen keine falschen Livewerte; Wiederkehr funktioniert',async()=>{
 const mock=sdk(),m=new Monitor(mock.sdk,[],()=>100);m.update(inventory);await m.tick();
 const restart=new Monitor(mock.sdk,JSON.parse(JSON.stringify(m.snapshot())));assert.ok(restart.snapshot().every(r=>r.quality==='stale'));
 mock.disconnect();await m.tick();assert.ok(m.snapshot().every(r=>r.quality==='error'));assert.equal(m.snapshot()[0].value,42.5);
 mock.reconnect();await m.tick();assert.ok(m.snapshot().every(r=>r.quality==='live'));
 mock.fail();await m.tick();assert.equal(m.snapshot()[0].quality,'error');assert.equal(m.snapshot()[1].quality,'live');await m.close();await restart.close();
});
test('Verschwundene Geräte behalten historische Werte und schließen ihre Kanäle',async()=>{
 const mock=sdk(),m=new Monitor(mock.sdk);m.update(inventory);await m.tick();m.update({servers:[],devices:[]});await m.tick();assert.ok(m.snapshot().every(r=>r.quality==='stale'));assert.ok(mock.instances.every(c=>!c.attached));await m.close();
});
test('Dashboard erhält Filter und markiert Daten nach ausbleibenden Updates als veraltet',()=>{
 const source=fs.readFileSync('flow-src/flows/system--system_dashboard_flow/templates/phidgets-hardware-und-verbindungen.html','utf8');let receive;
 const scope={$watch(_,fn){receive=fn;},$on(){},send(){},$evalAsync(fn){fn();}};
 vm.runInNewContext(source.match(/<script>([\s\S]*?)<\/script>/)[1],{scope,Date,setInterval:()=>1,clearInterval(){}});
 scope.ioFilter='597039';receive({payload:{io:true,rows:[]}});assert.equal(scope.ioFilter,'597039');
 assert.equal(scope.ioFresh({quality:'live',lastRead:scope.ioNow-10001}),false);
 assert.equal(scope.ioFresh({quality:'live',lastRead:scope.ioNow}),true);
 const live={quality:'live',lastRead:scope.ioNow};
 assert.equal(scope.ioLed({...live,boolean:true}).css,'led-on');
 assert.equal(scope.ioLed({...live,boolean:false}).label,'FALSE');
 assert.equal(scope.ioLed({...live,boolean:null,value:0}).label,'Wert gültig');
 assert.equal(scope.ioLed({...live,lastRead:scope.ioNow-10001}).css,'led-stale');
 assert.equal(scope.ioLed({...live,quality:'error',boolean:true}).css,'led-error');
 assert.equal(scope.ioLed({quality:'unknown'}).label,'Unbekannt');
 assert.equal(scope.ioLed({quality:'unsupported'}).label,'Kein IO-Adapter');
 assert.match(source,/track by r.key/);
});

test('Node speichert IO-Werte in eigener Datei; Neustart stellt nur veraltete Werte her',async()=>{
 const os=await import('node:os'),path=await import('node:path');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'io-node-test-'));
 function harness(){let C,tick;const handlers={},messages=[];const mock=sdk();
  const RED={settings:{userDir:dir},nodes:{registerType(_,ctor){C=ctor;},createNode(n){n.id='io';n.on=(k,f)=>handlers[k]=f;n.send=m=>messages.push(m);n.warn=()=>{};}}};
  const ctx={module:{exports:{}},Date,setInterval(fn){tick=fn;return 1;},clearInterval(){},require(p){if(p.endsWith('/node_modules/phidget22'))return mock.sdk;if(p==='./phidget-io-core.cjs')return require('../nodes/phidget-io-core.cjs');return require(p);}};
  vm.runInNewContext(fs.readFileSync('nodes/home-automation-phidget-io.js','utf8'),ctx);ctx.module.exports(RED);new C({});
  return {handlers,messages,tick};
 }
 try{const h=harness();h.handlers.input({payload:{discovery:true,inventory}});await h.tick();
  const file=path.join(dir,'phidget-inventory/io-io.json');assert.equal(JSON.parse(fs.readFileSync(file)).length,3);
  await h.handlers.close(false,()=>{});const h2=harness();h2.handlers.input({});assert.ok(h2.messages.at(-1).payload.rows.every(r=>r.quality==='stale'));await h2.handlers.close(false,()=>{});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
