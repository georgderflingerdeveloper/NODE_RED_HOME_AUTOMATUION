'use strict';
const {DatabaseSync}=require('node:sqlite');
const io=require('./living-room-io.cjs');
const lights=io.lights.filter(l=>l.section==='Galerie einzeln');
const allCircuits=lights.map((_,i)=>i);
const areas=new Map([
 ['oben',allCircuits.filter(i=>lights[i].id.startsWith('up-'))],
 ['unten',allCircuits.filter(i=>lights[i].id.startsWith('down-'))],
 ['gemeinsam',allCircuits]
]);
const areaMasks=new Map([...areas].map(([name,circuits])=>[name,circuits.reduce((mask,i)=>mask|(1<<i),0)]));
const fmt=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Vienna',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const fail=m=>{throw Error(m);};
function windowKey(now,c){
 const [day,time]=fmt.format(now).split(' ');
 if(!c.scheduled || (c.start_time<c.end_time?time<c.start_time||time>=c.end_time:time>=c.end_time&&time<c.start_time))return null;
 return c.start_time>c.end_time&&time<c.end_time?new Date(Date.parse(day+'T12:00Z')-86400000).toISOString().slice(0,10):day;
}
async function readMask(){
 const state=io.status(await io.sample('east'));
 return lights.reduce((mask,l,i)=>{
  const s=state.find(v=>v.id===l.id)?.state;
  if(s!=='on'&&s!=='off')fail('PIEAST liefert keine aktuelle Rückmeldung aller Galeriekreise.');
  return mask+(s==='on'?2**i:0);
 },0);
}
function temperature(file){
 let db;
 try{db=new DatabaseSync(file,{readOnly:true});return db.prepare(`SELECT p.value,p.observed_at,s.device_name FROM series s JOIN samples p ON p.series_id=s.id WHERE s.rooms='Wohnzimmer' AND (s.point_name='actualTemperature' OR s.point_name GLOB '*.actualTemperature') AND p.quality='current' AND p.value IS NOT NULL ORDER BY p.observed_at DESC LIMIT 1`).get();}
 catch{return null;}finally{db?.close();}
}
// For a quiet transition, add the next light before releasing the oldest one.
function eveningSequence(initial,mode,random,circuits){
 function order(){
  const result=circuits.slice();
  if(mode==='zufall'){
   for(let i=result.length-1;i>0;i--){
    const j=Math.floor(random()*(i+1));
    [result[i],result[j]]=[result[j],result[i]];
   }
  }
  return result;
 }
 let lit=order().filter(i=>initial&(1<<i)),remaining=[],lastOff=null;
 return function nextMask(current){
  lit=lit.filter(i=>current&(1<<i));
  for(const i of circuits)if((current&(1<<i))&&!lit.includes(i))lit.push(i);
  if(lit.length>=3){
   lastOff=lit.shift();
   return current&~(1<<lastOff);
  }
  for(;;){
   if(!remaining.length)remaining=order();
   const bit=remaining.shift();
   if(bit!==lastOff && !(current&(1<<bit))){
    lit.push(bit);
    return current|(1<<bit);
   }
  }
 };
}
function playbackSettings(mode,seconds,area){
 if(!areas.has(area))fail('Bitte Oben, Unten oder Gemeinsam wählen.');
 if(mode==='ruhig')mode='sequenziell';
 if(!['zufall','sequenziell'].includes(mode))fail('Bitte Zufällig oder Sequenziell wählen.');
 if(!Number.isInteger(seconds)||seconds<2||seconds>3600)fail('Bitte eine Schrittzeit von 2 bis 3600 Sekunden eingeben.');
 return {mode,seconds,area};
}
function create(db,{read=readMask,write=io.switchLight,temp=()=>null,now=Date.now,random=Math.random,timers=true}={}){
 const online=new Map();
 let active='',teach=null,step=null,mask=null,issue='',serial=0,busy=false,next=0,index=0,target=null,closed=false,scheduledRun=false;
 db.prepare('UPDATE gallery_teach SET end=? WHERE end IS NULL').run(now());
 if(!db.prepare('PRAGMA table_info(gallery_config)').all().some(column=>column.name==='area')){
  db.exec("ALTER TABLE gallery_config ADD COLUMN area TEXT NOT NULL DEFAULT 'oben'");
 }
 const getConfig=db.prepare('SELECT * FROM gallery_config WHERE id=1');
 function config(){
  const c=getConfig.get();
  if(c.mode==='ruhig')c.mode='sequenziell';
  return c;
 }
 let sequence=null,learnedId=null,scenes=[],areaScenes=[],confirmedAt=0,lastChange=null;
 const learnedRuns=db.prepare(`SELECT t.id,t.place,t.start,COUNT(DISTINCT s.mask) AS count
  FROM gallery_teach t JOIN gallery_step s ON s.teach=t.id
  WHERE t.end IS NOT NULL AND s.rating='angenehm' GROUP BY t.id ORDER BY t.start DESC,t.id DESC`);
 const learnedMasks=db.prepare(`SELECT s.mask FROM gallery_step s JOIN gallery_teach t ON t.id=s.teach
  WHERE t.id=? AND t.end IS NOT NULL AND s.rating='angenehm' GROUP BY s.mask ORDER BY MIN(s.id)`);
 function readPlayback(b){
  const c=config();
  return playbackSettings(b.mode===undefined?c.mode:b.mode,b.seconds===undefined?c.seconds:b.seconds,b.area===undefined?c.area:b.area);
 }
 function resetSequence(c){
  sequence=null;target=null;
  if(!teach)index=0;
  const selected=areaMasks.get(c.area);
  areaScenes=[...new Set(scenes.map(scene=>scene&selected))];
  if(active==='effect' && lastChange!==null)next=lastChange+c.seconds*1000;
 }
 function applyPlayback(c){
  db.prepare('UPDATE gallery_config SET mode=?,seconds=?,area=? WHERE id=1').run(c.mode,c.seconds,c.area);
  resetSequence(c);
 }
 function stop(){
  serial++;if(teach)db.prepare('UPDATE gallery_teach SET end=? WHERE id=? AND end IS NULL').run(now(),teach.id);
  active='';teach=null;step=null;target=null;sequence=null;learnedId=null;scenes=[];areaScenes=[];scheduledRun=false;lastChange=null;
 }
 function record(){
  const t=temp();
  step={id:Number(db.prepare('INSERT INTO gallery_step(teach,at,mask,temperature,temp_at,temp_source) VALUES(?,?,?,?,?,?)').run(teach.id,now(),mask,t?.value??null,t?.observed_at??null,t?.device_name??null).lastInsertRowid),at:now()};
 }
 async function start(type,b={}){
  if(active||busy)fail('Ein Ablauf ist bereits aktiv.');
  if(type==='teach'&&b.phone&&!db.prepare('SELECT 1 FROM gallery_phone WHERE id=?').get(b.phone))fail('Handy unbekannt.');
  const requested=type==='effect' && (b.mode!==undefined || b.seconds!==undefined || b.area!==undefined) ? readPlayback(b) : null;
  let selected=[];
  if(b.learnedId!=null){
   if(type!=='effect'||!Number.isSafeInteger(b.learnedId))fail('Ungültiger Lerneffekt.');
   selected=learnedMasks.all(b.learnedId).map(row=>row.mask);
   if(!selected.length)fail('Dieser Lernlauf enthält keine freigegebenen Lichtbilder.');
  }
  const rev=++serial;busy=true;issue='';
  try{const initial=await read();if(rev!==serial||closed)return;
   mask=initial;confirmedAt=now();learnedId=b.learnedId??null;scenes=selected;lastChange=null;
   if(requested)applyPlayback(requested);
   else resetSequence(config());
   if(type==='teach'){
    const place=String(b.place||'Galerie').trim().slice(0,80);
    teach={id:Number(db.prepare('INSERT INTO gallery_teach(start,place,phone) VALUES(?,?,?)').run(now(),place,b.phone||null).lastInsertRowid),phone:b.phone||null,place};
    record();
   }
   active=type;scheduledRun=!!b.scheduled;next=now();
  }finally{busy=false;}
 }
 function approved(){return db.prepare("SELECT DISTINCT mask FROM gallery_step WHERE rating='angenehm' ORDER BY mask").all().map(r=>r.mask);}
 async function advance(){
  if(!active||busy)fail('Lichtsteuerung noch nicht bereit.');
  const rev=serial;busy=true;
  try{
   // Reuse a recent, physically confirmed mask during short effects. Teach needs a fresh sample.
   const current=active==='effect' && now()-confirmedAt<=3000 ? mask : await read();
   if(rev!==serial||closed)return;
   if(teach&&teach.phone&&!fresh(teach.phone))fail('Teach pausiert. Am gewählten Handy die Übertragung starten.');
   const c=config();
   let desired;
   const selected=areaMasks.get(c.area);
   if(areaScenes.length){
    const currentScene=current&selected;
    if(target===null||target===currentScene){
     if(areaScenes.length===1 && areaScenes[0]===currentScene){mask=current;stop();return;}
     if(c.mode==='zufall'){
      const choices=areaScenes.filter(n=>n!==currentScene);
      target=choices[Math.floor(random()*choices.length)];
     }else{
      if(areaScenes[index]===currentScene)index=(index+1)%areaScenes.length;
      target=areaScenes[index];index=(index+1)%areaScenes.length;
     }
    }
    const delta=currentScene^target;desired=current^(delta&-delta);
   }else if(active==='effect'){
    if(!sequence)sequence=eveningSequence(current,c.mode,random,areas.get(c.area));
    desired=sequence(current);
   }else{
    const lit=lights.filter((_,i)=>current&(1<<i)).length;
    const turnOn=lit<2||(lit===2&&index%2===0);
    const sequence=lights.map((_,i)=>(index+i)%lights.length);
    const choices=sequence.filter(i=>Boolean(current&(1<<i))!==turnOn);
    const bit=choices[0];
    index=(bit+1)%lights.length;
    desired=current^(1<<bit);
   }
   const bit=Math.log2(current^desired);
   if(active==='effect'){lastChange=now();next=lastChange+c.seconds*1000;}
   await write(lights[bit].id,!!(desired&(1<<bit)));
   if(rev!==serial||closed)return;
   const confirmed=await read();if(rev!==serial||closed)return;
   if(teach ? confirmed!==desired : ((confirmed^desired)&selected)!==0)fail('Die Lichtsteuerung hat die Szene nicht bestätigt.');
   mask=confirmed;confirmedAt=now();if(teach)record();issue='';
   if(areaScenes.length===1 && (confirmed&selected)===target)stop();
  }finally{busy=false;}
 }
 function fresh(id){
  const p=online.get(id);
  return !!p&&p.at>now()-15000&&(!p.kind||p.kind==='manual'||p.reading?.kind===p.kind&&p.reading.at>now()-15000);
 }
 function guide(){
  if(!teach)return null;
  const wait=Math.max(0,Math.ceil((step.at+8000-now())/1000)),seen=!!teach.phone;
  if(seen&&!fresh(teach.phone))return {message:'Teach pausiert. Am gewählten Handy die Sensorseite öffnen, Übertragung starten und am Messplatz liegen lassen. Bei fehlender Sensorfreigabe „Manuelle Bewertung“ wählen.',ready:false};
  if(wait)return {message:'Blickrichtung und Handyposition beibehalten. Die Szene noch '+wait+' Sekunden wirken lassen.',ready:false};
  const rated=db.prepare('SELECT rating FROM gallery_step WHERE id=?').get(step.id).rating;
  return {ready:true,message:rated?'Bewertung gespeichert. „Nächste Szene“ wechselt einen Lichtkreis. Du kannst den Lernlauf auch jetzt beenden.':'Vom gewählten Sitzplatz aus bewerten: zu dunkel, angenehm oder zu hell. Angenehme Lichtbilder findest du danach unter „Gelernte Effekte“.'};
 }
 async function tick(){
  if(closed||busy)return;
  let rev=serial;
  const c=config(),window=windowKey(now(),c);
  try{
   if(active==='effect'&&scheduledRun&&!window){stop();return;}
   if(!active&&window&&window!==c.last_window){
    db.prepare('UPDATE gallery_config SET last_window=? WHERE id=1').run(window);
    rev=serial+1;await start('effect',{scheduled:true});
   }else if(active==='effect'&&now()>=next){await advance();}
  }catch(e){if(!closed&&serial===rev){issue=e.message;stop();}}
 }
 const timer=timers?setInterval(tick,1000):null;timer?.unref();
 function state(){
  const phones=db.prepare('SELECT id,name FROM gallery_phone ORDER BY name,id').all().map(p=>({...p,online:fresh(p.id),last:online.get(p.id)?.at,reading:online.get(p.id)?.reading}));
  return {config:config(),active,learnedId,learned:learnedRuns.all(),teach,step,guide:guide(),mask,busy,issue,phones,approved:approved().length,lights:lights.map(l=>l.name),
   archive:db.prepare(`SELECT s.*,t.place,t.phone,p.name AS phone_name,(SELECT count(*) FROM gallery_sample x WHERE x.step=s.id AND x.kind='position') positions,
    (SELECT value FROM gallery_sample x WHERE x.step=s.id AND x.kind='lux' ORDER BY at DESC LIMIT 1) lux,
    (SELECT value FROM gallery_sample x WHERE x.step=s.id AND x.kind='camera' ORDER BY at DESC LIMIT 1) brightness
    FROM gallery_step s JOIN gallery_teach t ON t.id=s.teach LEFT JOIN gallery_phone p ON p.id=t.phone ORDER BY s.id DESC LIMIT 100`).all()};
 }
 function settings(b){
  const c=readPlayback(b);
  if(![b.start,b.end].every(x=>/^([01]\d|2[0-3]):[0-5]\d$/.test(x))||b.start===b.end)fail('Bitte ein gültiges Zeitfenster mit unterschiedlichem Beginn und Ende wählen.');
  db.prepare('UPDATE gallery_config SET mode=?,seconds=?,area=?,scheduled=?,start_time=?,end_time=? WHERE id=1').run(c.mode,c.seconds,c.area,b.scheduled?1:0,b.start,b.end);
  resetSequence(c);
 }
 async function command(b){
  if(b.action==='stop'){const w=windowKey(now(),config());if(w)db.prepare('UPDATE gallery_config SET last_window=? WHERE id=1').run(w);stop();return;}
  if(b.action==='settings'){settings(b);return;}
  if(b.action==='playback'){applyPlayback(readPlayback(b));return;}
  if(b.action==='effect'||b.action==='teach')return start(b.action,{mode:b.mode,seconds:b.seconds,area:b.area,learnedId:b.learnedId,phone:b.phone,place:b.place});
  if(b.action==='advance'&&active==='teach')return advance();
  if(b.action==='rate'&&active==='teach'&&b.step===step.id&&!busy){
   if(now()-step.at<8000)fail('Die Szene bitte acht Sekunden wirken lassen.');
   if((teach.phone&&!fresh(teach.phone))||!['angenehm','zu dunkel','zu hell'].includes(b.rating))fail('Handy-Signal oder Bewertung fehlt.');
   const id=step.id,confirmed=await read();
   if(step?.id!==id||confirmed!==mask||busy)fail('Szene wurde inzwischen geändert.');
   db.prepare('UPDATE gallery_step SET rating=? WHERE id=?').run(b.rating,id);return;
  }
  fail('Aktion für diesen Zustand nicht verfügbar.');
 }
 function phoneView(id){
  const owns=!!teach&&teach.phone===id;
  const available=!active||active==='teach'&&(!teach.phone||owns);
  let message;
  if(owns)message=guide().message;
  else if(active==='effect')message='Der Abendeffekt läuft. Beende ihn im Galerie-Effektmanager, bevor du einen Lernlauf startest.';
  else if(teach?.phone)message='Ein anderes Handy führt diesen Lernlauf. Warte auf dessen Ende.';
  else if(teach)message='Ein manueller Lernlauf ist aktiv. Tippe auf „Lernlauf starten / übernehmen“, um ihn mit diesem Handy fortzusetzen.';
  else message='Setz dich an den Messplatz, halte das Handy in derselben Richtung und tippe auf „Lernlauf starten / übernehmen“. Die erste Szene wird acht Sekunden lang beurteilt.';
  const scene=owns?lights.filter((_,i)=>mask&(1<<i)).map(l=>l.name).join(', '):'';
  return {teach:owns?teach.id:null,step:owns?step.id:null,guide:owns?guide():null,message,available,busy,scene};
 }
 async function phoneCommand(id,b){
  if(b.action==='start'){
   if(!active)await start('teach',{phone:id,place:b.place});
   else if(teach&&!busy&&(!teach.phone||teach.phone===id))selectPaired(id,teach.id);
   else fail('Ein anderer Ablauf ist aktiv.');
  }else{
   if(!teach||teach.phone!==id||step?.id!==b.step)fail('Der Lernschritt wurde inzwischen geändert. Bitte den aktuellen Hinweis beachten.');
   if(!['rate','advance','stop'].includes(b.action))fail('Unbekannte Teach-Aktion.');
   await command(b);
  }
  return phoneView(id);
 }
 function phone(id,b){
  if(b.stop){online.delete(id);return {};}
  const t=now(),owns=teach?.phone===id;
  const data=Array.isArray(b.samples)?b.samples:[];
  if(data.length>10)fail('Zu viele Sensorwerte.');
  const previous=online.get(id);
  let reading=previous&&previous.kind===b.kind?previous.reading:null;
  let gps=null;
  for(const s of data){
   if(!Number.isSafeInteger(s.at)||s.at<t-30000||s.at>t+3000)continue;
   const valid=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
   const position=s.kind==='position';
   if(position){if(!valid(s.lat,-90,90)||!valid(s.lon,-180,180)||!valid(s.accuracy,0,1e7))continue;}
   else if(!['camera','lux'].includes(s.kind)||!valid(s.value,0,s.kind==='camera'?100:1e6))continue;
   if(!position)reading={kind:s.kind,value:s.value,at:s.at};
   else if(owns&&b.step===step.id&&s.at>=step.at&&b.gps!==false)gps={at:s.at,latitude:s.lat,longitude:s.lon,accuracy:s.accuracy};
   if(owns&&b.step===step.id&&s.at>=step.at&&!busy)
    db.prepare('INSERT OR IGNORE INTO gallery_sample(step,phone,at,received,kind,value,latitude,longitude,accuracy) VALUES(?,?,?,?,?,?,?,?,?)').run(step.id,id,s.at,t,s.kind,s.value??null,s.lat??null,s.lon??null,s.accuracy??null);
  }
  online.set(id,{at:t,since:previous&&t-previous.at<=15000?previous.since:t,reading,kind:b.kind,gps,gpsEnabled:b.gps===true});return phoneView(id);
 }
 function selectPaired(id,tid){if(teach&&teach.id===tid&&!teach.phone){teach.phone=id;db.prepare('UPDATE gallery_teach SET phone=? WHERE id=?').run(id,tid);}}
 function diagnostics(id,from,to){
  return require('./gallery-diagnostics.cjs').diagnostics(db,id,from,to,now(),online.get(id)||null,lights);
 }
 return {state,diagnostics,command,phone,phoneCommand,selectPaired,tick,close(){closed=true;clearInterval(timer);stop();}};
}
module.exports={create,windowKey,temperature};
