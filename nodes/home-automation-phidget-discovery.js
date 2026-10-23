'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFile}=require('node:child_process');
const {parseInventory,mergeInventory,unknownInventory}=require('./phidget-discovery-core.cjs');
module.exports=function(RED){
 function Discovery(config){
  RED.nodes.createNode(this,config);const node=this;
  const file=path.join(RED.settings.userDir,'phidget-inventory',node.id+'.json');
  let inventory={servers:[],devices:[],lastSuccess:null},busy=false,closed=false,child=null,storageError='';
  try{inventory=unknownInventory(JSON.parse(fs.readFileSync(file,'utf8')));}
  catch(e){if(e.code!=='ENOENT')storageError='Inventar konnte nicht geladen werden: '+e.message;}
  let health={state:'idle',label:'Noch nicht gescannt',tool:'ungeprüft',serverPackage:'ungeprüft',localService:'ungeprüft'};
  function emit(){if(!closed)node.send({topic:'phidgets/discovery',payload:{inventory,health:{...health,storageError},discovery:true}});}
  function command(binary,args){return new Promise((resolve,reject)=>{
   child=execFile(binary,args,{timeout:20000,maxBuffer:4*1024*1024,env:{...process.env,LC_ALL:'C'}},(e,stdout,stderr)=>{
    child=null;if(e){e.message=(e.code==='ENOENT'?'phidget22admin fehlt oder ist im Node-RED-PATH nicht verfügbar':e.message);reject(e);}
    else if(stderr.trim())reject(Error(stderr.trim().slice(0,500)));
    else resolve(stdout);
   });
  });}
  function probeService(){
   health.serverPackage=(process.env.PATH||'').split(path.delimiter).some(p=>fs.existsSync(path.join(p,'phidget22networkserver')))?'installiert (im PATH)':'nicht im PATH gefunden';
   execFile('systemctl',['is-active','phidget22networkserver'],{timeout:3000},(e,out)=>{
    if(closed)return;health.localService=out.trim()||'Status nicht verfügbar';emit();
   });
  }
  async function scan(){
   if(busy||closed)return;busy=true;
   health={...health,state:'scanning',label:'Phidget-Server und Geräte werden gesucht …',lastAttempt:Date.now()};emit();probeService();
   try{
    const serverText=await command('phidget22admin',['-s','-w','5']);
    if(closed)return;
    health.tool='verfügbar';
    const deviceText=await command('phidget22admin',['-R','-d','-w','5']);
    if(closed)return;
    inventory=mergeInventory(inventory,parseInventory(serverText,deviceText),Date.now());
    // Originalausgabe erhält auch Angaben, die der Parser noch nicht strukturiert.
    inventory.rawScan={servers:serverText,devices:deviceText};
    try{
     fs.mkdirSync(path.dirname(file),{recursive:true});
     fs.writeFileSync(file+'.tmp',JSON.stringify(inventory,null,2),{mode:0o600});fs.renameSync(file+'.tmp',file);storageError='';
    }catch(e){storageError='Inventar nicht gespeichert: '+e.message;}
    const count=inventory.devices.filter(d=>d.state==='online').length;
    health={...health,state:storageError?'warning':count?'online':'idle',label:count+' Hardwaregeräte gefunden',error:null};
   }catch(e){
    inventory=unknownInventory(inventory);
    health={...health,state:'error',tool:e.code==='ENOENT'?'fehlt / PATH prüfen':health.tool,label:'Scan fehlgeschlagen',error:e.message.slice(0,700)};
   }finally{busy=false;emit();node.status({fill:health.state==='error'?'red':health.state==='online'?'green':'yellow',shape:'dot',text:health.label});}
  }
  node.on('input',(msg,send,done)=>{
   if(msg.topic==='phidgets/get'){emit();}
   else if(msg.topic==='phidgets/scan'){scan();}
   else if(msg.topic==='system/network/overview'&&msg.payload?.system?.network?.state==='online'){
    // IP-Scanner liefert mehrere Updates: maximal einmal pro Minute nachtriggern.
    if(Date.now()-(health.lastAttempt||0)>60000)scan();
   }
   if(done)done();
  });
  const start=setTimeout(scan,1500);
  const interval=setInterval(scan,Math.max(30,Number(config.interval)||60)*1000);
  node.on('close',()=>{closed=true;clearTimeout(start);clearInterval(interval);if(child)child.kill();});
 }
 RED.nodes.registerType('home-automation-phidget-discovery',Discovery);
};
