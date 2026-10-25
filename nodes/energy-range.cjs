'use strict';
// Reine Auswertung: keine Datenbankänderungen. Zeitbereich ist [von, bis).
const HOUR=3600000;
function localInstant(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw Error('Datum/Uhrzeit: JJJJ-MM-TT und HH:MM erforderlich.');
 const nominal=Date.parse(value+'Z');
 if(!Number.isFinite(nominal)||new Date(nominal).toISOString().slice(0,16)!==value)throw Error('Ungültiges Datum.');
 const fmt=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Vienna',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const candidates=[];
 for(let offset=-14*60;offset<=14*60;offset+=15){const t=nominal-offset*60000;if(fmt.format(new Date(t)).replace(' ','T')===value)candidates.push(t);}
 if(candidates.length!==1)throw Error(candidates.length?'Uhrzeit ist durch die Winterzeitumstellung doppeldeutig. Bitte eine eindeutige Zeit vor oder nach der Umstellung wählen.':'Diese lokale Uhrzeit existiert wegen der Zeitumstellung nicht.');
 return candidates[0];
}
function parseRange(request){const from=localInstant(request.from),to=localInstant(request.to);if(to<=from)throw Error('Bis muss nach Von liegen.');if(to-from>366*24*HOUR)throw Error('Bitte höchstens 366 Tage wählen.');return {from,to};}
// Kompensierte Summation minimiert Rundungsfehler; gerundet wird ausschließlich im UI.
function sum(){let value=0,c=0;return {add(x){const y=x-c,t=value+y;c=(t-value)-y;value=t;},get value(){return value;}};}
// Eindeutige Tarifabschnitte; Konflikte und Lücken bleiben sichtbar (auch ohne Verbrauch).
function priceSeries(tariffs,from,to){
 const events=[];
 tariffs.forEach((t,id)=>{const a=Math.max(from,Date.parse(t.valid_from)),b=Math.min(to,Date.parse(t.valid_until));if(b>a){events.push({at:a,id,price:t.price_ct_kwh,start:true},{at:b,id,start:false});}});
 events.sort((a,b)=>a.at-b.at);const active=new Map(),result=[];let previous=from,i=0;
 while(i<events.length){const at=events[i].at;
  if(at>previous&&active.size===1){const price=active.values().next().value;if(typeof price==='number'&&Number.isFinite(price))result.push({from:previous,to:at,priceCtKwh:price});}
  while(i<events.length&&events[i].at===at){const e=events[i++];if(e.start)active.set(e.id,e.price);else active.delete(e.id);}
  previous=at;
 }
 return result;
}
function calculateRange(rows,tariffs,{from,to}){
 const warnings=new Set(),metrics={},segments=priceSeries(tariffs,from,to);
 for(const [name,key] of [['house','house_consumption_kwh'],['grid','grid_import_kwh']]){
  const energy=sum(),pricedEnergy=sum(),cost=sum(),localEnergy=sum(),cloudEnergy=sum();let cloudMs=0,localMs=0;let coverage=0,pricedMs=0,estimated=false,previousEnd=-Infinity;
  for(const row of [...rows].sort((a,b)=>Date.parse(a.interval_start)-Date.parse(b.interval_start))){
   const start=Date.parse(row.interval_start),end=Date.parse(row.interval_end),a=Math.max(from,start),b=Math.min(to,end);
   if(!(end>start&&b>a))continue;
   if(a<previousEnd)throw Error('Überlappende Energieintervalle: Auswertung abgebrochen.');previousEnd=b;
   const kwh=row[key];
   const source=row.source_by_metric&&row.source_by_metric[name];
   if(typeof kwh!=='number'||!Number.isFinite(kwh)||kwh<0||(source?source==='missing':row.energy_status!=='online'||!(row.sample_count>1))){warnings.add('Fehlende oder als offline markierte Energiedaten wurden ausgelassen.');continue;}
   coverage+=b-a;energy.add(kwh*(b-a)/(end-start));
   if(source==='cloud'){cloudEnergy.add(kwh*(b-a)/(end-start));cloudMs+=b-a;}else{localEnergy.add(kwh*(b-a)/(end-start));localMs+=b-a;}
   if(a!==start||b!==end){estimated=true;warnings.add('Teilstunden sind zeitanteilig geschätzt (gleichmäßiger Verbrauch innerhalb der Stunde).');}
   // Validated, nonoverlapping tariff segments allow long backfills without O(hours × tariffs).
   let lo=0,hi=segments.length;while(lo<hi){const mid=(lo+hi)>>>1;if(segments[mid].to<=a)lo=mid+1;else hi=mid;}
   let covered=0;
   for(let i=lo;i<segments.length&&segments[i].from<b;i++){
    const slot=segments[i],l=Math.max(a,slot.from),r=Math.min(b,slot.to);if(r<=l)continue;
    if(l>a||r<b){estimated=true;warnings.add('Tarifwechsel innerhalb eines Energieintervalls: Verbrauch zeitanteilig geschätzt.');}
    const e=kwh*(r-l)/(end-start);pricedEnergy.add(e);cost.add(e*slot.priceCtKwh/100);pricedMs+=r-l;covered+=r-l;
   }
   if(covered<b-a)warnings.add('Fehlende oder überlappende Tarife: Kosten nur für eindeutig bepreiste Abschnitte.');
  }
  metrics[name]={sources:{localKwh:localMs?localEnergy.value:null,cloudKwh:cloudMs?cloudEnergy.value:null,localCoveragePercent:localMs/(to-from)*100,cloudCoveragePercent:cloudMs/(to-from)*100},kwh:coverage?energy.value:null,pricedKwh:pricedMs?pricedEnergy.value:null,costEur:pricedMs?cost.value:null,priceCtKwh:pricedEnergy.value>0?cost.value*100/pricedEnergy.value:null,coveragePercent:coverage/(to-from)*100,pricedCoveragePercent:pricedMs/(to-from)*100,estimated,complete:coverage===to-from&&pricedMs===to-from};
 }
 if(Object.values(metrics).some(m=>m.sources.cloudCoveragePercent>0))warnings.add('Erkannte Erfassungslücken wurden mit separat gespeicherten SolarEdge-Cloud-Stundenwerten ergänzt.');
 warnings.add('Stundenwerte sind integrierte Messwerte; der Online-Status beweist keine lückenlose Erfassung innerhalb der Stunde.');
 if(Object.values(metrics).some(m=>!m.complete))warnings.add('Teilergebnis: keine vollständige Aussage über den gesamten Zeitraum.');
 return {from:new Date(from).toISOString(),to:new Date(to).toISOString(),timeZone:'Europe/Vienna',priceSeries:segments,metrics,warnings:[...warnings],basis:'Stundenwerte; reine Energiepreise ohne Netzgebühren, Steuern und Zuschläge.'};
}
module.exports={localInstant,parseRange,calculateRange};
