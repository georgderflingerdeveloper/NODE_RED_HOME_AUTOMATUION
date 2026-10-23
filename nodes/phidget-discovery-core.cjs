'use strict';
// Textparser für phidget22admin. Geräte, Fähigkeiten und Kanäle bleiben getrennt.
function parseInventory(serverText, deviceText) {
 const servers=[], devices=[]; let current=null, owner=null;
 for(const line of serverText.split(/\r?\n/)) {
  const m=line.match(/^\s*Phidget22 Server\s+(.+?)\s{2,}(\S+)\s+(\S+)\s*$/);
  if(m) servers.push({key:m[3]+'|'+m[1].trim(),name:m[1].trim(),endpoint:m[2],ip:m[3]});
 }
 for(const line of deviceText.split(/\r?\n/)) {
  let m=line.match(/^\s*(.*?) - \((\d+)\) (.+?) v(\d+)(?:\s.*)?$/);
  if(m) {
   owner={server:m[1].trim(),serial:m[2]};
   if(/Dictionary/i.test(m[3])){current=null;continue;}
   current={key:m[2]+'||'+m[3],serial:m[2],server:owner.server,name:m[3],firmware:m[4],port:null,hub:/VINT Hub/i.test(m[3]),channels:[],capabilities:[]};
   devices.push(current);continue;
  }
  m=line.match(/^\s+\((\d+)\/(\d+)\) (.+?) v(\d+)\s*$/);
  if(m&&owner) {
   if(/^Hub Port - .* Mode$/.test(m[3])) {
    const hub=devices.find(d=>d.hub&&d.serial===m[1]);
    if(hub)hub.capabilities.push({port:Number(m[2]),name:m[3]});
    current=null;continue;
   }
   current={key:m[1]+'|'+m[2]+'|'+m[3],serial:m[1],server:owner.server,name:m[3],firmware:m[4],port:Number(m[2]),hub:false,channels:[],capabilities:[]};
   devices.push(current);continue;
  }
  m=line.match(/^\s+\((\d+)\/(\d*)\/(\d+)\) (.+?)\s*$/);
  if(m&&current)current.channels.push({index:Number(m[3]),type:m[4]});
 }
 // Dasselbe Gerät kann von mehreren Servern gemeldet werden.
 const unique=new Map();
 for(const d of devices) {
  const old=unique.get(d.key);
  if(old){if(!old.servers.includes(d.server))old.servers.push(d.server);}
  else unique.set(d.key,{...d,servers:[d.server]});
 }
 if(deviceText.trim() && !owner)throw Error('Unbekanntes Geräteformat: Scan kann nicht zuverlässig ausgewertet werden.');
 if(serverText.trim() && !servers.length && /Phidget22 Server/.test(serverText))throw Error('Unbekanntes Serverformat.');
 return {servers,devices:[...unique.values()]};
}
function mergeInventory(previous, found, now) {
 function merge(oldRows,newRows) {
  const rows=new Map((oldRows||[]).map(r=>[r.key,{...r,state:'offline'}]));
  for(const r of newRows)rows.set(r.key,{...r,firstSeen:rows.get(r.key)?.firstSeen||rows.get(r.key)?.lastSeen||now,state:'online',lastSeen:now});
  return [...rows.values()].sort((a,b)=>a.key.localeCompare(b.key));
 }
 return {servers:merge(previous.servers,found.servers),devices:merge(previous.devices,found.devices),lastSuccess:now};
}
function unknownInventory(old) {
 return {...old,servers:(old.servers||[]).map(r=>({...r,state:'unknown'})),devices:(old.devices||[]).map(r=>({...r,state:'unknown'}))};
}
module.exports={parseInventory,mergeInventory,unknownInventory};
