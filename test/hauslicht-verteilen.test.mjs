import assert from 'node:assert/strict';
import test from 'node:test';
import {runFunctionNode, getNodeDefinition} from './helpers/function-node-harness.mjs';

const route = (topic, payload) => runFunctionNode('46c0d0f8.ce014',{msg:{topic,payload}});
test('Beide Haustasten senden feste Lichtzustände über die jeweiligen Raumsteuerungen',async()=>{
    for (const on of [true,false]) {
        const {result} = await route('house/lights',on);
        assert.deepEqual(result,[
            {topic:'house/lights',payload:on},
            {topic:'light-controller/dashboard',payload:{Command:on?'AllLightsOn':'AllLightsOff'}},
            {topic:'georgszimmer/set',payload:{type:on?'on':'off'}},
            {topic:'sissi/light',payload:on}
        ]);
    }
    assert.equal((await route('room/outputs',true)).result,null);
    assert.equal((await route('house/lights','false')).result,null);
    const [widgetOutputs] = getNodeDefinition('f141cad7.25f818').wires;
    assert.deepEqual(widgetOutputs,['house_light_memory']);
    assert.deepEqual(getNodeDefinition('house_light_memory').wires[0],['46c0d0f8.ce014']);
});
