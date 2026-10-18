import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {LightController}=require('../lib/functions/generated/LightController.js');
const base='flow-src/flows/light-controller--light_controller_flow/functions/';
// Node-RED stellt node.warn bereit; Warnungen werden im Test erfasst.
const warnings=[];
const adapterFunction=new Function('msg','node',fs.readFileSync(base+'scheduler-kitchen-command.js','utf8'));
const adapter=msg=>adapterFunction(msg,{warn:message=>warnings.push(message)});
const status=new Function('msg',fs.readFileSync(base+'scheduler-kitchen-status.js','utf8'));
test('Link-Befehl → realer LightController → korrelierte Rückmeldung; Aus bleibt Aus',()=>{
    const controller=new LightController();controller.process({Command:'AllLightsOff'});
    const input={topic:'scheduler/command',payload:{schemaVersion:1,targetId:'kitchen-light',requestId:'r1',action:{type:'brightness',value:30}}};
    const [msg]=adapter(input);msg.payload=controller.process(msg.payload);
    assert.equal(msg.payload.DutyCycle,30);assert.ok(msg.payload.LedOutput.every(value=>value===0));
    const messages=status(msg)[0];assert.equal(messages[0].topic,'scheduler/register');assert.equal(messages[1].payload.ok,true);assert.equal(messages[1].payload.requestId,'r1');
});
test('Adapter ignoriert andere Geräte und quittiert ungültige Aktionen als Fehler',()=>{
    assert.equal(adapter({topic:'scheduler/command',payload:{schemaVersion:1,targetId:'other'}}),null);
    const result=adapter({topic:'scheduler/command',payload:{schemaVersion:1,targetId:'kitchen-light',requestId:'r1',action:{type:'brightness',value:NaN}}});assert.equal(result[0],null);assert.equal(result[1].payload.ok,false);
});
test('Vorhandene Küchen-Function bewahrt Request-ID und persistiert SetDutyCycle',()=>{
    const values=new Map();const storage={get:key=>values.get(key),set:(key,value)=>values.set(key,value)};
    const wrapper=fs.readFileSync(base+'light-controller-kitchen.js','utf8');
    const execute=vm.runInNewContext('(function(msg,node,context,flow,global){'+wrapper+'})',{setTimeout:()=>1,clearTimeout(){}});
    const node={status(){},warn(){},error(error){throw Error(error);},send(){}};
    const request={topic:'scheduler/command',payload:{schemaVersion:1,targetId:'kitchen-light',requestId:'r2',action:{type:'brightness',value:0}}};
    const output=execute(adapter(request)[0],node,storage,storage,{get:key=>key==='LightControllerModule'?{LightController}:null});
    assert.equal(output.schedulerRequest.requestId,'r2');assert.equal(values.get('LightControllerKitchenConfiguration').runtimeState.dutyCyclePercent,0);
    assert.equal(status(output)[0][1].payload.ok,true);
});

test('Ungültige Helligkeit meldet Warnung und korreliertes Fehler-ACK',()=>{
    warnings.length=0;
    const result=adapter({topic:'scheduler/command',payload:{schemaVersion:1,targetId:'kitchen-light',requestId:'invalid-brightness',action:{type:'brightness',value:101}}});
    assert.equal(result[0],null);
    assert.equal(result[1].payload.requestId,'invalid-brightness');
    assert.equal(result[1].payload.ok,false);
    assert.deepEqual(warnings,['Scheduler: Ungültige Aktion für kitchen-light']);
});
test('Gültige Aktionen werden ohne Warnung übersetzt',()=>{
    for(const [action,expected] of [
        [{type:'brightness',value:0},{Command:'SetDutyCycle',DutyCycle:0}],
        [{type:'brightness',value:100},{Command:'SetDutyCycle',DutyCycle:100}],
        [{type:'on'},{Command:'AllLightsOn'}],
        [{type:'off'},{Command:'AllLightsOff'}],
        [{type:'scenario',value:'Abend'},{Command:'SelectScenario',ScenarioName:'Abend'}]
    ]){
        warnings.length=0;
        const request={schemaVersion:1,targetId:'kitchen-light',requestId:'valid',action};
        const result=adapter({topic:'scheduler/command',payload:request});
        assert.deepEqual(result[0].payload,expected);
        assert.equal(result[0].schedulerRequest,request);
        assert.equal(result[1],null);
        assert.deepEqual(warnings,[]);
    }
});
