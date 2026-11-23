import assert from 'node:assert/strict';
import test from 'node:test';
import {EventEmitter} from 'node:events';
import register from '../nodes/solaredge-reconnect-countdown.js';

function setup(t) {
    const events = new EventEmitter(), shared = new Map(), outputs = [];
    t.mock.timers.enable({apis:['Date','setInterval'],now:200000});
    let Node;
    register({events,nodes:{
        registerType(_,ctor){Node=ctor;},
        createNode(node){
            const emitter=new EventEmitter();
            node.on=emitter.on.bind(emitter);node.emit=emitter.emit.bind(emitter);
            node.context=()=>({global:shared});node.status=()=>{};node.send=msg=>outputs.push(msg);
        }
    }});
    const node = new Node({});
    const input = msg=>node.emit('input',msg,node.send,()=>{});
    const commands=()=>outputs.map(o=>o[0]).filter(Boolean);
    return {events,node,shared,input,commands,outputs};
}

test('Deploy und Dashboard-Reload teilen einen Countdown mit genau einem Reconnect',t=>{
    const {events,shared,input,commands,outputs}=setup(t);
    events.emit('flows:started');
    assert.match(outputs.at(-1)[1].payload,/10 s/);
    t.mock.timers.tick(4000);input({payload:'connect'});
    assert.match(outputs.at(-1)[1].payload,/6 s/);
    t.mock.timers.tick(5999);assert.equal(commands().length,0);
    t.mock.timers.tick(1);assert.deepEqual(commands(),[{topic:'modbus-reconnect',payload:true}]);
    assert.equal(shared.get('SolarEdgeReconnectDueMs'),0);
    input({payload:'connect'});assert.match(outputs.at(-1)[1].payload,/15 s/);
    t.mock.timers.tick(15000);assert.equal(commands().length,2);
});

test('Tabwechsel ignorieren, manuell verbinden und beim Stoppen Timer freigeben',t=>{
    const {events,node,input,commands,outputs}=setup(t);
    input({payload:'change'});assert.equal(outputs.length,0);
    input({payload:'connect'});input({topic:'modbus-reconnect',payload:true});
    t.mock.timers.tick(20000);assert.equal(commands().length,1);
    events.emit('flows:started');node.emit('close');
    assert.equal(events.listenerCount('flows:started'),0);
    t.mock.timers.tick(20000);assert.equal(commands().length,1);
});
