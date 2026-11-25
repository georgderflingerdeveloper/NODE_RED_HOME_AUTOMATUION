import assert from 'node:assert/strict';
import test from 'node:test';
import {runFunctionNode, getNodeDefinition} from './helpers/function-node-harness.mjs';

test('Vorraum und Hausgruppe wählen exakt eine gerichtete Lampenanforderung',async()=>{
    for (const topic of ['vorraum/set','house/lights']) {
        for (const on of [true,false]) {
            const {result}=await runFunctionNode('vorraum_command',{msg:{topic,payload:on}});
            assert.deepEqual(result,{payload:on?'ENTRY-LIGHT-ON':'ENTRY-LIGHT-OFF'});
        }
    }
    for(const msg of [{topic:'room/outputs',payload:true},{topic:'vorraum/set',payload:'false'}]) {
        assert.equal((await runFunctionNode('vorraum_command',{msg})).result,null);
    }
    const target=getNodeDefinition('vorraum_lamp_udp');
    assert.equal(target.addr,'192.168.0.190');
    assert.equal(Number(target.port),5020);
});
