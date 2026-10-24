'use strict';
const fs=require('node:fs'),path=require('node:path');
const {Monitor}=require('./phidget-io-core.cjs');
module.exports=RED=>{
 function IO(config){
  RED.nodes.createNode(this,config);const node=this;
  const file=path.join(RED.settings.userDir,'phidget-inventory',node.id+'-io.json');
  let previous=[],storageError='',dependencyError='',monitor,closed=false,lastSave=0;
  try{previous=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(previous))throw Error('Ungültige IO-Datei');}
  catch(e){previous=[];if(e.code!=='ENOENT')storageError=e.message;}
  // Eigener SDK-Pfad hält die Abhängigkeiten bestehender Steuerungen unverändert.
  try{const sdk=require(path.join(RED.settings.userDir,'phidget-monitor-runtime/node_modules/phidget22'));monitor=new Monitor(sdk,previous);}
  catch(e){monitor=new Monitor(null,previous);dependencyError='Phidget-Lesebibliothek fehlt/defekt. Bitte setup-sdk.sh aus dem Update-Paket ausführen. '+e.message;}
  function save(){if(!monitor)return;try{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(monitor.snapshot()),{mode:0o600});fs.renameSync(file+'.tmp',file);storageError='';lastSave=Date.now();}catch(e){storageError=e.message;}}
  function emit(){if(closed)return;node.send({topic:'phidgets/io',payload:{io:true,rows:monitor?monitor.snapshot():previous.map(r=>({...r,quality:'stale'})),error:dependencyError,storageError,emittedAt:Date.now()}});}
  async function tick(){if(closed)return;if(monitor&&!dependencyError){try{await monitor.tick();}catch(e){node.warn(e.message);}if(!closed&&Date.now()-lastSave>30000)save();}emit();}
  node.on('input',(msg,send,done)=>{if(msg.payload?.discovery&&monitor)monitor.update(msg.payload.inventory);emit();if(done)done();});
  const timer=setInterval(tick,Math.max(1000,Number(config.pollMs)||2000));
  node.on('close',async(_removed,done)=>{closed=true;clearInterval(timer);if(monitor){await monitor.close();save();}if(done)done();});
 }
 RED.nodes.registerType('home-automation-phidget-io',IO);
};
