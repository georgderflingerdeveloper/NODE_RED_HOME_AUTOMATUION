'use strict';
const io=require('./living-room-io.cjs');
const pi=require('./home-automation-piante-room.js');
const rooms={ante:'Vorhaus',upper:'Galerie oben',bath:'Bad'};
function channels(){
 const items=io.lights.filter(l=>!['down','up'].includes(l.id)).map(l=>({key:'living/'+l.id,name:l.name,room:'Wohnzimmer',side:l.serial===io.west?'west':'east'}));
 for(const [key,roomName] of Object.entries(rooms)){
  pi.rooms[key].names.forEach((name,index)=>{
   if(key==='ante' && [2,3].includes(index))return; // dieselben Ausgänge wie Galerie oben
   items.push({key:key+'/'+index,name,room:roomName,side:'ante'});
  });
 }
 return items;
}
const inputs=channels();
function fail(message){throw new Error(message);}
function lightState(c,cards){
 if(c.side!=='ante')return io.status(cards).find(l=>l.id===c.key.split('/')[1])?.state;
 const [key,index]=c.key.split('/'),card=cards['311893'];
 return card?.until>Date.now()?((card.outputs & (1<<(pi.rooms[key].offset+Number(index))))?'on':'off'):'unknown';
}
async function setLight(c,on){
 const [key,id]=c.key.split('/');
 if(key==='living')return io.switchLight(id,on);
 const room=pi.rooms[key];
 if(!await pi.supportsControls(room.prefix))fail('Lichtsteuerung antwortet nicht.');
 return pi.sendLight(room.prefix,Number(id)+(room.commandOffset||0),on);
}
module.exports={inputs,lightState,setLight};
