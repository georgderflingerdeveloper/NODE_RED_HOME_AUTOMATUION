'use strict';
const DAY=86400000;
const shiftDay=(day,delta)=>new Date(Date.parse(day+'T12:00Z')+delta*DAY).toISOString().slice(0,10);
const names={day:'Tagesauswertung',week:'Wochenauswertung',month:'Monatsauswertung'};
function periodFor(type,day){
    if(!Object.hasOwn(names,type))throw Error('Unbekannter Zeitraum.');
    let start=day,end=day;
    if(type==='week'){
        const weekday=new Date(day+'T12:00Z').getUTCDay();
        start=shiftDay(day,-((weekday+6)%7));end=shiftDay(start,6);
    }
    if(type==='month'){
        start=day.slice(0,7)+'-01';
        const next=new Date(start+'T12:00Z');next.setUTCMonth(next.getUTCMonth()+1);
        end=shiftDay(next.toISOString().slice(0,10),-1);
    }
    const prefix=type==='day'?'':type==='week'?'woche-':'monat-';
    return {type,start,end,through:day,key:prefix+start};
}
function closedPeriod(type,through){
    const p=periodFor(type,through);
    return through===p.end?p:periodFor(type,shiftDay(p.start,-1));
}
function typeOf(key){return key.startsWith('woche-')?'week':key.startsWith('monat-')?'month':'day';}
function nextAutomatic(first,due,archive){
    for(const type of Object.keys(names)){
        let p=closedPeriod(type,first);
        while(p.end<=due){
            if(archive.get(p.key)!==p.end)return p;
            p=periodFor(type,shiftDay(p.end,1));
            p.through=p.end;
        }
    }
}
module.exports={shiftDay,names,periodFor,closedPeriod,typeOf,nextAutomatic};
