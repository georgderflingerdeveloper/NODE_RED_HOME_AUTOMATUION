'use strict';
const udp = require('node:dgram');
const {sample} = require('./living-room-io.cjs');
const host = '192.168.0.125';
const rooms={
    ante:{prefix:'ANTE', offset:0, button:0, names:['Hauptlicht','Licht hinten','Spots Mitte 1','Spots Mitte 2','Nachtlicht']},
    wc:{offset:5, button:1, groupName:'Alle WC-Lichter', names:['Hauptlicht','Dimmlicht']},
    upper:{prefix:'ANTE', offset:2, commandOffset:2, groupName:'Alle Bodenspots', names:['Bodenspots 1','Bodenspots 2']},
    bath:{prefix:'BATH', offset:7, button:2, groupName:'Alle Badlichter', names:['Deckenlicht Mitte','Licht Ecke links','Duschlicht','Licht am Fenster','Licht über der Badewanne']}
};

function supportsControls(prefix){
    return new Promise(resolve=>{
        const socket=udp.createSocket('udp4');
        function finish(ready){clearTimeout(timer);socket.close();resolve(ready);}
        const timer=setTimeout(()=>finish(false),1200);
        socket.once('error',()=>finish(false));
        socket.on('message',(data,peer)=>{
            if(peer.address===host && peer.port===10000 && data.toString()===prefix+'-CONTROLS-V1')finish(true);
        });
        socket.send(prefix+'-CONTROLS?',10000,host);
    });
}

function sendLight(prefix,index,on){
    return new Promise((resolve,reject)=>{
        const socket=udp.createSocket('udp4');
        socket.send(prefix+'-'+index+(on?'-ON':'-OFF'),10000,host,e=>{
            socket.close();if(e)reject(e);else resolve();
        });
    });
}

module.exports = RED=>{
    function PianteRoom(config){
        RED.nodes.createNode(this,config);
        const node=this, room=rooms[config.room];
        if(!room)return;
        let card,ready=false,busy=false,closed=false,last=0;
        function publish(socketid){
            if(closed)return;
            const live=card?.until>Date.now();
            const bit=(mask,index)=>live?Boolean(mask & (1<<index)):null;
            const lights=room.names.map((name,index)=>({name,index,on:bit(card?.outputs,room.offset+index)}));
            const lit=lights.filter(light=>light.on).length;
            const group=live && room.groupName ? (lit===0?'off':lit===lights.length?'on':'mixed') : 'unknown';
            node.send({topic:'ante/state',socketid,payload:{
                room:config.room,lights,group,groupName:room.groupName,
                heartbeat:live && typeof card.heartbeat==='boolean' ? card.heartbeat : null,
                hasButton:Number.isInteger(room.button),button:Number.isInteger(room.button)?bit(card?.inputs,room.button):null,
                presence:config.room==='ante'?bit(card?.inputs,3):null,until:card?.until||0,ready:ready&&live
            }});
        }
        async function refresh(){
            if(busy || Date.now()-last<1500)return;
            busy=true;
            try{
                const [cards,supported]=await Promise.all([sample('ante').catch(()=>({})),room.prefix ? supportsControls(room.prefix) : Promise.resolve(true)]);
                card=cards['311893'];ready=supported;
            }catch{card=null;ready=false;}
            finally{last=Date.now();busy=false;publish();}
        }
        node.on('input',async msg=>{
            if(msg.topic==='ante/read'){publish(msg.socketid);await refresh();return;}
            if(msg.topic!=='ante/set')return;
            const {index,on}=msg.payload||{};
            try{
                const valid=Number.isInteger(index) && index>=0 && index<room.names.length || room.groupName && index==='ALL';
                if(!ready || !(card?.until>Date.now()) || !valid || typeof on!=='boolean')throw Error();
                if(config.room==='wc'){
                    if(index!=='ALL')throw Error();
                    node.send({topic:'wc/group',payload:on});
                }else if(config.room==='upper' && index==='ALL'){
                    for(let i=0;i<room.names.length;i++)await sendLight(room.prefix,room.commandOffset+i,on);
                }else{
                    const channel=room.commandOffset===undefined ? index : room.commandOffset+index;
                    await sendLight(room.prefix,channel,on);
                }
            }catch{if(!closed)node.send({topic:'ante/error',socketid:msg.socketid,payload:{index}});}
        });
        node.on('close',()=>{closed=true;});
    }
    RED.nodes.registerType('home-automation-piante-room',PianteRoom);
};
module.exports.rooms=rooms;
module.exports.supportsControls=supportsControls;
module.exports.sendLight=sendLight;
