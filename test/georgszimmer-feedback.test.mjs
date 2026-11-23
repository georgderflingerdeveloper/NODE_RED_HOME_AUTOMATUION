import assert from 'node:assert/strict';
import test from 'node:test';
import { runFunctionNode } from './helpers/function-node-harness.mjs';
test('register capabilities after a PLC response and reject failed commands',async()=>{
    const msg={statusCode:200,requestId:'t',payload:{on:false,brightness:30,scenario:'Abend',scenarios:['Manuell','Abend']}};
    const {result}=await runFunctionNode('georg_room_feedback',{msg});
    assert.deepEqual(result[1][0].payload.scenarios,msg.payload.scenarios);
    assert.equal(result[1][1].payload.ok,true);
    msg.statusCode=503;
    const {result:failed}=await runFunctionNode('georg_room_feedback',{msg});
    assert.equal(failed[1].length,1);
    assert.equal(failed[1][0].payload.ok,false);
});
