'use strict';
const {DatabaseSync}=require('node:sqlite');
const path=require('node:path');
const {existsSync}=require('node:fs');
const {localInstant}=require('./energy-range.cjs');
const {shiftDay}=require('./analysis-periods.cjs');
const hour=3600000;
const local=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Vienna',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'});
const fmt=n=>n.toLocaleString('de-AT',{minimumFractionDigits:1,maximumFractionDigits:1});
const mean=values=>values.reduce((sum,v)=>sum+v,0)/values.length;
const missing='Für diesen Zeitraum fehlen auswertbare Temperaturmessungen.';

function profile(rows,start,through){
    const rooms=new Map();
    for(const row of rows){
        if(!Number.isFinite(row.value))continue;
        const [date,h]=local.format(row.bucket*hour).split(' ');
        if(date<start || date>through)continue;
        for(const name of String(row.rooms||'').split(',').map(s=>s.trim()).filter(Boolean)){
            if(!rooms.has(name))rooms.set(name,new Map());
            const series=rooms.get(name), kind=row.point_name.split('.').pop();
            if(!series.has(kind))series.set(kind,new Map());
            const hours=series.get(kind);
            if(!hours.has(row.bucket))hours.set(row.bucket,{date,night:Number(h)<6,values:[]});
            hours.get(row.bucket).values.push(row.value);
        }
    }
    const notes=[];
    function paired(hours){
        const dates=new Map();
        for(const h of hours?.values()||[]){
            if(!dates.has(h.date))dates.set(h.date,{day:[],night:[]});
            dates.get(h.date)[h.night?'night':'day'].push(mean(h.values));
        }
        return [...dates.values()].filter(d=>d.night.length>=3 && d.day.length>=9);
    }
    const nDays=Math.round((Date.parse(through)-Date.parse(start))/86400000)+1;
    for(const [name,series] of rooms){
        const air=series.get('phidgetTemperature')||series.get('actualTemperature'),valve=series.get('valveActualTemperature');
        const hours=air||valve;
        if(!hours)continue;
        const source=series.has('phidgetTemperature')?'Phidget-Raumfühler':air?'Raumfühler':'Heizkörperfühler';
        const days=paired(hours);
        if(!days.length){
            const values=[...hours.values()].map(h=>mean(h.values));
            notes.push(name+' ('+source+'): '+fmt(Math.min(...values))+'–'+fmt(Math.max(...values))+' °C in '+values.length+' erfassten Stunden. Für den Tag-Nacht-Vergleich fehlen Messstunden.');
            continue;
        }
        const day=mean(days.map(d=>mean(d.day))),night=mean(days.map(d=>mean(d.night)));
        const delta=day-night;
        const trend=Math.abs(delta)<0.5?'Tag und Nacht lagen weniger als 0,5 °C auseinander.':'Nachts im Mittel '+fmt(Math.abs(delta))+' °C '+(delta>0?'kühler.':'wärmer.');
        let text=name+' ('+source+', '+days.length+' von '+nDays+(nDays===1?' Tag':' Tagen')+' auswertbar): tags '+fmt(day)+' °C, nachts '+fmt(night)+' °C. '+trend;
        const set=paired(series.get('setPointTemperature'));
        if(set.length){
            const change=mean(set.map(d=>mean(d.day)-mean(d.night)));
            text+=' Der nächtliche Sollwert lag an '+set.length+(set.length===1?' Vergleichstag':' Vergleichstagen')+' im Mittel '+(Math.abs(change)<0.1?'gleichauf.':fmt(Math.abs(change))+' °C '+(change>0?'tiefer.':'höher.'));
            if(change<0.5 && delta<0.5)text+=' Prüfe, ob der nächtliche Heizplan zur Nutzung des Raums passt.';
        }
        notes.push(text);
    }
    if(!notes.length)return [missing];
    return [...notes,'Tag 06–24 Uhr, Nacht 00–06 Uhr (Wien). Verglichen werden Tage mit mindestens neun Tag- und drei Nachtstunden. Die Wärmemenge der Heizung ist hier nicht erfasst. Eine tatsächliche Ersparnis in kWh oder Euro bleibt offen.'];
}

function temperatures(file,start,through){
    if(!file)return [missing];
    const from=localInstant(start+'T00:00'), to=localInstant(shiftDay(through,1)+'T00:00');
    const phidget=path.resolve(path.dirname(file),'../phidget-inventory/room-temperatures.sqlite');
    let db,rows=[],issues=[];
    try{
        if(existsSync(file)){db=new DatabaseSync(file,{readOnly:true});
        db.exec('PRAGMA busy_timeout=3000');
        rows=db.prepare(`SELECT s.rooms,s.point_name,CAST(p.observed_at/3600000 AS INTEGER) AS bucket,avg(p.value) AS value
            FROM series s JOIN samples p ON p.series_id=s.id
            WHERE s.kind='temperature' AND (s.point_name IN ('actualTemperature','valveActualTemperature','setPointTemperature') OR
              s.point_name GLOB '*.actualTemperature' OR s.point_name GLOB '*.valveActualTemperature' OR s.point_name GLOB '*.setPointTemperature')
            AND p.observed_at>=? AND p.observed_at<? AND p.quality='current' AND p.value IS NOT NULL
            GROUP BY s.id,bucket ORDER BY s.rooms,bucket`).all(from,to);}
    }catch{issues.push('Das Homematic-Temperaturarchiv konnte nicht gelesen werden.');}finally{db?.close();}
    db=null;
    try {
        if(existsSync(phidget)){
            db=new DatabaseSync(phidget,{readOnly:true});
            rows.push(...db.prepare("SELECT 'Georgszimmer' rooms,'phidgetTemperature' point_name,CAST(minute/60 AS INTEGER) bucket,avg(value) value FROM georgszimmer WHERE minute>=? AND minute<? GROUP BY bucket HAVING count(*)>=30").all(from/60000,to/60000));
        }
    }catch{issues.push('Das Phidget-Temperaturarchiv konnte nicht gelesen werden.');}finally{db?.close();}
    return [...profile(rows,start,through),...issues];
}
module.exports={profile,temperatures};
