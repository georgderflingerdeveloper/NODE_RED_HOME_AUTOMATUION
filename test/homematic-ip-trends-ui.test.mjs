import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const start=Date.parse('2026-10-20T00:00:00Z'),M=60000,H=3600000;
const meta=(id,point,unit='°C',kind='temperature')=>({id,deviceId:'d1',deviceName:'Raum',rooms:'EG',point,label:point,unit,kind,states:[],lastAt:start+3*M,latestValue:25,latestText:null});
const actual=meta('actual','1.actualTemperature'),target=meta('target','1.setPointTemperature'),humidity=meta('humidity','1.humidity','%','number');
function ui(){const sent=[],timers=new Map();let receive,cleanup,timerId=0;const scope={$id:42,$watch(_,fn){receive=fn;},$on(_,fn){cleanup=fn;},send(m){sent.push(m);}};
 const html=fs.readFileSync('flow-src/flows/homematic-ip--hmip_flow/templates/homematic-ip-trends.html','utf8');vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],{scope,Date,Intl,setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);}});
 const flush=()=>{const fns=[...timers.values()];timers.clear();fns.forEach(fn=>fn());};return {scope,sent,receive,html,flush,destroy:()=>cleanup()};
}
function catalog(u,list=[actual,target,humidity]){const request=u.sent.filter(m=>m.topic.endsWith('/catalog')).at(-1);u.receive({topic:'homematic-ip/history/catalog/result',payload:{requestId:request.payload.requestId,series:list,retentionDays:365,intervalMs:M}});}
function result(u){const request=u.sent.filter(m=>m.topic.endsWith('/query')).at(-1);const series=[actual,target].filter(s=>request.payload.seriesIds.includes(s.id)).map((s,i)=>({...s,points:[{at:start,value:20+i},{at:start+M,value:22+i},{at:start+2*M,value:null,breakBefore:true},{at:start+3*M,value:25+i,breakBefore:true}],stats:{count:3,min:20+i,max:25+i,average:22+i}}));u.receive({topic:'homematic-ip/history/query/result',payload:{requestId:request.payload.requestId,from:start,to:start+H,series,bucketMs:1000,retentionDays:365,intervalMs:M}});}
test('Homematic-Trends: dynamischer Katalog, Soll/Ist-Vorauswahl und kompatible Trendwahl',()=>{
 const u=ui();assert.equal(u.sent[0].topic,'homematic-ip/history/catalog');catalog(u);assert.deepEqual(Array.from(u.scope.selectedIds()),['actual','target']);assert.equal(u.scope.devices.length,1);result(u);assert.equal(u.scope.graph.temperature,true);assert.equal(u.scope.graph.lines.length,2);assert.equal(u.scope.graph.lines[1].dash,'8 4');assert.match(u.scope.graph.lines[0].stroke,/url\(#hmip-heat-/);
 u.scope.selected.humidity=true;u.scope.selectTrend(humidity);assert.equal(u.scope.selected.humidity,false);assert.match(u.scope.error,/gleicher Einheit/);
 u.scope.clearTrends();u.receive({topic:'homematic-ip/state',payload:{status:'running',lastSuccess:1}});catalog(u);assert.equal(u.scope.selectedIds().length,0);
});
test('Homematic-Trends: Cursor zeigt Originalmessung, Lücken und Temperaturfarben',()=>{
 const u=ui();catalog(u);result(u);const event=t=>({clientX:75+905*(t-start)/H,currentTarget:{getBoundingClientRect:()=>({left:0,width:1000})}});
 u.scope.hover(event(start+M));assert.equal(u.scope.plotted[0].cursorValue,22);assert.equal(u.scope.plotted[0].cursorAt,start+M);
 u.scope.hover(event(start+2*M));assert.equal(u.scope.plotted[0].cursorValue,null);
 assert.equal(u.scope.temperatureColor(-5),u.scope.temperatureColor(0));assert.equal(u.scope.temperatureColor(35),u.scope.temperatureColor(50));assert.notEqual(u.scope.temperatureColor(0),u.scope.temperatureColor(35));
 assert.equal(u.scope.valueText(actual,0,null),'0,00 °C');assert.equal(u.scope.valueText({...actual,kind:'binary'},0,null),'Nein / Aus');assert.equal(u.scope.valueText({...actual,kind:'state',states:['CLOSED']},0,'CLOSED'),'Geschlossen');
 assert.ok((u.scope.graph.lines[0].path.match(/M /g)||[]).length>=3);
});
test('Homematic-Trends: Slider direkt bedienbar, Zoom lädt detailliert, alte Antworten ignoriert',()=>{
 const u=ui();catalog(u);result(u);const old=u.sent.at(-1).payload.requestId;u.scope.graph.position=1000;u.scope.slide();assert.equal(u.scope.graph.zoom,2);assert.equal(u.scope.graph.start,start+H/2);u.flush();const request=u.sent.at(-1);assert.equal(request.payload.mode,'window');assert.equal(request.payload.from,start+H/2);assert.equal(request.payload.to,start+H);
 u.receive({topic:'homematic-ip/history/query/result',payload:{requestId:old,error:'Alt'}});assert.notEqual(u.scope.error,'Alt');assert.equal(u.scope.pending,true);
 u.scope.pan(-.5);u.flush();assert.ok(u.sent.at(-1).payload.from<start+H/2);
 let prevented=false;u.scope.graphKey({key:'Home',preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(u.scope.graph.zoom,1);u.destroy();const before=u.sent.length;u.flush();assert.equal(u.sent.length,before);
});
test('Homematic-Trends: Historie bleibt bei Live-Updates unverändert; Live wird nachgeladen',()=>{
 const u=ui();catalog(u);result(u);u.scope.form.mode='history';const before=u.sent.filter(m=>m.topic.endsWith('/query')).length;
 u.receive({topic:'homematic-ip/state',payload:{status:'running',lastSuccess:123,historyError:''}});catalog(u);assert.equal(u.sent.filter(m=>m.topic.endsWith('/query')).length,before);assert.equal(u.scope.base.from,start);
 u.scope.useLive();assert.equal(u.sent.at(-1).payload.mode,'live');u.receive({topic:'homematic-ip/state',payload:{status:'error',lastSuccess:123,historyError:'Speicherfehler'}});catalog(u);assert.equal(u.scope.historyError,'Speicherfehler');assert.equal(u.sent.at(-1).payload.mode,'live');
 u.scope.form.mode='history';Object.assign(u.scope.form,{fromDate:'2026-10-21',fromTime:'00:00',toDate:'2026-10-20',toTime:'00:00'});const count=u.sent.length;u.scope.loadBase();assert.equal(u.sent.length,count);assert.match(u.scope.error,/Bis muss/);
});
