'use strict';
const fs=require('node:fs'),path=require('node:path');
const {Monitor}=require('./phidget-io-core.cjs');
module.exports=RED=>{
 function IO(config){
  RED.nodes.createNode(this,config);const node=this;
  const file=path.join(RED.settings.userDir,'phidget-inventory',node.id+'-io.json');
  const archive=require('./phidget-room-history.cjs').recorder(path.join(path.dirname(file),'room-temperatures.sqlite'));
  let archiveRetry=0;
  let previous=[],storageError='',dependencyError='',monitor,closed=false,lastSave=0;
  try{previous=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(previous))throw Error('Ungültige IO-Datei');}
  catch(e){previous=[];if(e.code!=='ENOENT')storageError=e.message;}
  // Eigener SDK-Pfad hält die Abhängigkeiten bestehender Steuerungen unverändert.
  try{const sdk=require(path.join(RED.settings.userDir,'phidget-monitor-runtime/node_modules/phidget22'));monitor=new Monitor(sdk,previous);}
  catch(e){monitor=new Monitor(null,previous);dependencyError='Phidget-Lesebibliothek fehlt/defekt. Bitte setup-sdk.sh aus dem Update-Paket ausführen. '+e.message;}
  function save(){if(!monitor)return;try{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(monitor.snapshot()),{mode:0o600});fs.renameSync(file+'.tmp',file);storageError='';lastSave=Date.now();}catch(e){storageError=e.message;}}
  node.kidOutputRows = () => monitor ? [...monitor.rows.values()].filter(r =>
   r.serial === '800330' && r.port === 2 && r.server === 'hub5000' && r.className === 'DigitalOutput') : [];
  function emit(){if(closed)return;
   const rows=monitor?monitor.snapshot():previous.map(r=>({...r,quality:'stale'})),now=Date.now();
   if(now>=archiveRetry)try{archive.record(rows,now);}catch{archiveRetry=now+60000;node.warn('Temperaturarchiv Georgszimmer konnte nicht geschrieben werden.');}
   node.send({topic:'phidgets/io',payload:{io:true,rows,error:dependencyError,storageError,emittedAt:now}});
  }
  async function tick(){if(closed)return;if(monitor&&!dependencyError){try{await monitor.tick();}catch(e){node.warn(e.message);}if(!closed&&Date.now()-lastSave>30000)save();}emit();}
  node.on('input',(msg,send,done)=>{if(msg.payload?.discovery&&monitor)monitor.update(msg.payload.inventory);emit();if(done)done();});
  const timer=setInterval(tick,Math.max(1000,Number(config.pollMs)||2000));
  node.on('close',async(_removed,done)=>{closed=true;clearInterval(timer);archive.close();if(monitor){await monitor.close();save();}if(done)done();});
 }
 RED.nodes.registerType('home-automation-phidget-io',IO);
};
