'use strict';
const { DatabaseSync } = require('node:sqlite');
const { localInstant, calculateRange } = require('./energy-range.cjs');
const { effectiveRows, METRICS } = require('./solaredge-cloud.cjs');
const {shiftDay,names} = require('./analysis-periods.cjs');
const {loadPatterns} = require('./day-load-patterns.cjs');
const {Worker, isMainThread, parentPort, workerData}=require('node:worker_threads');
const HOUR = 3600000;
const zone = 'Europe/Vienna';
const localDate = new Intl.DateTimeFormat('sv-SE', {timeZone:zone, dateStyle:'short'});
const clock = new Intl.DateTimeFormat('de-AT', {timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const iso = t => new Date(t).toISOString();
const fmt = (n, digits=2) => n == null ? '—' : n.toLocaleString('de-AT',{maximumFractionDigits:digits});
function dueDay(time) { return shiftDay(localDate.format(time), clock.format(time) < '06:05' ? -2 : -1); }
function median(numbers) {
    const sorted = numbers.slice().sort((a,b)=>a-b), mid = Math.floor(sorted.length/2);
    return sorted.length%2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
}
function collect(file, day, siteId='') {
    const from = localInstant(day+'T00:00'), to = localInstant(shiftDay(day,1)+'T00:00');
    const prior = localInstant(shiftDay(day,-14)+'T00:00'), db = new DatabaseSync(file,{readOnly:true});
    try {
        db.exec('PRAGMA busy_timeout=3000; BEGIN');
        const rows = db.prepare('SELECT * FROM hourly_snapshots WHERE interval_start>=? AND interval_start<? ORDER BY interval_start').all(iso(prior),iso(to));
        const coverage = db.prepare('SELECT interval_start,covered_ms FROM local_energy_coverage WHERE interval_start>=? AND interval_start<?').all(iso(prior),iso(to));
        const cloud = db.prepare('SELECT interval_start,interval_end,metric,kwh FROM solaredge_cloud_energy WHERE site_id=? AND interval_start>=? AND interval_start<?').all(siteId,iso(prior),iso(to));
        const all = effectiveRows(rows,cloud.map(c=>({...c,start:Date.parse(c.interval_start),end:Date.parse(c.interval_end)})),new Map(coverage.map(r=>[r.interval_start,r.covered_ms])));
        const tariffs = db.prepare('SELECT valid_from,valid_until,provider,price_ct_kwh FROM tariff_slots WHERE valid_from<? AND valid_until>? ORDER BY valid_from').all(iso(to),iso(from));
        const events = db.prepare('SELECT detector,CAST(event_ms/? AS INTEGER)*? AS hour,count(*) AS n,min(event_ms) AS first,max(event_ms) AS last FROM presence_event WHERE event_ms>=? AND event_ms<? GROUP BY detector,hour ORDER BY hour,detector').all(HOUR,HOUR,from,to);
        const samples=db.prepare('SELECT observed_at,online,house_consumption_w FROM solar_power_samples WHERE observed_at>=? AND observed_at<? ORDER BY observed_at').all(iso(from),iso(to));
        const report=analyze(day,from,to,all,tariffs,events);
        report.patterns=loadPatterns(samples,from,to);
        return report;
    } finally { db.close(); }
}
function analyze(day,from,to,all,tariffs,events) {
    const today = new Map(all.filter(r=>Date.parse(r.interval_start)>=from).map(r=>[r.interval_start,r]));
    const history = all.filter(r=>Date.parse(r.interval_start)<from && r.source_by_metric.house!=='missing');
    const hours = [];
    for(let start=from;start<to;start+=HOUR){
        const row=today.get(iso(start)), range={from:start,to:start+HOUR};
        const priced=calculateRange(row?[row]:[],tariffs,range);
        const h={utc:iso(start),period:clock.format(start)+'–'+clock.format(start+HOUR),cost:priced.metrics.grid.costEur,priced:priced.metrics.grid.pricedCoveragePercent, sources:row?.source_by_metric||{}};
        for(const [name,key] of Object.entries(METRICS)) h[name]=row && h.sources[name]!=='missing' ? row[key] : null;
        const samples=history.filter(r=>clock.format(Date.parse(r.interval_start))===clock.format(start)).map(r=>r.house_consumption_kwh);
        h.normal=samples.length>=3 ? median(samples) : null;
        const span=priced.priceSeries.reduce((n,s)=>n+s.to-s.from,0);
        h.price=span===HOUR ? priced.priceSeries.reduce((n,s)=>n+(s.to-s.from)/HOUR*s.priceCtKwh,0) : null;
        hours.push(h);
    }
    const measured=hours.filter(h=>Number.isFinite(h.house));
    const peak=measured.reduce((p,h)=>!p||h.house>p.house?h:p,null);
    const same=measured.filter(h=>h.normal!==null);
    const sum=(rows,key)=>rows.reduce((n,r)=>n+r[key],0);
    const costs=calculateRange([...today.values()],tariffs,{from,to}).metrics.grid;
    const basis=[...new Set(tariffs.map(t=>t.provider))].join(', ') || 'kein gespeicherter Tarif';
    const notes=[];
    notes.push(measured.length ? 'Hausverbrauch '+fmt(sum(measured,'house'))+' kWh in '+measured.length+' von '+hours.length+' Stunden. Spitze '+peak.period+' Uhr mit '+fmt(peak.house)+' kWh.' : 'Hausverbrauch: keine verwertbaren Stundenwerte.');
    const solarTotals=[];
    for(const [key,label] of [['pv','PV-Erzeugung'],['export','Einspeisung']]){
        const values=hours.filter(h=>Number.isFinite(h[key]));
        solarTotals.push(label+' '+(values.length?fmt(sum(values,key))+' kWh in '+values.length+' von '+hours.length+' Stunden':'ohne verwertbare Messung'));
    }
    notes.push(solarTotals.join(', ')+'.');
    if(same.length>=hours.length/2){
        const expected=sum(same,'normal'),actual=sum(same,'house');
        if(expected>0) notes.push('In '+same.length+' vergleichbaren Stunden lag der Verbrauch '+fmt(Math.abs(actual/expected-1)*100,0)+' % '+(actual>=expected?'über':'unter')+' dem Vergleichswert (Median je Uhrzeit, bis zu 14 Vortage).');
    }
    notes.push(costs.costEur===null ? 'Stromkosten: kein bepreister Netzbezug verfügbar.' : 'Netzbezug: '+fmt(costs.pricedKwh)+' kWh für '+fmt(costs.costEur)+' € reine Energiekosten ('+basis+', '+fmt(costs.pricedCoveragePercent,1)+' % des Tages bepreist). Grundpreis, Netzentgelte und weitere Abgaben sind ausgenommen.');
    const imported=hours.filter(h=>h.price!==null && h.grid>0).sort((a,b)=>b.price-a.price)[0];
    const cheapest=hours.filter(h=>h.price!==null).sort((a,b)=>a.price-b.price)[0];
    const surplus=hours.filter(h=>h.export>0).sort((a,b)=>b.export-a.export)[0];
    if(imported && cheapest && imported.price-cheapest.price>=0.1)
        notes.push('Verschiebbarer Netzbezug: '+imported.period+' Uhr kostete '+fmt(imported.price)+' ct/kWh, '+cheapest.period+' Uhr '+fmt(cheapest.price)+' ct/kWh. Rechnerische Differenz '+fmt(imported.price-cheapest.price)+' ct pro verschobener kWh an diesem Tag.');
    else if(surplus) notes.push('Mögliches Zeitfenster für verschiebbare Lasten: '+surplus.period+' Uhr mit '+fmt(surplus.export)+' kWh gemessener Einspeisung. Eine Einspeisevergütung ist hier nicht eingerechnet.');
    const detectors=new Map();
    for(const e of events){if(!detectors.has(e.detector))detectors.set(e.detector,[]);detectors.get(e.detector).push(e);}
    const motion=[];
    for(const [name,records] of detectors) motion.push(name+' '+clock.format(records[0].first)+'–'+clock.format(records.at(-1).last)+' Uhr ('+sum(records,'n')+' Meldungen)');
    notes.push('Bewegung: '+(motion.length?motion.join(', ')+'.':'keine Meldungen gespeichert.')+' Die Personenzahl lässt sich aus den Meldern nicht bestimmen.');
    const quietWindows=[];
    if(detectors.size){
        const first=Math.max(...[...detectors.values()].map(r=>r[0].first)),last=Math.min(...[...detectors.values()].map(r=>r.at(-1).last));
        const windows=hours.map(h=>Date.parse(h.utc)).filter(t=>t>=first && t+2*HOUR<=last).map(t=>({t,n:sum(events.filter(e=>e.hour>=t && e.hour<t+2*HOUR),'n')}));
        for(const win of windows)quietWindows.push({hour:clock.format(win.t),to:clock.format(win.t+2*HOUR),count:win.n});
        const quiet=windows.sort((a,b)=>a.n-b.n)[0];
        if(quiet) notes.push('Meldungsärmstes Zweistundenfenster zwischen den ersten und letzten Meldungen der aktiven Melder: '+clock.format(quiet.t)+'–'+clock.format(quiet.t+2*HOUR)+' Uhr, '+quiet.n+' registrierte Auslösungen. Stille Meldezeiten können auch Erfassungslücken sein.');
    }
    const tip=notes.find(n=>n.startsWith('Verschiebbarer')||n.startsWith('Mögliches Zeitfenster')) || 'Für einen konkreten Verschiebetipp fehlen eindeutige Preisunterschiede oder gemessene PV-Überschüsse.';
    return {day,hours,notes,events,quietWindows,basis,tip,insight:notes[0],hasData:measured.length>0 || events.length>0 || costs.costEur!==null};
}
function reportHeader(report,summary,source){
    const p=report.period,title=p?names[p.type]:'Tagesauswertung';
    return ['# GEORGSHOME · '+title,'','Auswertung: '+source,'Zeitraum: '+(p?p.start:report.day)+' bis '+(p?p.through:report.day),
        '','## Kurzfassung','',summary,'','## Praktischer Tipp','',report.tip,'','## Erkenntnis','',report.insight];
}
function markdown(report, summary, source) {
    if(report.days)return periodMarkdown(report,summary,source);
    const rows=report.hours.map(h=>[h.utc,h.period,h.house,h.pv,h.grid,h.export,h.cost,h.priced,h.price, Object.entries(h.sources).map(([k,v])=>k+'='+v).join(', ')].map(v=>v==null?'—':typeof v==='number'?Number(v.toFixed(5)):v).join(' | '));
    const motion=report.events.map(e=>[e.detector,iso(e.hour),e.n,clock.format(e.first),clock.format(e.last)].join(' | '));
    return [...reportHeader(report,summary,source),'','## Berechnete Tageskennzahlen','',...report.notes.map(n=>'- '+n),'','## Grundlast und mögliche Gerätezeiten','',...report.patterns.map(n=>'- '+n),'','## Stundenwerte','','Ortszeit Europe/Vienna. UTC kennzeichnet jede Stunde eindeutig. Fehlende Messwerte sind mit — markiert. Kosten beziehen sich auf den bepreisten Netzbezug. Tarifbasis: '+report.basis+'.','',
        'UTC Beginn | Ortszeit | Haus kWh | PV kWh | Bezug kWh | Einspeisung kWh | Bezug EUR | Bepreist % | Tarif ct/kWh | Quellen','--- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---',...rows,'','## Bewegungsmeldungen je Melder und Stunde','','Melder | UTC Beginn | Meldungen | Erste Ortszeit | Letzte Ortszeit','--- | --- | ---: | --- | ---',...motion,''].join('\n');
}
function collectPeriod(file,p,siteId){
    if(p.type==='day')return {...collect(file,p.start,siteId),period:p};
    const days=[];
    for(let day=p.start;day<=p.through;day=shiftDay(day,1))days.push(collect(file,day,siteId));
    return summarizePeriod(p,days);
}
function summarizePeriod(p,reports){
    const sum=(rows,key)=>rows.reduce((n,r)=>n+(r[key]??0),0);
    const days=reports.map(r=>{
        const house=r.hours.filter(h=>Number.isFinite(h.house)),priced=r.hours.filter(h=>Number.isFinite(h.cost));
        const grid=r.hours.filter(h=>h.grid!==null),pv=r.hours.filter(h=>h.pv!==null),feed=r.hours.filter(h=>h.export!==null);
        return {date:r.day,hours:r.hours.length,measured:house.length,house:house.length?sum(house,'house'):null,
            pv:pv.length?sum(pv,'pv'):null,feed:feed.length?sum(feed,'export'):null,
            grid:grid.length?sum(grid,'grid'):null,cost:priced.length?sum(priced,'cost'):null,
            pricedHours:sum(r.hours,'priced')/100,motion:sum(r.events,'n'),patterns:r.patterns.filter(n=>n.startsWith('Mögliche '))};
    });
    const hours=sum(days,'hours'),seen=sum(days,'measured'),priced=sum(days,'pricedHours');
    const measuredDays=days.filter(d=>d.measured>0),fullDays=days.filter(d=>d.measured===d.hours);
    const peak=fullDays.sort((a,b)=>b.house-a.house)[0];
    const notes=[seen?'Hausverbrauch '+fmt(sum(days,'house'))+' kWh über '+seen+' von '+hours+' Stunden. Messwerte an '+measuredDays.length+' von '+days.length+' Tagen.':'Keine verwertbaren Hausverbrauchsdaten im Zeitraum.',
        priced?'Reine Netzbezugskosten '+fmt(sum(days,'cost'))+' € mit bepreisten Werten für '+fmt(priced)+' von '+hours+' Stunden. Ohne Grundpreis, Netzentgelte und weitere Abgaben. Tarifbasis: '+[...new Set(reports.filter(r=>r.hours.some(h=>h.priced>0)).map(r=>r.basis))].join(', ')+'.':'Keine bepreisten Netzbezugsdaten im Zeitraum.'];
    if(days.some(d=>d.pv!==null))notes.push('Gemessene PV-Erzeugung '+fmt(sum(days,'pv'))+' kWh, für '+reports.flatMap(r=>r.hours).filter(h=>h.pv!==null).length+' Stunden.');
    if(days.some(d=>d.feed!==null))notes.push('Gemessene Einspeisung '+fmt(sum(days,'feed'))+' kWh, für '+reports.flatMap(r=>r.hours).filter(h=>h.export!==null).length+' Stunden.');
    if(peak)notes.push('Höchster Verbrauch unter den '+fullDays.length+' vollständig erfassten Tagen: '+peak.date+' mit '+fmt(peak.house)+' kWh.');
    const events=reports.flatMap(r=>r.events);
    if(events.length)notes.push(sum(events,'n')+' registrierte Bewegungsmeldungen an '+days.filter(d=>d.motion>0).length+' Tagen. Die Personenzahl ist aus diesen Auslösungen nicht bestimmbar.');
    const quietCounts=new Map();
    for(const r of reports){
        const oncePerDay=new Map((r.quietWindows||[]).map(w=>[w.hour+'–'+w.to,w.count]));
        for(const [period,count] of oncePerDay){if(!quietCounts.has(period))quietCounts.set(period,[]);quietCounts.get(period).push(count);}
    }
    const minDays=Math.max(3,Math.ceil(days.filter(d=>d.motion>0).length*.75));
    const quiet=[...quietCounts].filter(([,counts])=>counts.length>=minDays).sort((a,b)=>median(a[1])-median(b[1])||b[1].length-a[1].length)[0];
    if(quiet)notes.push('Meldungsarmes Zweistundenfenster '+quiet[0]+' Uhr: Median '+fmt(median(quiet[1]),1)+' Auslösungen bei '+quiet[1].length+' vergleichbaren Tagen. Grundlage sind Zeitfenster zwischen den ersten und letzten Meldungen der beteiligten Melder.');
    const byHour=new Map();
    for(const r of reports)for(const h of r.hours)if(h.price!==null){
        const key=clock.format(Date.parse(h.utc));
        if(!byHour.has(key))byHour.set(key,new Map());
        const prices=byHour.get(key);
        if(!prices.has(r.day))prices.set(r.day,[]);
        prices.get(r.day).push(h.price);
    }
    // Compare hours on identical days so missing tariffs do not create a savings signal.
    let best;
    for(const [high,hvals] of byHour)for(const [low,lvals] of byHour){
        if(high===low)continue;
        const differences=[...hvals].filter(([day])=>lvals.has(day)).map(([day,prices])=>median(prices)-median(lvals.get(day)));
        if(differences.length<3)continue;
        const delta=median(differences);
        if(delta>=1 && (!best || delta>best.delta))best={high,low,delta,n:differences.length};
    }
    const tip=best?'Verschiebbare Geräte: Um '+best.low+' Uhr lag der Stundenpreis im Median '+fmt(best.delta)+' ct/kWh unter dem Preis um '+best.high+' Uhr ('+best.n+' Vergleichstage). Vor dem nächsten Start den aktuellen Tarif prüfen.':'Für einen belastbaren Zeitvergleich werden unterschiedliche Stundenpreise an mindestens drei gemeinsamen Tagen benötigt.';
    const bases=reports.map(r=>r.patterns[0]?.match(/Grundlast rund (\d+) W/)).filter(Boolean).map(m=>Number(m[1]));
    const patterns=[];
    if(bases.length)patterns.push('Typische geschätzte Grundlast '+fmt(median(bases),0)+' W (Median von '+bases.length+' auswertbaren Tagen).');
    const eligible=reports.filter(r=>r.patterns.some(n=>n.startsWith('Geschätzte Grundlast')));
    if(eligible.length){
        const count=label=>eligible.filter(r=>r.patterns.some(n=>n.startsWith(label))).length;
        patterns.push('Lastmuster für mögliche Autoladungen an '+count('Mögliche Autoladung')+' von '+eligible.length+' auswertbaren Tagen; mögliche Waschmaschinen-Heizphasen an '+count('Mögliche Heizphase')+' Tagen. Die geschätzten Zeitfenster sind im Markdown-Bericht aufgelistet. Andere Geräte können dieselben Muster erzeugen.');
    }else patterns.push('Für Grundlast und mögliche Gerätezeiten reichen die Minutenwerte nicht aus.');
    return {day:p.start+' bis '+p.through,period:p,days,notes,tip,insight:peak?notes.find(n=>n.startsWith('Höchster')):notes[0],patterns,hasData:reports.some(r=>r.hasData)||bases.length>0};
}
function periodMarkdown(report,summary,source){
    return [...reportHeader(report,summary,source),'','## Berechnete Kennzahlen','',...report.notes.map(n=>'- '+n),'','## Grundlast und mögliche Gerätezeiten','',...report.patterns.map(n=>'- '+n),'','## Tageswerte','',
        'Tag | Erfasste Hausstunden / Tag | Haus kWh | PV kWh | Bezug kWh | Einspeisung kWh | Netzbezug EUR | Bepreiste Stunden | Bewegungsmeldungen','--- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---:',
        ...report.days.map(d=>[d.date,d.measured+' / '+d.hours,...[d.house,d.pv,d.grid,d.feed,d.cost,d.pricedHours].map(v=>v===null?'—':Number(v.toFixed(4))),d.motion].join(' | ')),
        '','## Geschätzte Gerätefenster je Tag','',...report.days.filter(d=>d.patterns.length).map(d=>'- '+d.date+' · '+d.patterns.join(' ')),
        '','Zeitzone Europe/Vienna. Fehlende Energiewerte sind mit — markiert. Eine leere Meldezeit erlaubt keinen Rückschluss auf die Anwesenheit.',''].join('\n');
}
// Keep the read transaction and signal processing off the Node-RED control loop.
function collectAsync(file,period,siteId,signal){
    return new Promise((resolve,reject)=>{
        const worker=new Worker(__filename,{workerData:{file,period,siteId}});
        const stop=()=>worker.terminate();
        signal.addEventListener('abort',stop,{once:true});
        if(signal.aborted)stop();
        worker.once('message',resolve);
        worker.once('error',reject);
        worker.once('exit',code=>{
            signal.removeEventListener('abort',stop);
            if(code!==0)reject(Error('Messwertauswertung unterbrochen.'));
        });
    });
}
if(!isMainThread && workerData?.file)parentPort.postMessage(collectPeriod(workerData.file,workerData.period,workerData.siteId));
module.exports={collect,collectAsync,collectPeriod,summarizePeriod,analyze,markdown,localDate,shiftDay,dueDay};
