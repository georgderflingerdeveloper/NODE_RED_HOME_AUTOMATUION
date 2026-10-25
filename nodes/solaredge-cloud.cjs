'use strict';
// SolarEdge Monitoring energyDetails. All secrets stay inside the server-side client.
const HOUR=3600000,DAY=24*HOUR;
const METRICS={house:'house_consumption_kwh',grid:'grid_import_kwh',pv:'pv_energy_kwh',export:'grid_export_kwh'};
const TYPES={Consumption:'house',Purchased:'grid',Production:'pv',FeedIn:'export'};
const isEnergy=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const iso=t=>new Date(t).toISOString();
const clock=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Vienna',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function apiTime(t){return clock.format(new Date(t)).replace('T',' ')+':00';}
// Offset-free repeated autumn hours cannot be assigned safely; deliberately leave a gap.
function cloudHour(text){
 if(typeof text!=='string'||!/^\d{4}-\d{2}-\d{2} \d{2}:00:00$/.test(text))return null;
 const target=text.slice(0,16),nominal=Date.parse(text.replace(' ','T')+'Z');if(!Number.isFinite(nominal))return null;
 const matches=[0,1,2].map(offset=>nominal-offset*HOUR).filter(t=>clock.format(new Date(t))===target);
 return matches.length===1?matches[0]:null;
}
function normalizeEnergy(payload,{from,to,now=Date.now()}){
 const data=payload&&payload.energyDetails;
 if(!data||data.timeUnit!=='HOUR'||data.unit!=='Wh'||!Array.isArray(data.meters))throw Error('SolarEdge: unerwartetes Energieformat (HOUR/Wh erforderlich).');
 const cells=new Map(),conflicts=new Set();let skipped=0;
 for(const meter of data.meters){const metric=TYPES[meter.type];if(!metric)continue;
  if(!Array.isArray(meter.values))throw Error('SolarEdge: ungültige Messwertliste.');
  for(const value of meter.values){const start=cloudHour(value.date);
   if(start===null){skipped++;continue;}
   if(start<from||start+HOUR>to||start+HOUR>now||!isEnergy(value.value))continue;
   const key=start+':'+metric;if(cells.has(key)){conflicts.add(key);continue;}
   cells.set(key,{start,end:start+HOUR,metric,kwh:value.value/1000});
  }
 }
 return {rows:[...cells.entries()].filter(([key])=>!conflicts.has(key)).map(([,v])=>v),skipped:skipped+conflicts.size};
}
function localValid(row,key,coverage){
 if(!row||row.energy_status!=='online'||!(row.sample_count>1)||!isEnergy(row[key]))return false;
 const duration=Date.parse(row.interval_end)-Date.parse(row.interval_start);
 const current=Date.parse(row.interval_start)<=Date.now()&&Date.parse(row.interval_end)>Date.now();
 return duration>0&&(current||coverage===undefined||coverage>=duration*.98);
}
function effectiveRows(local,cloud,coverage=new Map()){
 const rows=new Map(local.map(r=>[r.interval_start,{...r,source_by_metric:{}}]));
 for(const c of cloud){const key=METRICS[c.metric];if(!key||!isEnergy(c.kwh))continue;
  const start=iso(c.start),original=rows.get(start);
  if(original&&Date.parse(original.interval_end)!==c.end)continue;
  const row=original||{interval_start:start,interval_end:iso(c.end),energy_status:'offline',sample_count:0,weather_status:'offline',tariff_status:'offline',data_quality:'cloud',source_by_metric:{}};
  if(!localValid(row,key,coverage.get(start))){row[key]=c.kwh;row.source_by_metric[c.metric]='cloud';}
  rows.set(start,row);
 }
 return [...rows.values()].sort((a,b)=>a.interval_start.localeCompare(b.interval_start)).map(row=>{
  for(const [metric,key] of Object.entries(METRICS))if(!row.source_by_metric[metric])row.source_by_metric[metric]=localValid(row,key,coverage.get(row.interval_start))?'local':'missing';
  return row;
 });
}
function compareSources(local,cloud,{from,to},coverage=new Map()){
 const byLocal=new Map(local.map(r=>[Date.parse(r.interval_start),r])),byCloud=new Map();
 for(const c of cloud){let r=byCloud.get(c.start);if(!r)byCloud.set(c.start,r={});r[c.metric]=c.kwh;}
 const intervals=[],summary={};
 for(const metric of Object.keys(METRICS))summary[metric]={localKwh:null,cloudKwh:null,pairedLocalKwh:null,pairedCloudKwh:null,pairedHours:0,localHours:0,cloudHours:0,filledHours:0};
 const start=Math.ceil(from/HOUR)*HOUR;
 for(let t=start;t+HOUR<=to;t+=HOUR){const l=byLocal.get(t),c=byCloud.get(t)||{},item={from:iso(t),to:iso(t+HOUR),metrics:{}};
  for(const [metric,key] of Object.entries(METRICS)){
   const valid=localValid(l,key,coverage.get(iso(t)))&&Date.parse(l.interval_end)===t+HOUR;
   const lv=l&&isEnergy(l[key])?l[key]:null,cv=isEnergy(c[metric])?c[metric]:null;
   const pair=valid&&cv!==null,s=summary[metric];
   if(valid){s.localKwh=(s.localKwh??0)+lv;s.localHours++;}
   if(cv!==null){s.cloudKwh=(s.cloudKwh??0)+cv;s.cloudHours++;if(!valid)s.filledHours++;}
   if(pair){s.pairedLocalKwh=(s.pairedLocalKwh??0)+lv;s.pairedCloudKwh=(s.pairedCloudKwh??0)+cv;s.pairedHours++;}
   item.metrics[metric]={localKwh:lv,localValid:valid,cloudKwh:cv,source:valid?'local':cv!==null?'cloud':'missing',differenceKwh:pair?lv-cv:null,coverageKnown:l?coverage.has(l.interval_start):false};
  }intervals.push(item);
 }
 for(const s of Object.values(summary)){
  s.differenceKwh=s.pairedHours?s.pairedLocalKwh-s.pairedCloudKwh:null;
  s.differencePercent=s.pairedCloudKwh>0?s.differenceKwh/s.pairedCloudKwh*100:null;
  s.withinTolerance=s.pairedHours?Math.abs(s.differenceKwh)<=Math.max(.05,s.pairedCloudKwh*.05):null;
 }
 return {from:iso(from),to:iso(to),summary,intervals,note:'Verglichen werden nur deckungsgleiche volle Stunden. Differenz = lokal minus SolarEdge. Toleranz: max. 0,05 kWh oder 5 %. Übereinstimmung ist ein Plausibilitätscheck, kein Nachweis der Messgenauigkeit. Teilstunden werden im Vergleich ausgelassen.'};
}
function createCloudStore(database,{siteId='',apiKey='',auto=true,fetchImpl=globalThis.fetch,now=Date.now}={}){
 siteId=String(siteId).trim();apiKey=String(apiKey).trim();
 const configured=/^\d+$/.test(siteId)&&apiKey.length>0;
 const put=database.prepare('INSERT OR REPLACE INTO solaredge_cloud_energy (site_id,interval_start,interval_end,metric,kwh,fetched_at) VALUES (?,?,?,?,?,?)');
 const select=database.prepare('SELECT * FROM solaredge_cloud_energy WHERE site_id=? AND interval_start<? AND interval_end>? ORDER BY interval_start');
 const getMeta=database.prepare('SELECT value_json FROM solaredge_cloud_state WHERE site_id=? AND name=?');
 const setMeta=database.prepare('INSERT OR REPLACE INTO solaredge_cloud_state(site_id,name,value_json) VALUES (?,?,?)');
 const read=name=>{const r=getMeta.get(siteId,name);return r?JSON.parse(r.value_json):null;};
 const write=(name,value)=>setMeta.run(siteId,name,JSON.stringify(value));
 let pending=null,closed=false,controller=null;
 function status(){return {configured,siteId,auto:configured&&auto,busy:!!pending,lastSuccess:read('lastSuccess'),error:read('error')||'',skipped:read('skipped')||0};}
 function rows(from,to){return select.all(siteId,iso(to),iso(from)).map(r=>({start:Date.parse(r.interval_start),end:Date.parse(r.interval_end),metric:r.metric,kwh:r.kwh}));}
 async function request(endpoint,params={}){
  if(closed)throw Error('SolarEdge-Abfrage beendet.');
  const day=iso(now()).slice(0,10),usage=read('usage')||{};
  const count=usage.day===day?usage.count:0;if(count>=250)throw Error('SolarEdge: lokales Tageslimit erreicht.');
  write('usage',{day,count:count+1});
  const url=new URL('https://monitoringapi.solaredge.com/site/'+siteId+'/'+endpoint);for(const [k,v] of Object.entries({...params,api_key:apiKey}))url.searchParams.set(k,String(v));
  controller=new AbortController();const timer=setTimeout(()=>controller&&controller.abort(),30000);
  try{
   let response;try{response=await fetchImpl(url,{signal:controller.signal,redirect:'error',headers:{Accept:'application/json'}});}catch{throw Error('SolarEdge: Verbindung fehlgeschlagen oder Zeitüberschreitung.');}
   if(!response.ok)throw Error(response.status===401||response.status===403?'SolarEdge: Zugriff abgewiesen – Anlagen-ID, API-Schlüssel und Freigabe prüfen.':response.status===429?'SolarEdge: Abfragelimit erreicht.':'SolarEdge: Serverfehler (HTTP '+response.status+').');
   try{return await response.json();}catch{throw Error('SolarEdge: ungültige JSON-Antwort.');}
  }finally{clearTimeout(timer);controller=null;}
 }
 async function sync(from,to){
  if(closed)return {configured,error:'SolarEdge-Abfrage beendet.'};
  if(!configured)return status();if(pending){await pending;return sync(from,to);}
  if(!(Number.isFinite(from)&&Number.isFinite(to)&&to>from&&to-from<=367*DAY))throw Error('SolarEdge: ungültiger Zeitraum.');
  const lastAttempt=read('lastAttempt')||0;if(read('error')&&now()-lastAttempt<15*60000)return status();
  pending=(async()=>{
   try{
    write('lastAttempt',now());
    if(read('timezoneChecked')!==true){const details=await request('details');if(details?.details?.location?.timeZone!=='Europe/Vienna')throw Error('SolarEdge: Anlagen-Zeitzone muss Europe/Vienna sein.');write('timezoneChecked',true);}
    const end=Math.floor(Math.min(to,now()-2*HOUR)/HOUR)*HOUR,start=Math.floor(from/HOUR)*HOUR;
    // Stable UTC-day chunks keep API requests well below its one-month maximum and cache repeated reads.
    let skipped=0;
    for(let a=Math.floor(start/DAY)*DAY;a<end;a+=28*DAY){
     const b=Math.min(a+28*DAY,end),cacheKey='range:'+a+':'+b,stamp=read(cacheKey);
     if(stamp&&now()-stamp<6*HOUR)continue;
     const response=await request('energyDetails',{timeUnit:'HOUR',meters:'CONSUMPTION,PURCHASED,PRODUCTION,FEEDIN',startTime:apiTime(a),endTime:apiTime(b-60000)});
     const parsed=normalizeEnergy(response,{from:a,to:b,now:now()-2*HOUR});skipped+=parsed.skipped;
     if(closed)return;
     database.exec('BEGIN IMMEDIATE');try{
      // Replace only the fetched cloud interval. Local measurements are never changed.
      database.prepare('DELETE FROM solaredge_cloud_energy WHERE site_id=? AND interval_start>=? AND interval_start<?').run(siteId,iso(a),iso(b));
      for(const r of parsed.rows)put.run(siteId,iso(r.start),iso(r.end),r.metric,r.kwh,iso(now()));
      write(cacheKey,now());database.exec('COMMIT');
     }catch(error){database.exec('ROLLBACK');throw error;}
    }
    if(!closed){write('skipped',skipped);write('lastSuccess',iso(now()));write('error','');}
   }catch(error){if(!closed)write('error',String(error.message).startsWith('SolarEdge:')?error.message:'SolarEdge: Nachladen fehlgeschlagen.');}
  })();
  try{await pending;}finally{pending=null;}return closed?{configured,error:'SolarEdge-Abfrage beendet.'}:status();
 }
 return {status,rows,sync,close(){closed=true;if(controller)controller.abort();}};
}
module.exports={METRICS,cloudHour,normalizeEnergy,localValid,effectiveRows,compareSources,createCloudStore};
