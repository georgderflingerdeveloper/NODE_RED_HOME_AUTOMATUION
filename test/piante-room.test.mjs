import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import vm from 'node:vm';

async function room(type,capable=true,outputs=130){
 const sent=[],messages=[];
 let construct,handler,now=10000;
 const transport={createSocket(){
  const socket=new EventEmitter();
  socket.close=()=>{};
  socket.send=(text,port,address,cb)=>{
   assert.equal(address,'192.168.0.125');assert.equal(port,10000);sent.push(text);
   if(text.endsWith('?'))queueMicrotask(()=>capable?socket.emit('message',Buffer.from(text.slice(0,-1)+'-V1'),{address,port}):socket.emit('error',Error()));
   else cb(null);
  };
  return socket;
 }};
 const ctx={module:{exports:{}},Date:{now:()=>now},setTimeout,clearTimeout,require:p=>p==='node:dgram'?transport:{sample:async()=>({'311893':{inputs:5,outputs,until:now+12000}})}};
 vm.runInNewContext(readFileSync('nodes/home-automation-piante-room.js','utf8'),ctx);
 ctx.module.exports({nodes:{registerType:(t,c)=>{construct=c;},createNode(n){n.send=m=>messages.push(m);n.on=(k,cb)=>{if(k==='input')handler=cb;};}}});
 new construct({room:type});await handler({topic:'ante/read'});
 return {sent,messages,set:(index,on)=>handler({topic:'ante/set',payload:{index,on}}),expire:()=>{now+=15000;}};
}
test('Die beiden PIANTE-Räume lesen getrennte Kanäle und schalten nur ihre Lichtkreise',async()=>{
 for(const type of ['ante','bath']){
  const r=await room(type),state=r.messages.at(-1).payload;
  assert.deepEqual(Array.from(state.lights,l=>l.on),type==='ante'?[false,true,false,false,false]:[true,false,false,false,false]);
  assert.equal(state.ready,true);assert.equal(state.button,true);
  for(let i=0;i<5;i++){await r.set(i,true);assert.equal(r.sent.at(-1),type.toUpperCase()+'-'+i+'-ON');}
  await r.set('ALL',false);
  if(type==='bath')assert.equal(r.sent.at(-1),'BATH-ALL-OFF');
  else assert.equal(r.messages.at(-1).topic,'ante/error');
  const count=r.sent.length;
  await r.set(12,true);await r.set(0,33);r.expire();await r.set(0,true);
  assert.equal(r.sent.length,count);
 }
});
test('Alter Controller erlaubt Liveanzeige, aber keinen Einzelbefehl',async()=>{
 const r=await room('bath',false);
 assert.equal(r.messages.at(-1).payload.ready,false);
 await r.set(0,true);assert.deepEqual(r.sent,['BATH-CONTROLS?']);
});

test('Oben verwendet nur die beiden Vorhaus-Ausgänge 2 und 3',async()=>{
 for(const [outputs,group] of [[0,'off'],[4,'mixed'],[8,'mixed'],[12,'on'],[3968,'off']]){
  const r=await room('upper',true,outputs),state=r.messages.at(-1).payload;
  assert.equal(state.group,group);assert.equal(state.hasButton,false);
  assert.deepEqual(Array.from(state.lights,l=>l.on),[Boolean(outputs&4),Boolean(outputs&8)]);
  await r.set(0,true);await r.set(1,false);await r.set('ALL',true);await r.set('ALL',false);
  await r.set(2,true);await r.set(-1,true);
  assert.deepEqual(r.sent,['ANTE-CONTROLS?','ANTE-2-ON','ANTE-3-OFF','ANTE-2-ON','ANTE-3-ON','ANTE-2-OFF','ANTE-3-OFF']);
 }
});

test('WC zeigt die Ausgänge 5 und 6 sowie den Wandtaster und verwendet den bestehenden Gruppenbefehl',async()=>{
 const r=await room('wc',true,1<<5),state=r.messages.at(-1).payload;
 assert.deepEqual(Array.from(state.lights,l=>[l.name,l.on]),[['Hauptlicht',true],['Dimmlicht',false]]);
 assert.equal(state.button,false);assert.equal(state.group,'mixed');
 await r.set('ALL',false);assert.equal(r.messages.at(-1).topic,'wc/group');assert.equal(r.messages.at(-1).payload,false);
 await r.set(1,true);assert.equal(r.messages.at(-1).topic,'ante/error');
});
