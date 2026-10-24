'use strict';
// Erweiterungspunkt: ausschließlich lesbare Kanaltypen und ihre Einheiten.
const TYPES = [
 [/^Digital Input/, 'DigitalInput', 'getState', ''],
 [/^Digital Output/, 'DigitalOutput', 'getDutyCycle', '%'],
 [/^Humidity Sensor$/, 'HumiditySensor', 'getHumidity', '% rF'],
 [/^Temperature Sensor$/, 'TemperatureSensor', 'getTemperature', '°C'],
 [/^Voltage Ratio Input$/, 'VoltageRatioInput', 'getVoltageRatio', 'V/V'],
 [/^Voltage Input$/, 'VoltageInput', 'getVoltage', 'V'],
 [/^Current Input$/, 'CurrentInput', 'getCurrent', 'A'],
 [/^Light Sensor$/, 'LightSensor', 'getIlluminance', 'lx']
];
function describe(inventory) {
 return (inventory.devices||[]).flatMap(d=>(d.channels||[]).map(c=>{
  const spec=TYPES.find(t=>t[0].test(c.type));
  return {key:JSON.stringify([d.serial,d.port,c.index,c.type]),serial:d.serial,port:d.port,index:c.index,type:c.type,device:d.name,server:d.server,deviceState:d.state,className:spec?.[1],getter:spec?.[2],unit:spec?.[3]||''};
 }));
}
function readValue(channel,row) {
 const value=channel[row.getter]();
 if(row.className==='DigitalInput') {
  if(typeof value!=='boolean')throw Error('Ungültiger Digitalwert');
  return {value:value?1:0,boolean:value};
 }
 if(typeof value!=='number'||!Number.isFinite(value))throw Error('Ungültiger Messwert');
 if(row.className==='DigitalOutput') {
  if(value<0||value>1)throw Error('Ungültiger Duty Cycle');
  // State ist der Phidget-API-Status; bei PWM nicht gleichbedeutend mit duty > 0.
  const state=channel.getState();
  if(typeof state!=='boolean')throw Error('Ungültiger Ausgangsstatus');
  return {value:value*100,boolean:state};
 }
 return {value,boolean:null};
}
class Monitor {
 constructor(sdk,previous=[],now=Date.now){this.sdk=sdk;this.now=now;this.rows=new Map(previous.map(r=>[r.key,{...r,quality:'stale',error:'Nach Neustart noch nicht gelesen'}]));this.channels=new Map();this.connections=new Map();this.closed=false;this.inventory={};}
 update(inventory){this.inventory=inventory;const found=describe(inventory);const keys=new Set(found.map(r=>r.key));
  for(const row of found){const old=this.rows.get(row.key)||{};this.rows.set(row.key,{...old,...row,quality:old.quality||'unknown'});}
  for(const row of this.rows.values())if(!keys.has(row.key))row.deviceState='offline';
 }
 snapshot(){return [...this.rows.values()].map(r=>({...r}));}
 async tick(){
  if(this.closed||this.busy)return;this.busy=true;
  try {
   // Nur Server mit IO verwenden. Verbindungen bleiben zwischen Abfragen offen.
   await Promise.all((this.inventory.servers||[]).filter(s=>s.state==='online'&&[...this.rows.values()].some(r=>r.server===s.name&&r.className)).map(async s=>{
    const key=s.ip+'|'+s.endpoint;if(this.connections.has(key))return;
    const port=Number(String(s.endpoint).match(/:(\d+)$/)?.[1]||5661);
    const conn=new this.sdk.NetworkConnection(port,s.ip,{name:s.name});this.connections.set(key,conn);
    conn.onError=()=>{};
    let timer;
    try {await Promise.race([conn.connect(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Verbindungszeit überschritten')),5000);})]);}
    catch(e){conn.close();conn.delete();this.connections.delete(key);}
    finally{clearTimeout(timer);if(this.closed){conn.close();conn.delete();}}
   }));
   await Promise.all([...this.rows.values()].map(async row=>{
    if(this.closed)return;
    if(!row.className){row.quality='unsupported';row.error='Kein IO-Leseadapter für diesen Kanal';return;}
    let ch=this.channels.get(row.key);
    if(row.deviceState!=='online'){
     row.quality='stale';row.error='Gerät nicht aktuell erkannt';
     if(ch){await ch.close();this.channels.delete(row.key);}return;
    }
    try {
     if(!ch){
      ch=new this.sdk[row.className]();this.channels.set(row.key,ch);
      ch.setDeviceSerialNumber(Number(row.serial));ch.setChannel(row.index);ch.setIsRemote(true);ch.setIsHubPortDevice(false);
      if(row.port!==null)ch.setHubPort(row.port);
      ch.onError=(_code,message)=>{row.quality='error';row.error=String(message);};
      ch.onDetach=()=>{row.quality='stale';row.error='Verbindung getrennt';};
      await ch.open(3000);
     }
     if(this.closed)return;
     if(!ch.getAttached()||!ch.getConnection()?.connected)throw Error('Kanal nicht verbunden');
     Object.assign(row,readValue(ch,row),{quality:'live',lastRead:this.now(),error:''});
     row.actualServer=ch.getConnection().name;
    }catch(e){row.quality='error';row.error=String(e.message||e).slice(0,200);if(ch){await ch.close().catch(()=>{});this.channels.delete(row.key);}}
   }));
  }finally{this.busy=false;}
 }
 async close(){this.closed=true;await Promise.all([...this.channels.values()].map(ch=>ch.close().catch(()=>{})));this.channels.clear();for(const conn of this.connections.values()){conn.close();conn.delete();}this.connections.clear();}
}
module.exports={describe,readValue,Monitor};
