'use strict';
// Provider adapter: no device write commands. Unknown primitive datapoints are retained.
const secret = /token|password|secret|pin|clientauth/i;
const units = {actualTemperature:'°C',setPointTemperature:'°C',humidity:'%',illumination:'lx',power:'W',energyCounter:'Wh',voltage:'V'};
function primitives(value, prefix='', output=[]){
 if(!value || typeof value!=='object')return output;
 for(const [key,item] of Object.entries(value)){
  if(secret.test(key))continue;
  const name=prefix?prefix+'.'+key:key;
  if(item===null || ['string','boolean','number'].includes(typeof item)){
   output.push({name,value:item,unit:units[key]||''});
  }else if(typeof item==='object')primitives(item,name,output);
 }
 return output;
}
function normalize(raw, now=Date.now()){
 if(!raw || !raw.devices || typeof raw.devices!=='object' || Array.isArray(raw.devices))throw Error('Ungültige Geräteantwort');
 const groups=Object.values(raw.groups||{});
 const rows=Object.entries(raw.devices).map(([key,d])=>{
  if(!d || typeof d!=='object')throw Error('Ungültiges Gerät');
  const id=String(d.id||key);
  const member=g=>(g.channels||[]).some(ch=>ch.deviceId===id);
  const rooms=groups.filter(g=>['META','ROOM'].includes(g.type) && (member(g)||(g.groups||[]).some(child=>groups.some(sub=>sub.id===child&&member(sub))))).map(g=>g.label||g.id);
  const channels=d.functionalChannels||{};
  const points=primitives(channels);
  // Some device families publish values at device level, others in functionalChannels.
  for(const [k,v] of Object.entries(d))if(k!=='functionalChannels' && !secret.test(k) && (v===null||['boolean','number','string'].includes(typeof v)))points.push({name:k,value:v,unit:units[k]||''});
  const base=Object.values(channels).find(c=>c.functionalChannelType==='DEVICE_BASE')||d;
  const reach=typeof base.unreach==='boolean'?!base.unreach:null;
  const low=typeof base.lowBat==='boolean'?base.lowBat:null;
  return {id,name:String(d.label||id),model:String(d.modelType||d.type||''),
   serial:String(d.serializedGlobalTradeItemNumber||d.serialNumber||''),rooms:rooms.join(', '),
   reachable:reach,lowBattery:low,points,lastSeen:now,quality:raw.connected===false?'stale':reach===false?'offline':'current'};
 });
 return {schemaVersion:1,provider:'homematic-ip-cloud',connected:typeof raw.connected==='boolean'?raw.connected:null,rows};
}
function mergeRows(oldRows, newRows){
 const ids=new Set(newRows.map(r=>r.id));
 return [...newRows,...oldRows.filter(r=>!ids.has(r.id)).map(r=>({...r,quality:'missing'}))].sort((a,b)=>a.name.localeCompare(b.name,'de'));
}
module.exports={normalize,mergeRows};
