import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
function ui(now){let receive;const sent=[];const scope={$watch(_,fn){receive=fn;},$on(){},send(m){sent.push(m);}};const source=fs.readFileSync('flow-src/flows/kosten--kosten_flow/templates/cost-dashboard.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];vm.runInNewContext(source,{scope,window:{addEventListener(){},removeEventListener(){}},document:{querySelector(){return null;},addEventListener(){},removeEventListener(){}},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},Date:now?class extends Date{constructor(...args){super(...(args.length?args:[now]));}}:Date,Intl,Event:class{}});return {scope,sent,receive};}
test('Zeige sendet genau eine Abfrage; Live-Update erhält Eingaben und alte Antworten werden ignoriert',()=>{const {scope,sent,receive}=ui();scope.rangeForm={fromDate:'2026-09-01',fromTime:'12:30',toDate:'2026-09-02',toTime:'13:45'};const before=sent.length;scope.showRange();assert.equal(sent.length,before+1);assert.equal(sent.at(-1).payload.from,'2026-09-01T12:30');receive({topic:'aWATTar/tariff/current',payload:{}});assert.equal(scope.rangeForm.fromTime,'12:30');scope.showRange();receive({topic:'history/range/result',payload:{requestId:1,error:'Alt'}});assert.equal(scope.rangePending,true);receive({topic:'history/range/result',payload:{requestId:2,error:'Aktuell'}});assert.equal(scope.rangeError,'Aktuell');assert.equal(scope.rangePending,false);});
test('Monatsentwurf wird nicht durch Live-Tarif überschrieben; Speichern ist explizit',()=>{const {scope,sent,receive}=ui();scope.billMonth='2026-09';scope.loadBill();receive({topic:'history/bill/result',payload:{requestId:1,bill:{month:'2026-09',kwh:'10',totalEur:'5',energyEur:'',note:'',revision:1},comparison:{}}});scope.billDraft.totalEur='6';const before=sent.length;receive({topic:'aWATTar/tariff/current',payload:{}});assert.equal(scope.billDraft.totalEur,'6');assert.equal(sent.length,before);scope.saveBill();assert.equal(sent.at(-1).payload.bill.totalEur,'6');});

test('Kalendervorgaben berücksichtigen Wiener Monatswechsel und senden erst bei Zeige',()=>{
 const {scope,sent}=ui('2026-03-31T22:30:00Z');
 const initial=sent.length;scope.showRange();
 assert.equal(sent.at(-1).payload.from,'2026-03-31T00:00');
 assert.equal(sent.at(-1).payload.to,'2026-04-01T00:00');
 scope.setRangePreset('lastMonth');assert.equal(sent.length,initial+1);
 scope.showRange();assert.equal(sent.at(-1).payload.from,'2026-03-01T00:00');assert.equal(sent.at(-1).payload.to,'2026-04-01T00:00');
 scope.setRangePreset('today');scope.showRange();assert.equal(sent.at(-1).payload.to,'2026-04-01T00:30');
 scope.loadBill();assert.equal(sent.at(-1).payload.month,'2026-03');
});
test('Unvollständige und umgekehrte Eingaben senden keine Abfrage',()=>{
 const {scope,sent}=ui();const n=sent.length;
 scope.rangeForm={};scope.showRange();assert.equal(sent.length,n);assert.match(scope.rangeError,/vollständig/);
 scope.rangeForm={fromDate:'2026-10-20',fromTime:'00:00',toDate:'2026-10-19',toTime:'00:00'};
 scope.showRange();assert.equal(sent.length,n);
});

test('Preisfarben: Grenzwerte, negative Preise und unbekannte Werte',()=>{
 const {scope}=ui();
 for(const [value,expected] of [[-5,'cheap'],[0,'cheap'],[22,'cheap'],[22.001,'medium'],[25,'medium'],[25.001,'high'],[30,'high'],[30.001,'expensive'],[null,'unknown'],[undefined,'unknown'],[NaN,'unknown'],[Infinity,'unknown'],['20','unknown']]) {
  assert.equal(scope.priceClass(value),'price-'+expected,String(value));
 }
});
test('Kostensummen werden nach kWh gewichtet; unvollständige Daten bleiben neutral',()=>{
 const {scope}=ui();
 const row={recordedHourCount:2,offlineCount:0,houseConsumptionKWh:100,energyCostEur:20,gridImportKWh:2,gridImportCostEur:0.6};
 assert.equal(scope.rowUnitPrice(row,false),20);
 assert.equal(scope.rowUnitPrice(row,true),30);
 assert.equal(scope.priceClass(scope.rowUnitPrice(row,false)),'price-cheap');
 for(const change of [{offlineCount:1},{recordedHourCount:0},{houseConsumptionKWh:0},{energyCostEur:null}])assert.equal(scope.rowUnitPrice({...row,...change},false),null);
});

test('Preisdiagramm: Zeitbereich, negative Preise, Lücken, Cursor und Zoomnavigation',()=>{
 const {scope,receive,sent}=ui();const from=Date.parse('2026-10-25T00:00:00Z'),H=3600000;
 const payload={requestId:0,from:new Date(from).toISOString(),to:new Date(from+4*H).toISOString(),metrics:{grid:{priceCtKwh:15}},priceSeries:[{from,to:from+H,priceCtKwh:-5},{from:from+H,to:from+2*H,priceCtKwh:0},{from:from+3*H,to:from+4*H,priceCtKwh:35}]};
 receive({topic:'history/range/result',payload});const count=sent.length;scope.togglePriceChart();
 assert.equal(scope.chart.lines.length,2);assert.equal(scope.chart.average,15);assert.equal(scope.chart.lines[0].color,'#a4f6a0');assert.equal(scope.chart.lines[1].color,'#ff9292');assert.ok(scope.chart.lines[1].path.startsWith('M'));
 const event=f=>({clientX:70+910*f,currentTarget:{getBoundingClientRect:()=>({left:0,width:1000})}});
 scope.priceChartCursor(event(.125));assert.equal(scope.chart.cursor.price,-5);assert.match(scope.chart.cursor.label,/UTC\+2|GMT\+2/);
 scope.priceChartCursor(event(.375));assert.equal(scope.chart.cursor.price,0);assert.match(scope.chart.cursor.label,/UTC\+1|GMT\+1/);
 scope.priceChartCursor(event(.625));assert.equal(scope.chart.cursor.price,null);assert.match(scope.chart.cursor.label,/Tariflücke/);
 scope.priceChartCursor(event(1));assert.equal(scope.chart.cursor.price,35);
 scope.zoomPriceChart(2);assert.equal(scope.chart.zoom,2);assert.equal(scope.chart.end-scope.chart.start,2*H);
 scope.chart.position=1000;scope.slidePriceChart();assert.equal(scope.chart.end,from+4*H);
 scope.panPriceChart(-.5);assert.ok(scope.chart.end<from+4*H);
 for(let i=0;i<20;i++)scope.zoomPriceChart(2);assert.equal(scope.chart.zoom,128);
 let prevented=false;scope.priceChartKey({key:'Home',preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(scope.chart.zoom,1);
 assert.equal(scope.chart.start,from);assert.equal(scope.chart.end,from+4*H);assert.equal(sent.length,count);
 receive({topic:'aWATTar/tariff/current',payload:{priceCtPerKWh:99}});assert.equal(scope.chart.average,15);
 scope.showRange();assert.equal(scope.priceChartOpen,false);
});
test('Preisdiagramm ohne Tarife oder Verbrauch bleibt bedienbar',()=>{
 const {scope,receive}=ui();receive({topic:'history/range/result',payload:{requestId:0,from:'2026-10-01T00:00:00Z',to:'2026-10-02T00:00:00Z',metrics:{grid:{priceCtKwh:null}},priceSeries:[]}});
 scope.togglePriceChart();scope.zoomPriceChart(2);assert.equal(scope.chart.lines.length,0);assert.equal(scope.chart.average,null);assert.equal(scope.chart.yTicks.length,5);
});
test('Lange Preisverläufe erzeugen höchstens vier SVG-Pfade',()=>{
 const {scope,receive}=ui();const from=Date.parse('2026-01-01T00:00:00Z'),step=900000;
 const priceSeries=Array.from({length:35040},(_,i)=>({from:from+i*step,to:from+(i+1)*step,priceCtKwh:[15,24,28,35][i%4]}));
 receive({topic:'history/range/result',payload:{requestId:0,from:new Date(from).toISOString(),to:new Date(from+35040*step).toISOString(),priceSeries,metrics:{}}});
 assert.equal(scope.chart.lines.length,4);scope.zoomPriceChart(2);assert.equal(scope.chart.lines.length,4);
});
test('Slider verschiebt direkt aus der Gesamtansicht und normalisiert den Eingabewert',()=>{
 const {scope,receive}=ui();const from=Date.parse('2026-10-01T00:00:00Z'),to=from+24*3600000;
 receive({topic:'history/range/result',payload:{requestId:0,from:new Date(from).toISOString(),to:new Date(to).toISOString(),metrics:{},priceSeries:[]}});
 scope.slidePriceChart(1000);assert.equal(scope.chart.zoom,2);assert.equal(scope.chart.end,to);assert.equal(scope.chart.start,from+12*3600000);
 scope.slidePriceChart('0');assert.equal(scope.chart.start,from);
 scope.slidePriceChart(500.7);assert.equal(scope.chart.position,501);assert.ok(scope.chart.start>from);
 scope.slidePriceChart(9999);assert.equal(scope.chart.position,1000);assert.equal(scope.chart.end,to);
 const html=fs.readFileSync('flow-src/flows/kosten--kosten_flow/templates/cost-dashboard.html','utf8');
 assert.match(html,/ng-change="slidePriceChart\(chart.position\)"/);
 assert.doesNotMatch(html.match(/<input class="cost-chart-slider"[^>]*>/)[0],/ng-disabled/);
});
