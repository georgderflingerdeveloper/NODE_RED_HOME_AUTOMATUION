import assert from 'node:assert/strict';
import test from 'node:test';
import { runFunctionNode } from './helpers/function-node-harness.mjs';
test('only addressed scheduler actions reach the Georgszimmer controller',async()=>{
    const msg={topic:'scheduler/command',payload:{schemaVersion:1,targetId:'kitchen-light',action:{type:'off'},requestId:'t'}};
    assert.equal((await runFunctionNode('georg_room_request',{msg})).result,null);
    msg.payload.targetId='georgszimmer-light';
    const {result}=await runFunctionNode('georg_room_request',{msg});
    assert.equal(result.requestId,'t');
    assert.deepEqual(result.payload,{type:'off'});
});
