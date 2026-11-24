import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import controllerModule from '../lib/functions/generated/LightController.js';

const register=new Function('msg',fs.readFileSync('flow-src/flows/light-controller--light_controller_flow/functions/scheduler-kitchen-status.js','utf8'));
test('Küchenkatalog meldet aktuelle LED-Anzahl und editierbare Szenen mit ungedimmten Vorgaben',()=>{
    const c=new controllerModule.LightController({outputCount:8});
    c.process({Command:'SetDutyCycle',DutyCycle:10});
    const status=c.process({Command:'AddScenario',ScenarioName:'Abend',ScenarioProperties:{8:70}});
    const descriptor=register({payload:status})[0][0].payload;
    assert.equal(descriptor.channels,8);
    assert.deepEqual(descriptor.sceneLevels.Abend,[0,0,0,0,0,0,0,70]);
    assert.deepEqual(descriptor.editableScenes,['Abend']);
});
