'use strict';
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),path=require('node:path');
const {parseRange}=require('./energy-range.cjs');
const DAY=86400000;
const sensitive=/token|password|secret|pin|clientauth/i;
const fields={actualTemperature:['Isttemperatur','°C'],setPointTemperature:['Solltemperatur','°C'],valveActualTemperature:['Ventiltemperatur','°C'],humidity:['Luftfeuchte','%'],valvePosition:['Ventilöffnung','%',100],dimLevel:['Helligkeit','%',100],shutterLevel:['Rollladenposition','%',100],illumination:['Beleuchtungsstärke','lx'],power:['Leistung','W'],energyCounter:['Energiezähler','Wh'],voltage:['Spannung','V'],vaporAmount:['Absolute Luftfeuchte','g/m³'],on:['Schaltzustand',''],windowState:['Fensterzustand',''],doorState:['Türzustand',''],operationMode:['Betriebsart',''],controlMode:['Regelmodus',''],boostMode:['Boost',''],motionDetected:['Bewegung',''],presenceDetected:['Anwesenheit',''],waterDetected:['Wasser erkannt',''],sabotage:['Sabotage',''],smokeDetectorAlarmType:['Rauchmelder',''],reachable:['Erreichbar',''],lowBattery:['Batterie schwach','']};
function definition(point){
 const key=String(point.name).split('.').pop(),f=fields[key],v=point.value;
 if(sensitive.test(point.name)||/^(id|index|channelIndex|timestamp|lastUpdated|lastStatusUpdate|functionalChannelType)$/i.test(key))return null;
 const kind=typeof v==='boolean'?'binary':typeof v==='number'&&Number.isFinite(v)?((f&&f[1]==='°C')||point.unit==='°C'?'temperature':'number'):typeof v==='string'&&f?'state':null;
 if(!kind)return null;
 return {label:(f?f[0]:key)+' · '+point.name,unit:f?f[1]:String(point.unit||''),kind,scale:f&&f[2]||1};
}
function createHistory(file,{intervalMs=60000,retentionDays=365,now=Date.now}={}){
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
 const db=new DatabaseSync(file);fs.chmodSync(file,0o600);
 db.exec(`PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS series(id TEXT PRIMARY KEY,device_id TEXT NOT NULL,device_name TEXT NOT NULL,rooms TEXT NOT NULL,point_name TEXT NOT NULL,label TEXT NOT NULL,unit TEXT NOT NULL,kind TEXT NOT NULL,states_json TEXT NOT NULL DEFAULT '[]',last_seen INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS samples(series_id TEXT NOT NULL,observed_at INTEGER NOT NULL,value REAL,text_value TEXT,quality TEXT NOT NULL,PRIMARY KEY(series_id,observed_at));
 CREATE INDEX IF NOT EXISTS hmip_samples_time ON samples(observed_at);
 CREATE TABLE IF NOT EXISTS metadata(name TEXT PRIMARY KEY,value TEXT NOT NULL);`);
 const upsert=db.prepare(`INSERT INTO series VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET device_name=excluded.device_name,rooms=excluded.rooms,label=excluded.label,last_seen=excluded.last_seen,states_json=excluded.states_json`);
 const put=db.prepare('INSERT OR REPLACE INTO samples VALUES (?,?,?,?,?)');
 const retention=Math.max(1,Math.min(3650,Number(retentionDays)||365));
 let closed=false,lastPrune=0;
 function record(rows,time=now(),success=true){
  if(closed)return;
  if(!Number.isSafeInteger(time))throw Error('Ungültiger Zeitpunkt');
  const known=db.prepare('SELECT * FROM series').all(),byId=new Map(known.map(s=>[s.id,s])),written=new Set();
  db.exec('BEGIN IMMEDIATE');try{
   if(success)for(const device of rows){
    if(device.quality!=='current')continue;
    const points=[...(device.points||[]),{name:'status.reachable',value:device.reachable},{name:'status.lowBattery',value:device.lowBattery}];
    for(const point of points){const def=definition(point);if(!def)continue;
     const id=JSON.stringify([String(device.id),point.name,def.unit,def.kind]),old=byId.get(id),states=old?JSON.parse(old.states_json):[];
     let value,text=null;
     if(def.kind==='state'){text=point.value;if(!states.includes(text)){if(states.length>=64)continue;states.push(text);}value=states.indexOf(text);}
     else if(def.kind==='binary'){value=point.value?1:0;text=point.value?'Ja':'Nein';}
     else value=point.value*def.scale;
     if(!Number.isFinite(value))continue;
     upsert.run(id,String(device.id),String(device.name),String(device.rooms||''),point.name,def.label,def.unit,def.kind,JSON.stringify(states),time);
     put.run(id,time,value,text,'current');written.add(id);
    }
   }
   // A failed poll, offline device or vanished datapoint is an explicit gap, never an old repeated value.
   for(const s of known)if(!written.has(s.id))put.run(s.id,time,null,null,'missing');
   if(time-lastPrune>DAY){db.prepare('DELETE FROM samples WHERE observed_at<?').run(time-retention*DAY);lastPrune=time;}
   db.prepare("INSERT OR REPLACE INTO metadata VALUES ('lastRecord',?)").run(String(time));
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 function catalog(){
  const rows=db.prepare(`SELECT s.*,(SELECT min(observed_at) FROM samples p WHERE p.series_id=s.id) AS first_at,
   (SELECT value FROM samples p WHERE p.series_id=s.id ORDER BY observed_at DESC LIMIT 1) AS latest_value,
   (SELECT text_value FROM samples p WHERE p.series_id=s.id ORDER BY observed_at DESC LIMIT 1) AS latest_text,
   (SELECT observed_at FROM samples p WHERE p.series_id=s.id ORDER BY observed_at DESC LIMIT 1) AS latest_at FROM series s ORDER BY device_name,label`).all();
  return {series:rows.map(s=>({id:s.id,deviceId:s.device_id,deviceName:s.device_name,rooms:s.rooms,point:s.point_name,label:s.label,unit:s.unit,kind:s.kind,states:JSON.parse(s.states_json),firstAt:s.first_at,lastAt:s.latest_at,latestValue:s.latest_value,latestText:s.latest_text})),retentionDays:retention,intervalMs};
 }
 function query(request={}){
  const ids=request.seriesIds;
  if(!Array.isArray(ids)||!ids.length||ids.length>6||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)throw Error('Bitte ein bis sechs unterschiedliche Trends auswählen.');
  let from,to;
  if(request.mode==='live'){const hours=Number(request.hours);if(![1,6,24,168].includes(hours))throw Error('Ungültiger Live-Zeitraum');to=now();from=to-hours*3600000;}
  else if(typeof request.from==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(request.from)){({from,to}=parseRange(request));}
  else {from=Number(request.from);to=Number(request.to);}
  if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<0||!(to>from)||to-from>366*DAY||to>now()+60000)throw Error('Bitte einen gültigen Zeitraum bis maximal 366 Tage wählen.');
  const all=catalog().series,selected=ids.map(id=>all.find(s=>s.id===id));
  if(selected.some(s=>!s))throw Error('Ein ausgewählter Trend ist nicht mehr verfügbar.');
  const first=selected[0];if(selected.some(s=>s.unit!==first.unit||(['state','binary'].includes(first.kind)?s.kind!==first.kind:s.kind==='state'||s.kind==='binary'))||first.kind==='state'&&selected.length>1)throw Error('Trends mit gleicher Einheit wählen; Textzustände bitte einzeln anzeigen.');
  // Keep first/minimum/maximum/last and gap marker per bucket. Never draw across a bucket containing gaps.
  const bucketMs=Math.max(1,Math.ceil((to-from)/320));
  const sql=db.prepare(`WITH raw AS (
    SELECT observed_at,value,text_value,quality,LAG(observed_at) OVER (ORDER BY observed_at) AS previous_at FROM samples WHERE series_id=? AND observed_at>=? AND observed_at<?
   ), ranked AS (
    SELECT *,CAST((observed_at-?)/? AS INTEGER) AS bucket,
    ROW_NUMBER() OVER(PARTITION BY CAST((observed_at-?)/? AS INTEGER) ORDER BY observed_at) AS first_rank,
    ROW_NUMBER() OVER(PARTITION BY CAST((observed_at-?)/? AS INTEGER) ORDER BY observed_at DESC) AS last_rank,
    ROW_NUMBER() OVER(PARTITION BY CAST((observed_at-?)/? AS INTEGER) ORDER BY value ASC NULLS LAST,observed_at) AS min_rank,
    ROW_NUMBER() OVER(PARTITION BY CAST((observed_at-?)/? AS INTEGER) ORDER BY value DESC NULLS LAST,observed_at) AS max_rank,
    ROW_NUMBER() OVER(PARTITION BY CAST((observed_at-?)/? AS INTEGER) ORDER BY (value IS NULL) DESC,observed_at) AS gap_rank,
    MAX(CASE WHEN value IS NULL OR observed_at-previous_at>? THEN 1 ELSE 0 END) OVER(PARTITION BY CAST((observed_at-?)/? AS INTEGER)) AS has_gap
    FROM raw
   ) SELECT observed_at,value,text_value,quality,has_gap FROM ranked WHERE first_rank=1 OR last_rank=1 OR min_rank=1 OR max_rank=1 OR gap_rank=1 ORDER BY observed_at`);
  const series=selected.map(s=>{
   const points=sql.all(s.id,from,to,...Array.from({length:6},()=>[from,bucketMs]).flat(),intervalMs*2.5,from,bucketMs).map(p=>({at:p.observed_at,value:p.value,text:p.text_value,quality:p.quality,breakBefore:!!p.has_gap}));
   const stats=db.prepare('SELECT count(value) count,min(value) min,max(value) max,avg(value) average FROM samples WHERE series_id=? AND observed_at>=? AND observed_at<?').get(s.id,from,to);
   return {...s,points,stats};
  });
  return {from,to,series,bucketMs,intervalMs,retentionDays:retention,observed:true};
 }
 return {record,catalog,query,close(){if(!closed){closed=true;db.close();}}};
}
module.exports={definition,createHistory};
