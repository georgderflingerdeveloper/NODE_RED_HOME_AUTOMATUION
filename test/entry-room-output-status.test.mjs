import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {runFunctionNode, getNodeDefinition} from './helpers/function-node-harness.mjs';

function reading(on, changes={}) {
    return {serial:'311883',index:0,type:'Digital Output',server:'pientry',actualServer:'pientry',
        quality:'live',deviceState:'online',boolean:on,value:on?100:0,lastRead:Date.now(),...changes};
}
async function display(rows,topic='phidgets/io'){
    const {result}=await runFunctionNode('vorraum_outputs',{msg:{topic,payload:{io:true,rows}}});
    return result?.payload.devices;
}
test('Vorraum liest ausschließlich den zugeordneten binären Ausgang',async()=>{
    for(const on of [true,false]){
        const devices=await display([reading(!on,{index:1}),reading(on)]);
        assert.deepEqual(devices.map(d=>[d.id,d.kind,d.state]),[['vorraum-licht','light',on?'on':'off']]);
    }
    assert.equal(await display([reading(true)],'presence/motion'),undefined);
    for(const change of [{serial:'1234'},{index:1},{actualServer:'pieast'},{server:'piwest'},{type:'Digital Input'},
        {deviceState:'offline'},{quality:'stale'},{lastRead:Date.now()-10100},{lastRead:Date.now()+60000},
        {boolean:null},{value:0},{value:50}]){
        assert.equal((await display([reading(true,change)]))[0].state,'unknown');
    }
    assert.equal((await display([]))[0].state,'unknown');
    assert.deepEqual(getNodeDefinition('vorraum_outputs_ui').wires,[['vorraum_command']]);
});
test('Virtuelle Lampe verfällt ohne neue Nachricht und erholt sich mit gültiger Rückmeldung',()=>{
    const html=fs.readFileSync('flow-src/flows/system-phidget-discovery--ph_discovery_tab/templates/room-output-indicators.html','utf8');
    const script=html.match(/<script>([\s\S]+?)<\/script>/)[1];
    let now=1000,render,timer,closed;
    const scope={$watch:(_,f)=>{render=f;},$evalAsync:f=>f(),$on:(_,f)=>{closed=f;}};
    vm.runInNewContext(script,{scope,Date:{now:()=>now},setTimeout:(fn,ms)=>{timer={fn,ms};return 1;},clearTimeout:()=>{timer=null;}});
    scope.msg={payload:{devices:[{id:'a',state:'on',validUntil:1010}]}};render();
    assert.equal(scope.devices[0].state,'on');assert.equal(timer.ms,10);
    now=1010;timer.fn();assert.equal(scope.devices[0].state,'unknown');
    scope.msg.payload.devices=[{id:'a',state:'off',validUntil:2010}];render();
    assert.equal(scope.devices[0].state,'off');closed();assert.equal(timer,null);
});

test('Schalten wartet auf eine neue passende Ausgangslesung und meldet eine fehlende Bestätigung',()=>{
    const html=getNodeDefinition('vorraum_outputs_ui').format;
    const script=html.match(/<script>([\s\S]+?)<\/script>/)[1];
    const sent=[];
    let now=1000, update;
    const scope={
        $watch(_,fn){update=fn;}, $evalAsync(fn){fn();}, $on(){}, send(msg){sent.push(msg);}
    };
    vm.runInNewContext(script,{scope,Date:{now:()=>now},setTimeout:()=>1,clearTimeout(){}});
    function read(state,sampledAt) {
        scope.msg={payload:{devices:[{id:'vorraum-licht',state,sampledAt,validUntil:sampledAt+10000}]}};
        update();
    }
    read('off',now);
    scope.setLight(true);
    scope.setLight(false);
    assert.equal(sent.length,1);
    assert.equal(scope.lampState,'off');
    read('on',now);
    assert.ok(scope.pending);
    now+=1000;
    read('on',now);
    assert.equal(scope.pending,null);
    assert.equal(scope.notice,'Ein bestätigt.');
    scope.setLight(false);
    now+=10001;
    update();
    assert.equal(scope.ready,false);
    assert.equal(scope.notice,'Keine Bestätigung vom Lampenausgang.');
    scope.setLight(true);
    assert.equal(sent.length,2);
});
