'use strict';
const {DatabaseSync} = require('node:sqlite');
const METRICS = Object.freeze({
 pv:{label:'PV-Erzeugung',color:'#f4c75e',power:'pv_power_w',energy:'pv_energy_kwh'},
 house:{label:'Hausverbrauch',color:'#72b9ff',power:'house_consumption_w',energy:'house_consumption_kwh'},
 import:{label:'Netzbezug',color:'#f48e87',power:'grid_import_w',energy:'grid_import_kwh'},
 export:{label:'Einspeisung',color:'#69d5b0',power:'grid_export_w',energy:'grid_export_kwh'},
});
function trendRequest(query={}) {
 const mode=query.mode || 'power';
 if(!['power','energy'].includes(mode)) throw Error('Unbekannte Messgröße.');
 const parse=value=>{
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) throw Error('Zeitraum mit UTC-Zeitstempeln angeben.');
  const ms=Date.parse(value);
  if(!Number.isFinite(ms) || new Date(ms).toISOString().slice(0,19)!==value.slice(0,19)) throw Error('Ungültiger Zeitpunkt.');
  return ms;
 };
 const start=parse(query.start),end=parse(query.end);
 if(end<=start || end-start>366*86400000) throw Error('Zeitraum muss zwischen einer Sekunde und 366 Tagen liegen.');
 const metrics=query.metrics===undefined ? Object.keys(METRICS) : typeof query.metrics==='string' ? query.metrics.split(',') : [];
 if(!metrics.length || metrics.some(key=>!Object.hasOwn(METRICS,key))) throw Error('Bitte gültige Kurven auswählen.');
 const status=query.status || 'all';
 if(!['all','online','offline'].includes(status)) throw Error('Ungültiger Statusfilter.');
 return {mode,start:new Date(start).toISOString(),end:new Date(end).toISOString(),metrics:[...new Set(metrics)],status,
  table:mode==='power'?'solar_power_samples':'hourly_snapshots',time:mode==='power'?'observed_at':'interval_start',
  statusColumn:mode==='power'?'online':'energy_status',unit:mode==='power'?'W':'kWh',
  bucketSeconds:Math.max(mode==='power'?60:3600,Math.ceil((end-start)/1000/600))};
}
function trendFilter(spec) {
 return `${spec.time}>=? AND ${spec.time}<?`+(spec.status==='all'?'':` AND ${spec.statusColumn}=${spec.mode==='power'?(spec.status==='online'?'1':'0'):(spec.status==='online'?"'online'":"'offline'")}`);
}
function readTrend(databasePath,query) {
 const spec=trendRequest(query),db=new DatabaseSync(databasePath,{readOnly:true});
 try {
  db.exec('PRAGMA busy_timeout=5000; BEGIN');
  const {mode,table,time,bucketSeconds}=spec,where=trendFilter(spec),params=[spec.start,spec.end];
  const available=db.prepare(`SELECT MIN(${time}) AS first,MAX(${time}) AS last,COUNT(*) AS count FROM ${table}`).get();
  const counts=db.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN ${mode==='power'?'online=0':"energy_status!='online'"} THEN 1 ELSE 0 END) AS offline FROM ${table} WHERE ${where}`).get(...params);
  const series=spec.metrics.map(key=>{
   const metric=METRICS[key],column=metric[mode],value=mode==='power'?`CASE WHEN online=1 THEN ${column} END`:column;
   const raw=`SELECT ${time} AS t,${value} AS v,CASE WHEN ${mode==='power'?'online=1':"energy_status='online'"} THEN 1 ELSE 0 END AS complete,CAST(strftime('%s',${time}) AS INTEGER) AS ts FROM ${table} WHERE ${where}`;
   const stats=db.prepare(`WITH raw AS (${raw}) SELECT COUNT(v) AS count,MIN(v) AS min,MAX(v) AS max,AVG(v) AS average,SUM(v) AS total FROM raw`).get(...params);
   for(const [name,order] of [['minAt','ASC'],['maxAt','DESC']]) stats[name]=db.prepare(`WITH raw AS (${raw}) SELECT t FROM raw WHERE v IS NOT NULL ORDER BY v ${order},t LIMIT 1`).get(...params)?.t || null;
   const points=db.prepare(`WITH raw AS (${raw}),ordered AS (SELECT *,LAG(ts) OVER(ORDER BY t) AS previous FROM raw)
    SELECT MIN(t) AS first,MAX(t) AS last,AVG(v) AS value,MIN(v) AS low,MAX(v) AS high,COUNT(*) AS samples,COUNT(v) AS valid,SUM(complete) AS complete,
    MAX(CASE WHEN previous IS NOT NULL AND ts-previous>${mode==='power'?90:5400} THEN 1 ELSE 0 END) AS gap
    FROM ordered GROUP BY CAST(ts/${bucketSeconds} AS INTEGER) ORDER BY first`).all(...params);
   return {key,label:metric.label,color:metric.color,stats,points};
  });
  return {mode,unit:spec.unit,start:spec.start,end:spec.end,bucketSeconds,available,counts,series,
   note:mode==='power'?'Min/Max beziehen sich auf gespeicherte Minutenwerte. Keine Amperewerte vorhanden.':'Stundenenergie; Min/Max sind Stundenmengen, keine momentanen Leistungsspitzen.'};
 } finally {db.close();}
}
module.exports={METRICS,trendRequest,trendFilter,readTrend};
