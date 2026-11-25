'use strict';
const {DatabaseSync} = require('node:sqlite');
const {existsSync} = require('node:fs');
const {localInstant} = require('./energy-range.cjs');
const {shiftDay} = require('./analysis-periods.cjs');
const {rangeSummary} = require('./wallbox-billing.cjs');

const titles = {charging:'Wallbox-Ladungen', meter:'Smartmeter', heating:'Homematic-Heizwerte'};
const number = (n, digits=2) => n.toLocaleString('de-AT',{maximumFractionDigits:digits});
const when = new Intl.DateTimeFormat('de-AT',{timeZone:'Europe/Vienna',dateStyle:'short',timeStyle:'short'});
const iso = t => new Date(t).toISOString();
const available = (db, table) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);

function charging(db, start, through, from, to) {
    if (!available(db,'wallbox_price_parts')) return [];
    const {vehicles, comparison} = rangeSummary(db,start,through);
    const minutes = db.prepare(`SELECT count(DISTINCT substr(observed_at,1,16)) AS n FROM wallbox_samples
        WHERE observed_at>=? AND observed_at<?`).get(iso(from),iso(to)).n;
    const lines = [];
    if (minutes) lines.push('Wallbox-Messungen in '+number(minutes)+' von '+number((to-from)/60000)+' Minuten.');
    for (const row of vehicles.filter(v=>v.count)) {
        const label = row.vehicle==='Offen'?'Ohne Fahrzeugzuordnung':row.vehicle;
        const energy = number(row.kwh)+' kWh aus '+row.count+(row.count===1?' Ladung':' Ladungen')+' im Berichtszeitraum.';
        const cost = row.eur===null?'Kein Tarif für diese Ladeenergie.':
            number(row.kwh-row.missing)+' kWh zum archivierten Stromtarif bewertet: '+number(row.eur)+' €.';
        lines.push(label+' · '+energy+' '+cost+(row.missing>0 && row.eur!==null?' Für '+number(row.missing)+' kWh fehlt der Tarif.':''));
    }
    if (minutes && !vehicles.some(v=>v.count)) lines.push('Für den Zeitraum ist kein Ladeenergiezuwachs archiviert.');
    if (comparison.count) lines.push('Hyundai-Vergleich für '+comparison.count+' im Zeitraum beendete Ladung(en) mit App-Eintrag: Wallbox '+number(comparison.wallbox_kwh)+' kWh, myHyundai '+number(comparison.app_kwh)+' kWh.');
    return lines;
}

function smartmeter(db, from, to) {
    if (!available(db,'smartmeter_samples')) return [];
    const bounds = [iso(from),iso(to)];
    const stats = db.prepare(`SELECT count(*) AS samples, count(DISTINCT substr(observed_at,1,16)) AS minutes,
        min(frequency) AS low, max(frequency) AS high, max(abs(current_l1)) AS l1,
        max(abs(current_l2)) AS l2, max(abs(current_l3)) AS l3 FROM smartmeter_samples WHERE observed_at>=? AND observed_at<?`).get(...bounds);
    if (!stats.samples) return [];
    const lines = [number(stats.samples)+' Messpunkte in '+number(stats.minutes)+' von '+number((to-from)/60000)+' Minuten.'];
    for (const [label,order] of [['Netzbezug','ASC'],['Einspeisung','DESC']]) {
        const peak = db.prepare(`SELECT grid_power, observed_at FROM smartmeter_samples
            WHERE observed_at>=? AND observed_at<? AND grid_power IS NOT NULL
            ORDER BY grid_power ${order}, observed_at LIMIT 1`).get(...bounds);
        if (!peak) break;
        const watts = order==='ASC'?-peak.grid_power:peak.grid_power;
        lines.push(watts>0?'Höchster gemessener Wert für '+label+': '+number(watts/1000,3)+' kW am '+when.format(new Date(peak.observed_at))+' Uhr.':
            'Kein Messpunkt mit '+label+'.');
    }
    const phases = ['l1','l2','l3'].filter(p=>stats[p]!==null).map(p=>p.toUpperCase()+' '+number(stats[p])+' A');
    if (phases.length) lines.push('Höchster gemessener Strom je Phase: '+phases.join(', ')+'.');
    if (stats.low!==null) lines.push('Gemessene Netzfrequenz: '+number(stats.low)+' bis '+number(stats.high)+' Hz.');
    return lines;
}

function heating(file, from, to) {
    if (!file || !existsSync(file)) return [];
    const db = new DatabaseSync(file,{readOnly:true});
    const fields = {setPointTemperature:'Sollwert',actualTemperature:'Raumfühler',valveActualTemperature:'Heizkörperfühler',valvePosition:'Ventilöffnung'};
    try {
        db.exec('PRAGMA busy_timeout=3000');
        const rows = db.prepare(`SELECT s.device_id,s.device_name,s.rooms,s.point_name,s.unit,
            min(p.value) AS low,max(p.value) AS high,count(DISTINCT CAST(p.observed_at/3600000 AS INTEGER)) AS hours
            FROM series s JOIN samples p ON p.series_id=s.id
            WHERE p.observed_at>=? AND p.observed_at<? AND p.quality='current' AND p.value IS NOT NULL
            AND (s.unit='°C' OR s.unit='%') GROUP BY s.id ORDER BY s.rooms,s.device_name,s.point_name`).all(from,to);
        const devices = new Map();
        for (const row of rows) {
            const key = row.point_name.split('.').pop();
            if (!Object.hasOwn(fields,key)) continue;
            if (!devices.has(row.device_id)) devices.set(row.device_id,{name:[row.rooms,row.device_name].filter(Boolean).join(' · '),values:[]});
            const range = row.low===row.high?number(row.low):number(row.low)+'–'+number(row.high);
            devices.get(row.device_id).values.push(fields[key]+' '+range+' '+row.unit+' ('+row.hours+'/'+((to-from)/3600000)+' Std.)');
        }
        return [...devices.values()].map(d=>d.name+': '+d.values.join(', ')+'.');
    } finally { db.close(); }
}

const missing = {charging:'Keine auswertbaren Wallbox-Daten im Zeitraum.',meter:'Keine Smartmeter-Messpunkte im Zeitraum.',heating:'Keine aktuellen Homematic-Heizwerte im Zeitraum archiviert.'};
function measurementTopics(file, temperatureFile, start, through) {
    const from = localInstant(start+'T00:00'), to = localInstant(shiftDay(through,1)+'T00:00');
    const db = new DatabaseSync(file,{readOnly:true});
    let chargingLines, meterLines;
    try {
        db.exec('PRAGMA busy_timeout=3000; BEGIN');
        chargingLines = charging(db,start,through,from,to);
        meterLines = smartmeter(db,from,to);
    } finally { db.close(); }
    let heatingLines, heatingIssue;
    try { heatingLines = heating(temperatureFile,from,to); }
    catch { heatingLines=[]; heatingIssue='Das Homematic-Heizarchiv konnte nicht gelesen werden.'; }
    const lines = {charging:chargingLines,meter:meterLines,heating:heatingLines};
    return Object.entries(titles).map(([key,name])=>({key,name,hasData:lines[key].length>0,
        lines:lines[key].length?lines[key]:[key==='heating' && heatingIssue || missing[key]]}));
}
module.exports = {measurementTopics,titles};
