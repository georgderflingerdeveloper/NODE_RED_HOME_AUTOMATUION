import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
function ui(){let receive;const sent=[],scope={$watch(_,fn){receive=fn;},send(msg){sent.push(msg);}};const html=fs.readFileSync('flow-src/flows/kosten--kosten_flow/templates/solaredge-comparison.html','utf8');vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],{scope,Date,Intl});return {scope,sent,receive,html};}
const from=Date.parse('2026-09-01T00:00:00Z'),H=3600000;
function response(requestId=1){const m=(l,c,valid=true)=>({localKwh:l,cloudKwh:c,localValid:valid});return {requestId,from:new Date(from).toISOString(),to:new Date(from+3*H).toISOString(),cloud:{configured:true},summary:{},intervals:[{from:new Date(from).toISOString(),to:new Date(from+H).toISOString(),metrics:{grid:m(1,1.1)}},{from:new Date(from+H).toISOString(),to:new Date(from+2*H).toISOString(),metrics:{grid:m(.1,2,false)}},{from:new Date(from+2*H).toISOString(),to:new Date(from+3*H).toISOString(),metrics:{grid:m(null,null,false)}}]};}
test('Vergleichsmenü: isolierte Abfragen, veraltete Antworten ignoriert, keine Geheimnisse im UI',()=>{
 const {scope,sent,receive,html}=ui();assert.equal(sent[0].payload.action,'solar-status');receive({topic:'history/solar/result',payload:{requestId:0,cloud:{configured:false}}});assert.equal(scope.cloud.configured,false);
 scope.form={from:'2026-09-01',to:'2026-09-02'};scope.compare();assert.equal(sent.at(-1).payload.from,'2026-09-01T00:00');assert.equal(sent.at(-1).payload.action,'solar-compare');assert.equal(scope.pending,true);
 receive({topic:'history/solar/result',payload:{requestId:0,error:'Alt'}});assert.equal(scope.pending,true);
 receive({topic:'history/solar/result',payload:response()});assert.equal(scope.pending,false);assert.equal(scope.result.intervals.length,3);
 receive({topic:'aWATTar/tariff/current',payload:{}});assert.equal(scope.result.intervals.length,3);assert.equal(scope.form.from,'2026-09-01');
 assert.ok(!html.includes('type="password"'));assert.match(html,/#78c8ff/);assert.match(html,/#d6a4ff/);assert.match(html,/limitTo:100:page\*100/);
});
test('Vergleichsdiagramm: getrennte Quellen, unvollständige lokale Werte, Cursor, Zoom und Slider',()=>{
 const {scope,receive}=ui();receive({topic:'history/solar/result',payload:response(0)});assert.ok(scope.graph.localPath);assert.ok(scope.graph.cloudPath);assert.ok(scope.graph.partialPath);
 const event=f=>({clientX:65+915*f,currentTarget:{getBoundingClientRect:()=>({left:0,width:1000})}});
 scope.hover(event(.5));assert.equal(scope.cursor.local,.1);assert.equal(scope.cursor.cloud,2);assert.equal(scope.cursor.partial,true);
 scope.hover(event(.9));assert.equal(scope.cursor.local,null);assert.equal(scope.cursor.cloud,null);
 scope.graph.position=1000;scope.slide();assert.equal(scope.graph.zoom,2);assert.equal(scope.graph.end,from+3*H);
 scope.pan(-1);assert.ok(scope.graph.start<from+1.5*H);scope.reset();assert.equal(scope.graph.start,from);assert.equal(scope.graph.end,from+3*H);
 assert.equal(scope.number(25.999,2),'26,00');assert.equal(scope.number(null,2),'—');assert.equal(scope.sourceName('cloud'),'Cloud · nachgeladen');
});
test('Vergleichsmenü: ungültiger Zeitraum sendet keine Abfrage; Fehler meldet Status',()=>{
 const {scope,sent,receive}=ui();scope.form={from:'2026-09-02',to:'2026-09-01'};scope.compare();assert.equal(sent.length,1);
 scope.form={from:'2026-09-01',to:'2026-09-02'};scope.compare();receive({topic:'history/solar/result',payload:{requestId:1,error:'Abfrage fehlgeschlagen'}});assert.equal(scope.pending,false);assert.equal(scope.message,'Abfrage fehlgeschlagen');
});
