'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFile}=require('node:child_process');
const {normalize,mergeRows}=require('./homematic-ip-core.cjs');
const {createHistory}=require('./homematic-ip-history.cjs');
module.exports=RED=>{
 function Hmip(config){
  RED.nodes.createNode(this,config);const node=this;
  const userDir=RED.settings.userDir;
  const root=path.join(userDir,'homematic-ip'),file=path.join(root,node.id+'-snapshot.json');
  const python=path.join(userDir,'homematic-ip-runtime/bin/python');
  const bridge=path.join(__dirname,'homematic-ip-bridge.py');
  const configuredInterval=Number(config.intervalMs);
  const interval=Number.isFinite(configuredInterval)?Math.min(86400000,Math.max(120000,configuredInterval)):120000;
  let history=null,historyError='';
  try{history=createHistory(path.join(root,node.id+'-history.sqlite'),{intervalMs:interval,retentionDays:config.historyDays});}catch{historyError='Historisches Messarchiv konnte nicht geöffnet werden';}
  function recordHistory(success){try{if(history){history.record(rows,Date.now(),success);historyError='';}}catch{historyError='Historische Messwerte konnten nicht gespeichert werden';}}
  const gateFile=path.join(root,'cloud-poll-state.json');
  let gate={nextAttemptAt:0,failures:0,errorCode:''};
  function readGate(){
   try{const saved=JSON.parse(fs.readFileSync(gateFile,'utf8'));
    if(!Number.isSafeInteger(saved.nextAttemptAt)||saved.nextAttemptAt<0||!Number.isSafeInteger(saved.failures)||saved.failures<0)throw Error('state');
    gate={nextAttemptAt:saved.nextAttemptAt,failures:Math.min(saved.failures,20),errorCode:['rate_limited','cloud_error'].includes(saved.errorCode)?saved.errorCode:''};
   }catch(e){if(e.code!=='ENOENT')throw e;}
  }
  function writeGate(){fs.mkdirSync(root,{recursive:true,mode:0o700});fs.writeFileSync(gateFile+'.tmp',JSON.stringify(gate),{mode:0o600});fs.renameSync(gateFile+'.tmp',gateFile);}
  let rows=[],lastSuccess=null,status='idle',message='Noch keine Cloud-Abfrage',storageError='',busy=false,closed=false,child,timer;
  try{const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(saved.rows))throw Error();rows=saved.rows.map(r=>({...r,quality:'stale'}));lastSuccess=saved.lastSuccess||null;}
  catch(e){if(e.code!=='ENOENT')storageError='Gespeicherter Bestand konnte nicht gelesen werden';}
  function emit(){
   if(closed)return;
   if((storageError||historyError)&&status==='running')status='warning';
   node.status({fill:status==='running'?'green':status==='error'?'red':status==='warning'?'yellow':'grey',shape:'dot',text:message});
   node.send({topic:'homematic-ip/state',payload:{schemaVersion:1,provider:'homematic-ip-cloud',readOnly:true,status,message,storageError,historyError,lastSuccess,intervalMs:interval,nextAttemptAt:gate.nextAttemptAt,errorCode:gate.errorCode,rows}});
  }
  function schedule(){clearTimeout(timer);if(!closed)timer=setTimeout(poll,Math.max(1000,gate.nextAttemptAt-Date.now(),storageError?interval:0));}
  function save(){try{fs.mkdirSync(root,{recursive:true,mode:0o700});fs.writeFileSync(file+'.tmp',JSON.stringify({rows,lastSuccess}),{mode:0o600});fs.renameSync(file+'.tmp',file);storageError='';}catch(e){storageError='Bestand konnte nicht gespeichert werden';}}
  function poll(){
   if(closed||busy)return;clearTimeout(timer);
   if(!fs.existsSync(python)||!fs.existsSync(path.join(root,'credentials.json'))){
    status='idle';message='Einrichtung / lokale Autorisierung ausstehend';gate.nextAttemptAt=Date.now()+interval;emit();schedule();return;
   }
   try{
    readGate();
    if(Date.now()<gate.nextAttemptAt){
     if(gate.errorCode){rows=rows.map(r=>({...r,quality:'stale'}));status=gate.errorCode==='rate_limited'?'warning':'error';message=gate.errorCode==='rate_limited'?'Homematic drosselt die Cloud-Abfragen – automatische Abfragepause':'Cloud-Abfrage fehlgeschlagen – automatische Wiederholung nach Wartezeit';}
     emit();schedule();return;
    }
    // Reserve the next slot before the request; shared by nodes and retained on restart.
    gate.nextAttemptAt=Date.now()+interval;writeGate();
   }catch{storageError='Abfragesperre konnte nicht gespeichert oder gelesen werden';status='error';message='Cloud-Abfragen pausiert: lokaler Speicherfehler';emit();schedule();return;}
   busy=true;
   child=execFile(python,[bridge,'snapshot'],{timeout:45000,maxBuffer:8*1024*1024,env:{...process.env,NODE_RED_USER_DIR:userDir}},(error,stdout)=>{
    busy=false;child=null;if(closed)return;
    try{
     const result=JSON.parse(stdout||'null');
     if(error||result?.error)throw Object.assign(Error('cloud'),{cloudError:result?.error});
     const data=normalize(result);
     rows=mergeRows(rows,data.rows);lastSuccess=Date.now();
     status=data.connected===false||rows.some(r=>r.quality!=='current'||r.lowBattery===true)?'warning':'running';
     message=data.connected===false?'Cloud erreichbar, HAP offline':'Cloud-Abfrage erfolgreich';gate={nextAttemptAt:Date.now()+interval,failures:0,errorCode:''};save();recordHistory(true);
    }catch(e){
     rows=rows.map(r=>({...r,quality:'stale'}));
     const limited=e.cloudError?.code==='rate_limited';
     gate.failures=Math.min(20,gate.failures+1);gate.errorCode=limited?'rate_limited':'cloud_error';
     const delay=Math.min(7200000,(limited?900000:interval)*2**(gate.failures-1));
     const retry=Number(e.cloudError?.retryAfterMs);
     gate.nextAttemptAt=Date.now()+Math.max(interval,delay,Number.isFinite(retry)&&retry>0?Math.min(retry,2147480000):0);
     status=limited?'warning':'error';message=limited?'Homematic drosselt die Cloud-Abfragen – automatische Abfragepause':'Cloud-Abfrage fehlgeschlagen – automatische Wiederholung nach Wartezeit';recordHistory(false);
    }
    try{writeGate();}catch{storageError='Abfragesperre konnte nicht gespeichert werden';status='error';message='Cloud-Abfragen pausiert: lokaler Speicherfehler';}
    emit();schedule();
   });
  }
  node.on('input',(msg,send,done)=>{
   // Refresh is rate-limited; repeated dashboard clicks cannot flood the cloud.
   if(['homematic-ip/history/catalog','homematic-ip/history/query'].includes(msg.topic)){
    let payload;try{if(!history)throw Error('Historisches Messarchiv ist nicht verfügbar.');payload=msg.topic.endsWith('/catalog')?history.catalog():history.query(msg.payload||{});}catch(e){payload={error:e.message};}
    (send||node.send.bind(node))({topic:msg.topic+'/result',socketid:msg.socketid,payload:{...payload,requestId:msg.payload?.requestId}});
   }
   else if(msg.topic==='homematic-ip/get')emit();
   else if(msg.topic==='homematic-ip/refresh'){
    if(!busy)poll();else emit();
   }else{node.warn('Nur lesende Homematic-Abfragen erlaubt');}
   if(done)done();
  });
  timer=setTimeout(poll,1500);
  node.on('close',(_removed,done)=>{closed=true;clearTimeout(timer);if(child)child.kill('SIGTERM');if(history)history.close();if(done)done();});
 }
 RED.nodes.registerType('home-automation-homematic-ip',Hmip);
};
