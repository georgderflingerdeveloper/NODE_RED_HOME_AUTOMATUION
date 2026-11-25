import assert from 'node:assert/strict';
import test from 'node:test';
import controllerModule from '../lib/functions/generated/LightController.js';
import { runFunctionNode } from './helpers/function-node-harness.mjs';

function submit(store, levels = [60, 0, 20, 0, 0, 10]) {
    return runFunctionNode('lightcontrollerkitchen', {
        msg: {
            sceneCreationId: 'kitchen-wizard-1',
            payload: {
                Command: 'AddScenario', ScenarioName: 'Abendessen',
                ScenarioProperties: Object.fromEntries(levels.map((level, i) => [i + 1, level])),
            },
        },
        globalValues: { LightControllerModule: controllerModule },
        contextValues: { lightControllerKitchenScenarioStore: store },
    });
}

test('Küchendialog bestätigt erst den gespeicherten Entwurf und schützt vorhandene Namen', async () => {
    let saved;
    const store = { load: () => saved, save: (_, config) => { saved = config; } };
    const { result } = await submit(store);
    assert.equal(result.sceneCreationId, 'kitchen-wizard-1');
    assert.equal(result.payload.Event, 'scenario_added');
    assert.equal(result.payload.ScenarioName, 'Abendessen');
    const previous = new controllerModule.LightController(saved).getOutput();
    assert.deepEqual(previous.ScenarioProperties, { 1: 60, 3: 20, 6: 10 });
    const duplicate = await submit(store, Array(6).fill(100));
    assert.equal(duplicate.result.payload.Event, 'scenario_create_failed');
    assert.deepEqual(duplicate.result.payload.ScenarioProperties, previous.ScenarioProperties);
});

test('Speicherfehler und veränderte Kanalzahl lassen keine teilweise angelegte Küchenszene zurück', async () => {
    const store = { load: () => null, save: () => { throw Error('Schreibfehler'); } };
    for (const levels of [Array(6).fill(60), [20]]) {
        const { result, flow } = await submit(store, levels);
        assert.equal(result.payload.Event, 'scenario_create_failed');
        assert.ok(result.payload.CommandResult);
        assert.ok(result.payload.ScenarioList.every(s => s.ScenarioName !== 'Abendessen'));
        assert.equal(flow.get('LightControllerKitchenConfiguration'), undefined);
    }
});

test('Wiederherstellen prüft die gemerkten LED-Stufen vor der Ausgabe', async () => {
    let config;
    const store = {load:()=>config,save:(_,value)=>{config=value;}};
    const scene = (await submit(store)).result.payload;
    const request = outputs => runFunctionNode('lightcontrollerkitchen',{
        msg:{topic:'house/kitchen/restore',payload:{outputs,state:scene.PersistentState}},
        globalValues:{LightControllerModule:controllerModule},
        contextValues:{lightControllerKitchenScenarioStore:store}
    });
    assert.equal((await request([1,1,1,1,1,1])).result,null);
    const restored = (await request(scene.LedOutput)).result;
    assert.deepEqual(restored.payload.LedOutput,scene.LedOutput);
    assert.equal(restored.payload.PersistentStateChanged,true);
});
