'use strict';
const fs = require('node:fs');
const {randomUUID} = require('node:crypto');

const boards = {west:['348403'], east:['345764','346077']};
const reserved = {'348403':[0,1,2,3,5], '345764':[0,3,5], '346077':[0]};
const host = side => side === 'west' ? 'PIWEST' : 'PIEAST';
const label = side => side === 'west' ? 'Fenster West' : 'Fenster Ost';

function measure(side, cards, now=Date.now()) {
    const readings = {};
    for (const serial of boards[side]) {
        const card = cards[serial];
        if (!card || card.until <= now || !Number.isInteger(card.inputs))
            throw Error('Keine vollständige Messung von ' + host(side) + '. Bitte erneut messen.');
        readings[serial] = card.inputs;
    }
    return readings;
}
function detect(side, closed, opened, again, saved) {
    const matches = [];
    for (const serial of boards[side]) {
        for (let pin=0;pin<16;pin++) {
            if (reserved[serial].includes(pin)) continue;
            const bit = 1 << pin;
            if (((closed[serial]^opened[serial]) & (opened[serial]^again[serial]) & bit) !== 0)
                matches.push({side,serial,pin,openHigh:Boolean(opened[serial]&bit)});
        }
    }
    if (matches.length !== 1) throw Error(matches.length ? 'Mehrere Eingänge haben gewechselt. Bitte nur dieses Fenster bewegen und erneut beginnen.' : 'Kein eindeutiger Wechsel am Fenster. Bitte erneut beginnen.');
    const found = matches[0];
    if (saved.some(x => x.serial===found.serial && x.pin===found.pin)) throw Error('Dieser Eingang ist bereits als Fenster gespeichert.');
    return found;
}
function windowRows(saved,cards,now) {
    return Object.entries(boards).flatMap(([side,serials])=>{
        const mapped = saved.filter(x => x.side === side);
        if (!mapped.length) return [{id:'window-'+side,name:label(side),source:host(side)+' · Phidget',
            state:serials.every(s=>cards[s]?.until>now)?'Zuordnung ausstehend':'Unbekannt', setup:true,
            until:Math.min(...serials.map(s=>cards[s]?.until||0))}];
        return mapped.map(({name,serial,pin,openHigh})=>{
            const row=cards[serial];
            return {id:'window-'+serial+'-'+pin,name,source:host(side)+' · Eingang '+pin,until:row?.until||0,
                state:!row || row.until<=now ? 'Unbekannt' : Boolean(row.inputs & (1<<pin))===openHigh ? 'Offen' : 'Geschlossen'};
        });
    });
}
function load(file) {
    try {
        const data=JSON.parse(fs.readFileSync(file,'utf8'));
        if (!Array.isArray(data) || data.some(x=>!boards[x?.side]?.includes(x.serial) || !Number.isInteger(x.pin) || x.pin<0 || x.pin>15 || typeof x.openHigh!=='boolean' || typeof x.name!=='string')) throw Error('Format');
        return data;
    } catch(e) {if(e.code==='ENOENT')return [];throw Error('Gespeicherte Fensterzuordnung konnte nicht gelesen werden.');}
}
function save(file,rows) {
    const temp=file+'.'+randomUUID()+'.tmp';
    try {fs.writeFileSync(temp,JSON.stringify(rows),{flag:'wx',mode:0o600});fs.renameSync(temp,file);}
    finally {fs.rmSync(temp,{force:true});}
}
module.exports={boards,host,label,measure,detect,windowRows,load,save};
