import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {Scheduler}=require('../nodes/scheduler-core.cjs');
const {LightController}=require('../lib/functions/generated/LightController.js');
const register=new Function('msg',fs.readFileSync('flow-src/flows/light-controller--light_controller_flow/functions/scheduler-kitchen-status.js','utf8'));
const input=(engine,command,props)=>engine.handle({topic:'scheduler/manage',payload:{command,revision:engine.state.revision,...props}});
const catalog=(engine,controller)=>engine.handle(register({payload:controller.getOutput()})[0][0]);
const kid={id:'georgszimmer-light',room:'kinderzimmer',kind:'light',name:'Georgszimmer',groups:[],actions:['on','off','scenario'],channels:5,profileRoom:'kid_profile',scenarios:['Abend'],sceneLevels:{Abend:[80,70,0,20,0]}};

test('Küchenszene und Aus bleiben über Wiederanlauf erhalten, Ein stellt ihre Werte wieder her',()=>{
 let c=new LightController();
 c.process({Command:'AddScenario',ScenarioName:'Kochen',ScenarioProperties:{1:80,3:20}});
 c.process({Command:'SetDutyCycle',DutyCycle:50});
 for(const on of [false,false,true,true,false]){
  const out=c.process({Command:on?'AllLightsOn':'AllLightsOff',KeepScenario:true});
  assert.equal(out.ScenarioName,'Kochen');
  assert.deepEqual(out.LedOutput,on?[.4,0,.1,0,0,0]:Array(6).fill(0));
  c=new LightController(c.getConfiguration());
  assert.deepEqual(c.getLedOutput(),out.LedOutput);
 }
});
test('Universalszenen in beiden Richtungen, Neustart, Zeitplanbindung, Namensschutz und bestätigtes Löschen',()=>{
 let engine=new Scheduler(),c=new LightController();
 c.process({Command:'SelectScenario',ScenarioName:'Szenario 1'});
 catalog(engine,c);engine.register(kid,Date.now());
 input(engine,'RenameRoom',{room:'kitchen',name:'Wohnküche'});
 input(engine,'ShareRoomScene',{sourceId:kid.id,scene:'Abend',targetId:'kitchen-light',name:'Leselicht'});
 engine=new Scheduler(engine.state);
 const job=engine.state.kitchenSceneJob;
 assert.deepEqual(job.levels,[80,70,0,20,0,0]);
 c.process({Command:job.command,ScenarioName:job.name,ScenarioProperties:Object.fromEntries(job.levels.map((v,i)=>[i+1,v]))});
 assert.equal(c.getOutput().ScenarioName,'Szenario 1');
 catalog(engine,c);assert.equal(engine.state.kitchenSceneJob,undefined);
 input(engine,'ShareRoomScene',{sourceId:'kitchen-light',scene:'Leselicht',targetId:kid.id,name:'Leselicht'});
 assert.deepEqual(engine.state.rampProfiles.kid_profile.entries[0].levels,[80,70,0,20,0]);
 assert.throws(()=>input(engine,'ShareRoomScene',{sourceId:'library',scene:'Leselicht',targetId:kid.id,name:'Abend'}),/vergeben/);
 const plan={...engine.state.plans[0],id:'lesen',name:'Abendplan',enabled:true,type:'interval',intervalMinutes:10,action:{type:'scenario',value:'Leselicht'}};
 input(engine,'Save',{plan});engine=new Scheduler(engine.state);catalog(engine,c);
 assert.equal(engine.fire('schedule-lesen',Date.now(),Date.now())[0].payload.action.value,'Leselicht');
 assert.match(engine.status(Date.now()).targets.find(d=>d.id==='kitchen-light').name,/Wohnküche/);
 assert.throws(()=>input(engine,'DeleteKitchenScene',{targetId:'kitchen-light',name:'Leselicht'}),/Abendplan/);
 input(engine,'Delete',{id:'lesen'});input(engine,'DeleteKitchenScene',{targetId:'kitchen-light',name:'Leselicht'});
 c.process({Command:engine.state.kitchenSceneJob.command,ScenarioName:'Leselicht'});
 catalog(engine,c);assert.equal(engine.state.kitchenSceneJob,undefined);assert.equal(c.getOutput().ScenarioName,'Szenario 1');
 input(engine,'DeleteUniversalScene',{name:'Leselicht'});assert.deepEqual(engine.state.universalScenes,[]);
});
