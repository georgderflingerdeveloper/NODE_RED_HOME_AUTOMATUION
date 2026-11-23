import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const register=require('../nodes/home-automation-scheduler.js');
function runtime(dir, graph = []) {
    let Ctor;const handlers={},sent=[];
    register({settings:{userDir:dir},nodes:{eachNode:cb=>graph.forEach(cb),getNode:id=>graph.find(n=>n.id===id),registerType(_,ctor){Ctor=ctor;},createNode(node){Object.assign(node,{id:'test',on:(name,cb)=>handlers[name]=cb,status(){},error(){},warn(){},send:msg=>sent.push(msg)});}}});
    new Ctor({});return {input:msg=>handlers.input(msg,msg=>sent.push(msg),()=>{}),sent,close:()=>handlers.close()};
}
test('Speicherfehler verhindert Befehle und rollt die Änderung zurück',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scheduler-runtime-'));
    try {
        fs.writeFileSync(path.join(dir,'scheduler-data'),'blockiert');const node=runtime(dir);
        node.input({topic:'scheduler/manage',payload:{command:'Enable',enabled:false,revision:0}});
        assert.equal(node.sent.at(-1)[0],null);assert.equal(node.sent.at(-1)[2].payload.enabled,true);assert.match(node.sent.at(-1)[2].payload.notice,/EEXIST|ENOTDIR/);node.close();
    }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Beschädigte gespeicherte Daten sperren den Scheduler ohne Überschreiben',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scheduler-runtime-'));
    try {fs.mkdirSync(path.join(dir,'scheduler-data'));const file=path.join(dir,'scheduler-data/test.json');fs.writeFileSync(file,'kaputt');const node=runtime(dir);node.input({topic:'scheduler/start'});assert.equal(node.sent.at(-1)[0],null);assert.match(node.sent.at(-1)[2].payload.notice,/gesperrt/);assert.equal(fs.readFileSync(file,'utf8'),'kaputt');node.close();}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('Aktivierung und Zeitpläne überleben Neustart; Ampel wird neu ermittelt',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scheduler-persist-'));
 try {
  let node=runtime(dir);node.input({topic:'scheduler/manage',payload:{command:'Enable',enabled:false,revision:0}});node.close();
  node=runtime(dir);node.input({topic:'scheduler/manage',payload:{command:'List'}});
  const p=node.sent.at(-1)[2].payload;
  assert.equal(p.enabled,false);assert.equal(p.plans[0].id,'kitchen-night');assert.equal(p.health.state,'idle');node.close();
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Speicherfehler bleibt rot bis erfolgreicher Wiederholung; kein Überschreiben defekter Daten',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scheduler-failure-'));
 try {
  const blocked=path.join(dir,'scheduler-data');fs.writeFileSync(blocked,'blockiert');const node=runtime(dir);
  node.input({topic:'scheduler/manage',payload:{command:'Enable',enabled:false,revision:0}});
  assert.equal(node.sent.at(-1)[2].payload.health.state,'error');
  node.input({topic:'scheduler/manage',payload:{command:'List'}});assert.equal(node.sent.at(-1)[2].payload.health.state,'error');
  node.input({topic:'scheduler/manage',payload:{command:'Unknown',revision:0}});assert.equal(node.sent.at(-1)[2].payload.health.state,'error');
  fs.unlinkSync(blocked);node.input({topic:'scheduler/manage',payload:{command:'List'}});
  assert.equal(node.sent.at(-1)[2].payload.health.state,'idle');node.close();
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('Schalter zur Laufzeit finden, aufnehmen, wiederherstellen und über den vorhandenen Ausgang schalten',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scheduler-discover-'));
 const delivered=[];
 const graph=[{id:'socket1',z:'room',type:'ui_switch',passthru:true,onvalueType:'bool',offvalueType:'bool',
   onvalue:'true',offvalue:'false',label:'Teststeckdose',topic:'switch',wires:[['wire1']],receive:m=>delivered.push(m)}];
 const manage=(node,command,args={})=>{node.input({topic:'scheduler/manage',payload:{command,...args}});return node.sent.at(-1)[2].payload;};
 try {
  let node=runtime(dir,graph);
  assert.equal(manage(node,'List').availableDevices.length,0);
  graph.push({id:'wire1',type:'mqtt out'});
  const id=manage(node,'List').availableDevices[0].id;
  const added=manage(node,'AddDevice',{id,revision:0,token:'add'});
  assert.equal(added.targets[0].id,id);assert.equal(added.availableDevices.length,0);assert.deepEqual(delivered,[]);
  node.close();node=runtime(dir,graph);
  assert.equal(manage(node,'List').targets[0].online,true);
  const now=Date.now();
  manage(node,'Save',{revision:1,plan:{id:'pulse',name:'Test',type:'interval',intervalMinutes:1,enabled:true,priority:10,target:{scope:'device',kind:'switch',id},action:{type:'on'}}});
  node.input({payload:{triggerTimestamp:now,config:{name:'schedule-pulse'}}});
  return new Promise((resolve,reject)=>setTimeout(()=>{
    try{assert.deepEqual(delivered,[{topic:'switch',payload:true}]);graph.pop();assert.equal(manage(node,'List').targets[0].online,false);resolve();}
    catch(e){reject(e);}finally{node.close();fs.rmSync(dir,{recursive:true,force:true});}
  },120));
 }catch(e){fs.rmSync(dir,{recursive:true,force:true});throw e;}
});
