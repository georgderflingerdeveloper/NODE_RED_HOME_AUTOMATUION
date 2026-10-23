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
