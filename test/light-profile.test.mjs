import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {Scheduler}=require('../nodes/scheduler-core.cjs');
const {LightController}=require('../lib/functions/generated/LightController.js');
const curve=require('../nodes/light-profile-curve.cjs');
const adapterDir='flow-src/flows/light-controller--light_controller_flow/functions/';
const adapt=new Function('msg','node',fs.readFileSync(adapterDir+'scheduler-kitchen-command.js','utf8'));
const acknowledge=new Function('msg',fs.readFileSync(adapterDir+'scheduler-kitchen-status.js','utf8'));
function runtime(id,adapter){
 let t=0, timer, Ctor, messages=[];
 const clock={setInterval:f=>{timer=f;return 1;},clearInterval:()=>timer=null,Date:{now:()=>t}};
 const handlers={}, module={};
 vm.runInNewContext(fs.readFileSync('nodes/home-automation-light-profile.js','utf8'),{module,require:()=>curve,...clock});
 module.exports({nodes:{registerType:(_,c)=>Ctor=c,createNode:n=>Object.assign(n,{id,on:(e,f)=>handlers[e]=f,send:m=>messages.push(m)})}});
 new Ctor({adapter});
 return {input(msg){messages=[];handlers.input(msg,m=>messages.push(m),e=>{if(e)throw e;});return messages;},advance(ms){t+=ms;messages=[];timer?.();return messages;},close:()=>handlers.close()};
}
test('Scheduler → Küchenprofil → PWM und korreliertes ACK; Unterbrechung, Sofortbefehl und Neustart',()=>{
 const manager=runtime('kitchen_profile','controller'),lamp=new LightController(),engine=new Scheduler();
 const state=lamp.process({Command:'AllLightsOff'}),name=state.ScenarioList[0].ScenarioName;
 const device={id:'kitchen-light',kind:'light',room:'kitchen',name:'Küche',actions:['on','off','scenario'],groups:[],scenarios:[name]};
 const now=Date.now();engine.register(device,now);
 manager.input({payload:state});
 const saved=engine.handle({topic:'scheduler/manage',payload:{command:'SetRampProfile',revision:0,room:'kitchen_profile',profile:{name,enabled:true,onSeconds:4,offSeconds:2}}},now);
 manager.input({payload:new Scheduler(engine.state).status(now)});
 assert.equal(saved.status.rampProfiles.kitchen_profile.entries[0].offSeconds,2);
 function fire(type,ramp){
   const plan={id:'plan'+type,name:'Plan '+type,enabled:true,type:'interval',intervalMinutes:1,priority:10,target:{scope:'device',kind:'light',id:device.id},action:{type,profile:name,ramp}};
   engine.handle({topic:'scheduler/manage',payload:{command:'Save',plan,revision:engine.state.revision}},now);
   const request=engine.handle({payload:{triggerTimestamp:now,config:{name:'schedule-'+plan.id}}},now).commands[0];
   const msg=manager.input(adapt(request,{warn(){}})[0])[0][0];
   msg.payload=lamp.process(msg.payload);
   const ack=acknowledge(msg)[0][1];assert(ack.payload.ok);engine.handle(ack,now);
   return manager.input(msg);
 }
 fire('on',true);
 const midway=manager.advance(2000)[0][4].payload.LedOutput[0];
 const full=curve.toDuty(lamp.getLedOutput()[0]);
 assert(full>0);assert(Math.abs(curve.toLight(midway)-curve.toLight(full)/2)<1e-8);
 fire('off',true);
 const fading=manager.advance(1000)[0][4].payload.LedOutput[0];assert(fading>0 && fading<midway);
 const instant=fire('on',false)[0][4].payload.LedOutput[0];assert.equal(instant,full);assert.equal(manager.advance(5000).length,0);manager.close();
});
test('Kinderzimmer verarbeitet den Scheduler-Befehl und fährt jeden PWM-Ausgang lokal',()=>{
 const room=runtime('kid_profile','room');
 room.input({payload:{scenarios:['Abend'],scenario:'Abend',sceneLevels:{Abend:[35,35,20,20,20]}}});
 room.input({payload:{revision:1,plans:[],rampProfiles:{kid_profile:{selected:'Abend',entries:[{name:'Abend',enabled:true,onSeconds:2,offSeconds:4}]}}}});
 const plc=new Map([['FF0',[false,false,false]],['M0',[false,false]],['M1',[false,false]]]),state=new Map();
 const control=new Function('msg','context','global',fs.readFileSync('tools/georgszimmer/room-controller.js','utf8'));
 function apply(type,ramp){
  const msg=room.input({topic:'scheduler/command',payload:{schemaVersion:1,targetId:'georgszimmer-light',action:{type,ramp}}})[0][0];
  return control({req:{method:'POST',socket:{remoteAddress:'192.168.0.149'},is:()=>true},payload:msg.payload.action},state,plc)[0];
 }
 const channels=Array.from({length:5},(_,i)=>{
   let time=0,timer,out;const context=new Map();
   const fn=vm.runInNewContext('(function(msg){'+fs.readFileSync('tools/georgszimmer/pwm-channel.js','utf8').replace('CHANNEL_INDEX',String(i))+'})',
    {global:plc,context,Date:{now:()=>time},setInterval:f=>{timer=f;return 1;},clearInterval:()=>timer=null,interpolateDuty:curve.interpolateDuty,node:{send:m=>out=m.payload.dutyCycle}});
   return {input:fn,tick(ms){time+=ms;timer?.();return out;}};
 });
 state.set('settings',{brightness:100,scenario:'Abend'});
 const on=apply('on',true);assert.equal(on.rampSeconds,2);channels.forEach(ch=>ch.input(on));
 const half=channels.map(ch=>ch.tick(1000));
 half.forEach((v,i)=>assert(Math.abs(v-curve.toDuty((i<2?.35:.20)/2))<1e-10));
 const off=apply('off',true);assert.equal(off.rampSeconds,4);channels.forEach(ch=>ch.input(off));
 channels.forEach(ch=>assert.equal(ch.tick(4000),0));
 assert.equal(apply('on',false).rampSeconds,0);
});
test('Neue Kinderzimmerszene bleibt in der Setup-Datei und wird ohne Schaltbefehl im PLC-Katalog ergänzt',()=>{
 const engine=new Scheduler(),manager=runtime('kid_profile','room');
 const status={scenarios:['Hell'],scenario:'Hell',on:false,sceneLevels:{Hell:[100,100,100,100,100]}};
 manager.input({payload:engine.status(Date.now())});manager.input({payload:status});
 const save=manager.input({topic:'profile/scene',payload:{name:'Lesen',levels:[10,0,20,0,50]}})[0][3];
 const result=engine.handle(save);assert.deepEqual(result.commands,[]);
 const published=manager.input({payload:new Scheduler(engine.state).status(Date.now())})[0][0];
 assert.equal(published.payload.type,'profileCatalog');
 const plc=new Map([['FF0',[false,false,false]],['M0',[false,false]],['M1',[false,false]]]);
 const control=new Function('msg','context','global',fs.readFileSync('tools/georgszimmer/room-controller.js','utf8'));
 const [refresh,reply]=control({req:{method:'POST',socket:{remoteAddress:'192.168.0.149'},is:()=>true},payload:published.payload},new Map(),plc);
 assert.equal(refresh,null);assert.equal(reply.payload.on,false);assert.deepEqual([...reply.payload.sceneLevels.Lesen],[10,0,20,0,50]);
 assert.equal(reply.payload.scenarios.includes('Lesen'),true);
});
test('Kerze und Kamin: begrenztes Flackern, unabhängige Kanäle, Unterbrechung und Ausblenden',()=>{
 const plc=new Map([['FF0',[false,false,false]],['M0',[false,false]],['M1',[false,false]]]);
 const state=new Map(), control=new Function('msg','context','global',fs.readFileSync('tools/georgszimmer/room-controller.js','utf8'));
 const command=action=>control({req:{method:'POST',socket:{remoteAddress:'192.168.0.149'},is:()=>true},payload:action},state,plc)[0];
 let now=1000;
 const channels=[0,1].map(i=>{
   const context=new Map();let timer,out;
   const fn=vm.runInNewContext('(function(msg){'+fs.readFileSync('tools/georgszimmer/pwm-channel.js','utf8').replace('CHANNEL_INDEX',String(i))+'})',
     {global:plc,context,Date:{now:()=>now},setInterval:f=>{timer=f;return 1;},clearInterval:()=>timer=null,interpolateDuty:curve.interpolateDuty,node:{send:m=>out=m.payload.dutyCycle}});
   return {input:fn,tick(){timer?.();return out;},running:()=>!!timer};
 });
 for(const profile of ['Kerzenlicht','Kaminfeuer']){
   const on=command({type:'on',profile,rampSeconds:1});
   channels.forEach(c=>c.input(on));
   const peaks=plc.get('georgszimmerPower');
   const samples=[];
   for(let i=0;i<40;i++){
     now+=80;const pair=channels.map(c=>c.tick());
     pair.forEach((v,index)=>assert(v>=0 && v<=peaks[index]));samples.push(pair);
   }
   assert(new Set(samples.map(pair=>pair[0])).size>10);assert(samples.some(([a,b])=>a!==b));
 }
 const off=command({type:'off',rampSeconds:1});channels.forEach(c=>c.input(off));
 now+=500;channels.forEach(c=>assert(c.tick()>0));now+=500;
 channels.forEach(c=>{assert.equal(c.tick(),0);assert.equal(c.running(),false);});
 command({type:'on',profile:'Kaminfeuer'});channels.forEach(c=>c.input({payload:true}));
 const steady=command({type:'scenario',value:'Hell'});
 channels.forEach(c=>{assert.equal(c.input(steady).payload.dutyCycle,1);assert.equal(c.running(),false);});
});

test('Scheduler wechselt mitten in der Rampe zwischen Feuer, Kerze, Aus und fester Szene auf allen fünf Ausgängen',()=>{
 let now=Date.parse('2026-11-23T18:00:00Z');
 const plc=new Map([['FF0',[false,false,false]],['M0',[false,false]],['M1',[false,false]]]);
 const state=new Map(), scheduler=new Scheduler(), manager=runtime('kid_profile','room');
 const api=new Function('msg','context','global',fs.readFileSync('tools/georgszimmer/room-controller.js','utf8'));
 const call=(method,payload)=>api({req:{method,socket:{remoteAddress:'192.168.0.149'},is:()=>true},payload},state,plc);
 function feedback(response){manager.input(response[1]);const p=response[1].payload;
   scheduler.register({id:'georgszimmer-light',name:'Raumlicht',room:'kinderzimmer',kind:'light',groups:[],actions:['on','off','scenario','brightness'],scenarios:p.scenarios},now);
 }
 feedback(call('GET'));
 for(const name of ['Kerzenlicht','Kaminfeuer','Hell']){
   const result=scheduler.handle({topic:'scheduler/manage',payload:{command:'SetRampProfile',revision:scheduler.state.revision,room:'kid_profile',profile:{name,enabled:true,onSeconds:2,offSeconds:3}}},now);
   manager.input({payload:result.status});
 }
 const channels=Array.from({length:5},(_,index)=>{
   const timers=new Set(),context=new Map();let last=0;
   const input=vm.runInNewContext('(function(msg){'+fs.readFileSync('tools/georgszimmer/pwm-channel.js','utf8').replace('CHANNEL_INDEX',String(index))+'})',
     {global:plc,context,Date:{now:()=>now},setInterval:fn=>{timers.add(fn);return fn;},clearInterval:fn=>timers.delete(fn),interpolateDuty:curve.interpolateDuty,node:{send:msg=>last=msg.payload.dutyCycle}});
   return {send(msg){const r=input(msg);if(r)last=r.payload.dutyCycle;},get value(){return last;},tick(){assert(timers.size<=1);[...timers].forEach(fn=>fn());},timers};
 });
 let count=0;
 function execute(action){
   const id='wechsel-'+(++count);
   scheduler.handle({topic:'scheduler/manage',payload:{command:'Save',revision:scheduler.state.revision,plan:{id,name:id,enabled:true,type:'interval',intervalMinutes:1,priority:10,target:{scope:'device',kind:'light',id:'georgszimmer-light'},action}}},now);
   const cmd=scheduler.handle({payload:{triggerTimestamp:now,config:{name:'schedule-'+id}}},now).commands[0];
   const routed=manager.input(cmd)[0][0];const response=call('POST',routed.payload.action);
   assert.equal(response[1].statusCode,200);channels.forEach(ch=>ch.send(response[0]));feedback(response);
 }
 function tick(ms){now+=ms;channels.forEach(ch=>ch.tick());return channels.map(ch=>ch.value);}
 function interrupt(action){
   const before=channels.map(ch=>ch.value);
   execute(action);assert.deepEqual(tick(0),before);
 }
 execute({type:'on',profile:'Kerzenlicht'});const rising=tick(800);assert(rising.every(v=>v>0));
 interrupt({type:'scenario',value:'Kaminfeuer'});tick(320);
 interrupt({type:'off'});const descending=tick(1000);
 // An ordinary PLC echo carrying the same off-state must not cancel the fade.
 channels.forEach(ch=>ch.send({payload:false}));assert(tick(400).every((v,i)=>v<descending[i] && v>0));
 interrupt({type:'on',profile:'Kerzenlicht'});tick(280);
 interrupt({type:'scenario',value:'Hell'});assert.deepEqual(tick(2000),[1,1,1,1,1]);
 assert(channels.every(ch=>!ch.timers.size));
 execute({type:'on',profile:'Kaminfeuer',ramp:false});assert(channels.every(ch=>ch.value>0 && ch.timers.size===1));
 execute({type:'brightness',value:0});assert(channels.every(ch=>ch.value===0 && !ch.timers.size));
 execute({type:'brightness',value:50});assert(tick(320).every(v=>v>0 && v<curve.toDuty(.5)));
 interrupt({type:'off'});assert.deepEqual(tick(3000),[0,0,0,0,0]);
 assert(channels.every(ch=>!ch.timers.size));assert.equal(call('GET')[1].payload.on,false);
});

test('05:00-Weckplan in Wien und fließende Wechsel der Morgen- und Nachtprogramme',()=>{
 let now=Date.parse('2026-11-23T05:00:00+01:00');
 const plc=new Map([['FF0',[false,false,false]],['M0',[false,false]],['M1',[false,false]]]);
 const context=new Map(), room=runtime('kid_profile','room'), scheduler=new Scheduler();
 const controller=vm.runInNewContext('(function(msg){'+fs.readFileSync('tools/georgszimmer/room-controller.js','utf8')+'})',{global:plc,context,Date:{now:()=>now}});
 const request=(method,payload)=>controller({req:{method,socket:{remoteAddress:'192.168.0.149'},is:()=>true},payload});
 const device=request('GET')[1].payload;
 room.input({payload:device});
 const id='georgszimmer-light';
 scheduler.register({id,kind:'light',room:'kinderzimmer',name:'Raumlicht',actions:['on','off','scenario'],groups:[],scenarios:device.scenarios},now);
 for(const name of Object.keys(device.routines)){
   const save=scheduler.handle({topic:'scheduler/manage',payload:{command:'SetRampProfile',revision:scheduler.state.revision,room:'kid_profile',profile:{name,enabled:true,onSeconds:600,offSeconds:name==='Gute Nacht'?600:1}}},now);
   room.input({payload:save.status});
 }
 const plan={id:'morgen',name:'Ab 05:00',type:'weekly',start:'05:00',days:[1,2,3,4,5],enabled:false,priority:10,target:{scope:'device',kind:'light',id},action:{type:'on',profile:'Sanfter Morgen'}};
 const savePlan=()=>scheduler.handle({topic:'scheduler/manage',payload:{command:'Save',revision:scheduler.state.revision,plan}},now);
 const trigger=()=>scheduler.handle({payload:{config:{name:'schedule-morgen'},triggerTimestamp:now}},now);
 savePlan();assert.equal(trigger().commands.length,0);
 plan.enabled=true;
 assert(savePlan().cron.some(c=>c.payload?.expression==='0 0 5 * * 1,2,3,4,5'));
 const message=trigger().commands[0];assert.equal(trigger().commands.length,0);
 const channels=Array.from({length:5},(_,i)=>{
   let last=0;const timers=new Set();
   const fn=vm.runInNewContext('(function(msg){'+fs.readFileSync('tools/georgszimmer/pwm-channel.js','utf8').replace('CHANNEL_INDEX',String(i))+'})',{
     context:new Map(),global:plc,Date:{now:()=>now},interpolateDuty:curve.interpolateDuty,setInterval:f=>{timers.add(f);return f;},clearInterval:f=>timers.delete(f),node:{send:m=>last=m.payload.dutyCycle}});
   return {input(m){const output=fn(m);if(output)last=output.payload.dutyCycle;},value:()=>last,tick(){assert(timers.size<=1);timers.forEach(f=>f());},timers};
 });
 function route(msg){
   const action=room.input(msg)[0][0].payload.action;
   const result=request('POST',action);assert.equal(result[1].statusCode,200);
   channels.forEach(ch=>ch.input(result[0]));room.input(result[1]);
 }
 const values=()=>channels.map(ch=>ch.value());
 const tick=ms=>{now+=ms;channels.forEach(ch=>ch.tick());return values();};
 function change(type,profile,ramp){
   const before=values();route({topic:'scheduler/command',payload:{targetId:id,action:{type,...(type==='scenario'?{value:profile}:{profile}),ramp}}});
   if(ramp!==false)assert.deepEqual(tick(0),before);
 }
 route(message);assert.deepEqual(tick(300000),Array(5).fill(curve.toDuty(.5)));
 assert.deepEqual(tick(300000),Array(5).fill(1));
 change('on','Gute Nacht');assert.deepEqual(tick(300000),Array(5).fill(curve.toDuty(.5)));
 change('scenario','Morgenwecker');assert(request('GET')[1].payload.on);
 const low=tick(2000);assert(tick(2000).every((v,i)=>v>low[i]));
 // All ordered pairings, with commands arriving before the old program completes.
 const modes=['Sanfter Morgen','Gute Nacht','Morgenwecker','Kerzenlicht','Hell'];
 for(const from of modes)for(const to of modes){
   change('on',from,from==='Kerzenlicht'||from==='Hell'?false:undefined);tick(790);
   if((from==='Kerzenlicht'||from==='Hell')&&(to==='Kerzenlicht'||to==='Hell'))continue;
   change('on',to);assert(tick(830).every(v=>v>=0 && v<=1));
 }
 change('on','Morgenwecker');assert.deepEqual(tick(600000),Array(5).fill(1));assert(channels.every(c=>!c.timers.size));
 channels.forEach(c=>c.input({payload:true}));assert(channels.every(c=>!c.timers.size));
 change('off','Gute Nacht');assert.deepEqual(tick(600000),Array(5).fill(0));assert(channels.every(c=>!c.timers.size));
 change('on','Morgenwecker',false);assert.deepEqual(values(),Array(5).fill(1));
 change('off','Gute Nacht',false);assert.deepEqual(values(),Array(5).fill(0));
});

test('Morgenwecker übernimmt die gespeicherte Pulsdauer für Scheduler und Testtaste',()=>{
 const name='Morgenwecker',id='kid_profile',store=new Scheduler(),manager=runtime(id,'room');
 const plc=new Map([['FF0',[false,false,false]],['M0',[false,false]],['M1',[false,false]]]);
 const context=new Map(),api=new Function('msg','context','global',fs.readFileSync('tools/georgszimmer/room-controller.js','utf8'));
 const call=(method,payload)=>api({req:{method,socket:{remoteAddress:'192.168.0.149'},is:()=>true},payload},context,plc);
 manager.input(call('GET')[1]);manager.input({payload:store.status(Date.now())});
 for(const seconds of [2,7.5,60]){
   const save=manager.input({topic:'profile/save',payload:{name,enabled:true,onSeconds:180,offSeconds:1,pulseSeconds:seconds}})[0][3];
   store.handle(save);
   manager.input({payload:new Scheduler(JSON.parse(JSON.stringify(store.state))).status(Date.now())});
   const action={type:'on',profile:name};
   const direct=manager.input({topic:'profile/test',payload:action})[0][0].payload;
   const timed=manager.input({topic:'scheduler/command',payload:{targetId:'georgszimmer-light',action}})[0][0].payload.action;
   assert.equal(direct.pulseSeconds,seconds);assert.equal(timed.pulseSeconds,seconds);
   const [refresh,response]=call('POST',timed);assert.equal(response.statusCode,200);
   let now=0,tick,value;
   const channel=vm.runInNewContext('(function(msg){'+fs.readFileSync('tools/georgszimmer/pwm-channel.js','utf8').replace('CHANNEL_INDEX','0')+'})',
     {context:new Map(),global:plc,Date:{now:()=>now},interpolateDuty:curve.interpolateDuty,setInterval:f=>{tick=f;return 1;},clearInterval:()=>{},node:{send:m=>value=m.payload.dutyCycle}});
   channel(refresh);now=seconds*500;tick();assert(Math.abs(curve.toLight(value)-.35)<1e-10);
   now=seconds*1000;tick();assert.equal(value,1);
 }
 for(const seconds of [1,61,'7']){
   const profile={name,enabled:true,onSeconds:180,offSeconds:1,pulseSeconds:seconds};
   assert.throws(()=>store.handle({topic:'scheduler/manage',payload:{command:'SetRampProfile',revision:store.state.revision,room:id,profile}}),/Pulsdauer/);
   assert.equal(call('POST',{type:'on',profile:name,pulseSeconds:seconds})[1].statusCode,400);
 }
});

test('Live-PWM zeigt je Kanal den ausgegebenen Wert; unbeschriebene Ausgänge bleiben unbekannt',()=>{
 const plc=new Map([['FF0',[true,false,false]],['M0',[false,false]],['M1',[true,false]],['georgszimmerPower',[.184,0,0,0,0]]]);
 const controller=new Function('msg','context','global',fs.readFileSync('tools/georgszimmer/room-controller.js','utf8'));
 const sample=()=>controller({req:{method:'GET',query:{outputs:'1'}}},new Map(),plc)[1].payload.duty;
 assert.deepEqual(sample(),Array(5).fill(null));
 let now=0,callback,last;
 const channel=vm.runInNewContext('(function(msg){'+fs.readFileSync('tools/georgszimmer/pwm-channel.js','utf8').replace('CHANNEL_INDEX','0')+'})',{
   context:new Map(),global:plc,Date:{now:()=>now},interpolateDuty:curve.interpolateDuty,node:{send:m=>last=m.payload.dutyCycle},
   setInterval:f=>{callback=f;return 1;},clearInterval:()=>{callback=null;}});
 assert.equal(channel({payload:false}).payload.dutyCycle,0);
 assert.deepEqual([...sample()],[0,null,null,null,null]);
 channel({payload:true,rampSeconds:2});now=1000;callback();
 assert.equal(sample()[0],last);assert(last>0 && last<.184);
 now=2000;callback();assert.equal(sample()[0],.184);
});
test('Küchenprofil blendet auch bei lokalen Ein/Aus-Wechseln und zeigt seine erzeugten Zwischenwerte',()=>{
 const manager=runtime('kitchen_profile','controller'),state={OutputCount:1,ScenarioList:[{ScenarioName:'Lesen',ScenarioProperties:{1:50}}],SceneName:'',ScenarioName:'Lesen',LedOutput:[0]};
 manager.input({payload:{plans:[],revision:1,rampProfiles:{kitchen_profile:{selected:'Lesen',entries:[{name:'Lesen',enabled:true,onSeconds:4,offSeconds:2}]}}}});
 manager.input({payload:state});
 manager.input({payload:{...state,LedOutput:[.5]}});
 const halfway=manager.advance(2000)[0];assert.equal(halfway[2].payload[0],halfway[4].payload.LedOutput[0]);
 assert(Math.abs(halfway[2].payload[0]-curve.toDuty(.25))<1e-8);
 manager.input({payload:{...state,ScenarioName:null,LedOutput:[0]}});
 const fading=manager.advance(1000)[0];assert(Math.abs(fading[2].payload[0]-curve.toDuty(.125))<1e-8);manager.close();
});

test('Szene mehrfach speichern erhält Reglerwerte, Profilwahl und laufendes Raumlicht bei versetzten Rückmeldungen',()=>{
 const store=new Scheduler(), manager=runtime('kid_profile','room'), out=[];
 const plc=new Map([['FF0',[true,false,false]],['M0',[false,false]],['M1',[true,false]]]);
 const context=new Map([['settings',{brightness:68,scenario:'Abend'}]]);
 const control=new Function('msg','context','global',fs.readFileSync('tools/georgszimmer/room-controller.js','utf8'));
 const request=(method,payload)=>control({req:{method,socket:{remoteAddress:'192.168.0.149'},is:()=>true},payload},context,plc);
 store.handle({topic:'scheduler/manage',payload:{command:'SetRampProfile',revision:0,room:'kid_profile',profile:{name:'Hell',enabled:true,onSeconds:5,offSeconds:3}}});
 const scope={send:m=>out.push(m),$on(){},$watch(key,fn){this.receive=fn;}};
 const html=fs.readFileSync('flow-src/flows/flow-kidroom--c28cf7ba.34de98/templates/lichtprofil-und-rampe.html','utf8');
 new Function('scope',html.match(/<script>([\s\S]*?)<\/script>/)[1])(scope);
 function display(messages){for(const batch of messages)if(batch[2])scope.receive(batch[2]);}
 display(manager.input({payload:store.status(Date.now())}));display(manager.input(request('GET')[1]));
 scope.form.name='Gute Nacht';scope.loadProfile();
 const levels=[17,33,56,0,84];scope.scene.levels=[...levels];
 scope.saveScene();const first=manager.input(out.pop())[0][3], saved=store.handle(first);
 assert.deepEqual(saved.commands,[]);
 const update=manager.input({payload:saved.status});
 display(update);assert.deepEqual(scope.scene.levels,levels);
 assert.equal(scope.form.name,'Gute Nacht');assert.equal(scope.notice,'Szene wird gespeichert …');
 // Press again before PICENTER2 replies. The old channel values must never be sent back.
 const before=out.length;scope.saveScene();assert.equal(out.length,before);
 const same=store.handle({...first,payload:{...first.payload,revision:saved.status.revision}});
 assert.equal(same.status.revision,saved.status.revision);
 assert.equal(same.status.rampProfiles.kid_profile.selected,'Hell');
 assert.equal(scope.form.offSeconds,1200);
 const [command,response]=request('POST',update[0][0].payload);
 assert.equal(command,null);assert.equal(response.payload.on,true);
 assert.equal(response.payload.brightness,68);assert.equal(response.payload.scenario,'Abend');
 display(manager.input(response));assert.equal(scope.notice,'Szene gespeichert.');
 scope.saveScene();const confirmed=manager.input(out.pop());
 assert.equal(confirmed[0][0],null);assert.equal(confirmed[0][3],undefined);
 display(confirmed);assert.equal(scope.notice,'Szene gespeichert.');
 assert.deepEqual(scope.scene.levels,levels);
});

test('Lichtergruppe liest aktives Profil und Kanal-PWM während der Gute-Nacht-Rampe unabhängig vom Raum-Ein-Bit',()=>{
 const plc=new Map([['FF0',[true,false,false]],['M0',[false,false]],['M1',[true,false]],
    ['georgszimmerPwmOutput',[.2,1,0,.5,null]]]);
 const state=new Map([['settings',{brightness:100,scenario:'Abend'}]]);
 let now=10000;
 const control=vm.runInNewContext('(function(msg){'+fs.readFileSync('tools/georgszimmer/room-controller.js','utf8')+'})',
     {context:state,global:plc,Date:{now:()=>now}});
 const snapshot=()=>control({req:{method:'GET',query:{outputs:'1'}}})[1].payload;
 assert.equal(snapshot().profile,'Abend');
 control({req:{method:'POST',socket:{remoteAddress:'192.168.0.149'},is:()=>true},payload:{type:'on',profile:'Gute Nacht',rampSeconds:2}});
 now+=1000;
 assert.equal(plc.get('FF0')[0],false);
 assert.equal(snapshot().profile,'Gute Nacht');
 assert.deepEqual(snapshot().duty,[.2,1,0,.5,null]);
 now+=1000;
 assert.equal(snapshot().profile,null);
});
