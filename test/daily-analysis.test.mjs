import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze, dueDay, markdown} from '../nodes/daily-analysis.cjs';
import {loadPatterns} from '../nodes/day-load-patterns.cjs';
import {localInstant} from '../nodes/energy-range.cjs';
const hour=3600000;
test('Tageslauf berücksichtigt Wien, Nachholen und beide Zeitumstellungen',()=>{
 for(const [day,next,count] of [['2026-03-29','2026-03-30',23],['2026-10-25','2026-10-26',25]]){
  const from=localInstant(day+'T00:00'),to=localInstant(next+'T00:00');
  assert.equal(analyze(day,from,to,[],[],[]).hours.length,count);
  assert.equal(dueDay(localInstant(next+'T06:05')),day);
  assert.notEqual(dueDay(localInstant(next+'T06:04')),day);
 }
});
test('Kosten bewerten Netzbezug auch bei Negativpreisen und weisen fehlende Preise aus',()=>{
 const day='2026-11-15',from=localInstant(day+'T00:00'),start=new Date(from).toISOString(),end=new Date(from+hour).toISOString();
 const row={interval_start:start,interval_end:end,house_consumption_kwh:4,grid_import_kwh:2,pv_energy_kwh:2,grid_export_kwh:0,source_by_metric:{grid:'local',house:'local',pv:'local',export:'local'}};
 const report=analyze(day,from,from+2*hour,[row],[{provider:'Testtarif',valid_from:start,valid_until:end,price_ct_kwh:-10}],[]);
 assert.equal(report.hours[0].cost,-.2);assert.equal(report.hours[1].cost,null);assert.match(report.notes.join(' '),/50 % des Tages bepreist/);
 report.patterns=['Zu wenig Messdaten'];assert.match(markdown(report,'Kurzfassung','Lokale Kennzahlen'),/Haus kWh/);
 assert.match(report.notes.join(' '),/keine Meldungen gespeichert/);
});
test('Lastmuster erkennen begrenzte Heizphase und gleichmäßige Dauerlast, ohne Lücken zu überbrücken',()=>{
 const from=Date.UTC(2026,10,19),len=1440;
 function pattern(load){
  const rows=Array.from({length:len},(_,i)=>({observed_at:new Date(from+i*60000).toISOString(),online:load(i)!==null,house_consumption_w:load(i)}));
  return loadPatterns(rows,from,from+24*hour).join(' ');
 }
 const detected=pattern(i=>i>=100&&i<170?3900:i>=400&&i<412?2200:200);
 assert.match(detected,/Grundlast rund 200 W/);assert.match(detected,/Mögliche Autoladung/);assert.match(detected,/Mögliche Heizphase/);
 assert.doesNotMatch(pattern(i=>i===130?null:i>=100&&i<160?3900:200),/Mögliche Autoladung/);
 assert.match(pattern(i=>i<400?0:null),/reichen für eine Schätzung nicht aus/);
});

import {periodFor,closedPeriod,nextAutomatic} from '../nodes/analysis-periods.cjs';
import {summarizePeriod} from '../nodes/daily-analysis.cjs';
test('Wochen und Monate werden nach Tagesabschluss vollständig archiviert, Zwischenstände bleiben fällig',()=>{
 const weekly=closedPeriod('week','2027-01-03');
 assert.equal(weekly.start,'2026-12-28');assert.equal(weekly.through,'2027-01-03');
 assert.equal(closedPeriod('month','2028-03-01').end,'2028-02-29');
 const due='2026-11-30',archive=new Map([[due,due],['woche-2026-11-23','2026-11-29'],['monat-2026-11-01','2026-11-23']]);
 assert.equal(nextAutomatic(due,due,archive).key,'monat-2026-11-01');archive.set('monat-2026-11-01',due);
 assert.equal(nextAutomatic(due,due,archive),undefined);
});
test('Monatssumme behält fehlende Teilkosten bei und vergleicht Tage mit vollständiger Abdeckung',()=>{
 const p=periodFor('month','2026-11-02'),reports=[];
 for(const [date,kwh,cost] of [['2026-11-01',4,1],['2026-11-02',null,null]]){
  const d=localInstant(date+'T00:00');const r=analyze(date,d,d+24*hour,[],[],[]);
  r.hours[0].house=kwh;r.hours[0].cost=cost;r.hours[0].priced=cost===null?0:100;r.patterns=[];reports.push(r);
 }
 const report=summarizePeriod(p,reports);
 assert.match(report.notes.join(' '),/4 kWh über 1 von 48 Stunden/);
 assert.equal(report.days[1].cost,null);assert.match(report.notes.join(' '),/1 € mit bepreisten Werten für 1 von 48 Stunden/);
 assert.ok(!report.notes.some(n=>n.startsWith('Höchster Verbrauch')));
 assert.match(markdown(report,'Text','Test'),/## Tageswerte/);
});
