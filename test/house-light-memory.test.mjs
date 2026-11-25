import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import register from '../nodes/home-automation-house-lights.js';
import io from '../nodes/living-room-io.cjs';
import pwm from '../nodes/light-output-http.cjs';

test('Haus-Aus merkt nur gemeldete Lichtkreise, auch über ein wiederholtes Aus und einen Neustart',async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(),'house-memory-'));
    t.after(() => fs.rmSync(dir,{recursive:true,force:true}));
    let eastOn = true, entryOn = true;
    const commands = [];
    t.mock.method(io,'sample',async side => side === 'east' ? {
        [io.first]:{until:Date.now()+10000,outputs:eastOn ? 1 : 0}
    } : {});
    t.mock.method(io,'switchLight',async (id,on) => commands.push({id,on}));
    t.mock.method(globalThis,'fetch',async () => {throw Error('offline');});
    t.mock.method(pwm,'readKidOutputs',async () => { throw Error('offline'); });
    const routes = {}, sent = [];
    let HouseLights;
    register({
        settings:{userDir:dir},
        httpNode:{get(url,handler){routes[url]=handler;}},
        nodes:{
            registerType(type,ctor){HouseLights=ctor;},
            createNode(node){node.on=(type,handler)=>{node[type]=handler;}; node.send=outputs=>sent.push(outputs);},
            getNode(id){if(id==='vorraum_outputs')return {context:()=>({get:()=>({state:entryOn?'on':'off',validUntil:Date.now()+5000})})};}
        }
    });
    const node = new HouseLights({});
    const off = {topic:'house/lights',payload:false};
    await node.input({topic:'house/lights/restore'});
    assert.equal(sent.at(-1)[4].payload.available,false);
    await Promise.all([node.input(off),node.input(off)]);
    assert.equal(sent.filter(outputs=>outputs[0]).length,1);
    assert.deepEqual(sent.find(outputs=>outputs[0])[0],off);
    eastOn = entryOn = false;
    await node.input(off);
    node.close();
    const restarted = new HouseLights({});
    sent.length = 0;
    await restarted.input({topic:'house/lights/restore'});
    assert.deepEqual(commands,[{id:'down-1',on:true}]);
    assert.deepEqual(sent.filter(outputs=>outputs[1]).map(outputs=>outputs[1]),[{topic:'vorraum/set',payload:true}]);
    assert.ok(sent.every(outputs=>!outputs[0] && !outputs[2] && !outputs[3]));
    restarted.close();
});
