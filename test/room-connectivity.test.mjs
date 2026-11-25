import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import health from '../nodes/room-connectivity.cjs';
import io from '../nodes/living-room-io.cjs';
import {kidHardware} from '../nodes/light-output-http.cjs';

function service(rows=[],kitchen=()=>({OutputCount:6,LedOutput:Array(6).fill(0)})){
    let handler;
    const RED={httpNode:{get(_,fn){handler=fn;}},nodes:{getNode(id){
        if(id==='ph_io_node')return {kidOutputRows:()=>rows};
        if(id==='vorraum_outputs')return {context:()=>({get:()=>({validUntil:Date.now()+5000,state:'off'})})};
    }}};
    health.register(RED,kitchen);
    return {RED,async read(room){
        let result;
        await handler({params:{room}},{set(){return this;},json(data){result=data;},sendStatus(code){result=code;}});
        return result;
    }};
}
const row=index=>({index,value:0,deviceState:'online',actualServer:'hub5000',quality:'live',lastRead:Date.now()});
test('Die Raum-API verlangt Rechner, Raumflow und physische Ausgänge, auch bei ausgeschaltetem Licht',async t=>{
    t.mock.method(globalThis,'fetch',async url=>({ok:true,json:async()=>url.includes('vorraum')?
        {room:'vorraum',probe:new URL(url).searchParams.get('probe')}:{on:true,brightness:50,scenario:'Abend',scenarios:['Abend']}}));
    const good=Array.from({length:5},(_,i)=>row(i));
    const {read}=service(good);
    assert.ok((await read('entry')).remainingMs>0);
    assert.ok((await read('kid')).remainingMs>0);
    assert.equal((await read('kitchen')).checks.io.state,'missing');
    assert.equal((await read('kitchen')).remainingMs,0);
    for(const change of [{lastRead:0},{actualServer:'picenter2'},{quality:'stale'},{deviceState:'offline'},{value:null}]){
        const broken=good.map(r=>r.index===4?{...r,...change}:r);
        const testService=service(broken);
        assert.equal(kidHardware(testService.RED).duty[4],null);
        const report=await testService.read('kid');
        assert.equal(report.remainingMs,0);
        assert.equal(report.checks.application.state,'up');
        assert.match(report.checks.io.detail,/Ausgang 4/);
    }
    assert.equal(await read('unknown'),404);
});
test('Eine USB-Karte allein bestätigt keine Anwendung. PIANTE-Abfragen werden für die vier Räume geteilt.',async t=>{
    let calls=0;
    t.mock.method(io,'sampleController',async side=>{
        calls++;
        return {cards:{'311893':{until:Date.now()+10000}},application:{listening:false,attached:[]}};
    });
    const {read}=service();
    for(const report of await Promise.all(['ante','upper','bath','wc'].map(read))){
        assert.equal(report.remainingMs,0);
        assert.equal(report.checks.host.state,'up');
        assert.equal(report.checks.application.state,'down');
        assert.equal(report.checks.io.state,'down');
    }
    assert.equal(calls,1);
});
test('Wallbox unterscheidet Stecker, Pause, Störung und abgelaufene Messung',()=>{
    const html=fs.readFileSync('flow-src/flows/wallbox--wallbox_flow/templates/wallbox.html','utf8');
    const code=html.slice(html.indexOf(' scope.plugLabels='),html.indexOf(' scope.states='));
    const scope={connection:{state:'online'},sample:{observed_at:new Date().toISOString()}};
    vm.runInNewContext(code,{scope});
    for(const [value,label] of ['unknown','disconnected','disconnected','connected','connected','connected','connected','unknown'].entries()){
        scope.sample.state=value;
        assert.equal(scope.plug(),label);
    }
    scope.sample.state=6;
    scope.sample.observed_at=new Date(Date.now()-91000).toISOString();
    assert.equal(scope.plug(),'unknown');
});
