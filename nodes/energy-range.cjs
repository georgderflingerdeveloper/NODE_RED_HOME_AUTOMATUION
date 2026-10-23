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
function calculateRange(rows,tariffs,{from,to}){
 const warnings=new Set(),metrics={};
 for(const [name,key] of [['house','house_consumption_kwh'],['grid','grid_import_kwh']]){
  const energy=sum(),pricedEnergy=sum(),cost=sum();let coverage=0,pricedMs=0,estimated=false,previousEnd=-Infinity;
  for(const row of [...rows].sort((a,b)=>Date.parse(a.interval_start)-Date.parse(b.interval_start))){
   const start=Date.parse(row.interval_start),end=Date.parse(row.interval_end),a=Math.max(from,start),b=Math.min(to,end);
   if(!(end>start&&b>a))continue;
   if(a<previousEnd)throw Error('Überlappende Energieintervalle: Auswertung abgebrochen.');previousEnd=b;
   const kwh=row[key];
   if(typeof kwh!=='number'||!Number.isFinite(kwh)||kwh<0||row.energy_status!=='online'||!(row.sample_count>1)){warnings.add('Fehlende oder als offline markierte Energiedaten wurden ausgelassen.');continue;}
   coverage+=b-a;energy.add(kwh*(b-a)/(end-start));
   if(a!==start||b!==end){estimated=true;warnings.add('Teilstunden sind zeitanteilig geschätzt (gleichmäßiger Verbrauch innerhalb der Stunde).');}
   const slots=tariffs.filter(t=>Date.parse(t.valid_from)<b&&Date.parse(t.valid_until)>a);
   const cuts=[...new Set([a,b,...slots.flatMap(t=>[Math.max(a,Date.parse(t.valid_from)),Math.min(b,Date.parse(t.valid_until))])])].sort((x,y)=>x-y);
   if(cuts.length>2){estimated=true;warnings.add('Tarifwechsel innerhalb eines Energieintervalls: Verbrauch zeitanteilig geschätzt.');}
   for(let i=1;i<cuts.length;i++){
    const l=cuts[i-1],r=cuts[i],active=slots.filter(t=>Date.parse(t.valid_from)<=l&&Date.parse(t.valid_until)>=r);
    if(active.length!==1||typeof active[0].price_ct_kwh!=='number'||!Number.isFinite(active[0].price_ct_kwh)){warnings.add('Fehlende oder überlappende Tarife: Kosten nur für eindeutig bepreiste Abschnitte.');continue;}
    const e=kwh*(r-l)/(end-start);pricedEnergy.add(e);cost.add(e*active[0].price_ct_kwh/100);pricedMs+=r-l;
   }
  }
  metrics[name]={kwh:coverage?energy.value:null,pricedKwh:pricedMs?pricedEnergy.value:null,costEur:pricedMs?cost.value:null,priceCtKwh:pricedEnergy.value>0?cost.value*100/pricedEnergy.value:null,coveragePercent:coverage/(to-from)*100,pricedCoveragePercent:pricedMs/(to-from)*100,estimated,complete:coverage===to-from&&pricedMs===to-from};
 }
 warnings.add('Stundenwerte sind integrierte Messwerte; der Online-Status beweist keine lückenlose Erfassung innerhalb der Stunde.');
 if(Object.values(metrics).some(m=>!m.complete))warnings.add('Teilergebnis: keine vollständige Aussage über den gesamten Zeitraum.');
 return {from:new Date(from).toISOString(),to:new Date(to).toISOString(),timeZone:'Europe/Vienna',metrics,warnings:[...warnings],basis:'Stundenwerte; reine Energiepreise ohne Netzgebühren, Steuern und Zuschläge.'};
}
module.exports={localInstant,parseRange,calculateRange};
