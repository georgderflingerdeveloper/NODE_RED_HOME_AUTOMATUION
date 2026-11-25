import assert from 'node:assert/strict';
import test from 'node:test';
import {EventEmitter} from 'node:events';
import register from '../nodes/solaredge-reconnect-countdown.js';

function setup(initialState) {
    const events = new EventEmitter(), shared = new Map(), commands = [];
    const client = Object.assign(new EventEmitter(), {
        actualServiceState: {value:initialState},
        messageAllowedStates:['connected','activated','sending','queueing','empty'],
        reconnectDelay:120000
    });
    let Node;
    register({events,nodes:{
        getNode(){ return client; },
        registerType(_,ctor){ Node=ctor; },
        createNode(node){
            const emitter=new EventEmitter();
            node.on=emitter.on.bind(emitter); node.emit=emitter.emit.bind(emitter);
            node.context=()=>({global:shared});
        }
    }});
    const node=new Node({server:'solar'});
    const input=msg=>node.emit('input',msg,outputs=>commands.push(outputs[0]),()=>{});
    function change(state,event) {
        client.actualServiceState.value=state;
        client.emit(event);
    }
    return {node,events,shared,input,commands,change,client};
}

test('Start, Dashboard-Reload und Tabwechsel lösen in keinem Transportzustand einen Reconnect aus',()=>{
    for (const state of ['init','connected','activated','reconnecting','broken']) {
        const {events,input,commands}=setup(state);
        events.emit('flows:started');
        input({payload:'connect'}); input({payload:'change'}); input({payload:'connect'});
        assert.deepEqual(commands,[]);
    }
});

test('Manueller Neuaufbau benötigt einen bestätigten Befehl und eine getrennte Verbindung',()=>{
    const {input,change,commands}=setup('reconnecting');
    const request={topic:'modbus-reconnect',payload:true};
    input({...request,payload:false});
    input(request);
    change('init','mbinit'); input(request);
    change('connected','mbconnected'); input(request);
    for (const state of ['activated','queueing','sending','empty']) {
        change(state,'mbqueue'); input(request);
    }
    const restart={topic:'node-red-restart',payload:true}; input(restart);
    assert.deepEqual(commands,[request,restart]);
});

test('Nur der Transport meldet die Wartezeit, die beim nächsten Versuch und bei Erfolg endet',t=>{
    t.mock.timers.enable({apis:['Date'],now:200000});
    const {node,shared,client,change}=setup('activated');
    assert.equal(shared.get('SolarEdgeTransportState'),'connected');
    change('broken','mbbroken');
    assert.equal(shared.get('SolarEdgeTransportState'),'disconnected');
    change('reconnecting','mbreconnecting');
    assert.equal(shared.get('SolarEdgeTransportRetryDueMs'),320000);
    change('init','mbinit');
    assert.equal(shared.get('SolarEdgeTransportState'),'connecting');
    assert.equal(shared.get('SolarEdgeTransportRetryDueMs'),0);
    change('connected','mbconnected');
    assert.equal(shared.get('SolarEdgeTransportState'),'connected');
    node.emit('close');
    assert.equal(client.listenerCount('mbreconnecting'),0);
});
