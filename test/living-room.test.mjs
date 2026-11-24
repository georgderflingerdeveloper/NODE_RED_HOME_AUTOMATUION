import test from 'node:test';
import assert from 'node:assert/strict';
import io from '../nodes/living-room-io.cjs';

test('Galerie-Gruppen spiegeln die Ausgänge der installierten Controller', () => {
    const view = (mask, until = 100) => Object.fromEntries(io.status({[io.second]:{outputs:mask, until}}, 50).map(row=>[row.id,row.state]));
    assert.equal(view(4).up, 'off');
    assert.equal(view(1).up, 'mixed');
    assert.equal(view(2043).up, 'on');
    assert.equal(view(2043)['up-11'], 'off');
    assert.equal(view(2048)['up-11'], 'on');
    assert.equal(view(2048).up, 'off');
    assert.equal(view(2048, 50)['up-11'], 'unknown');
    assert.equal(view(2048).wall, 'unknown');
});

test('Schalter senden ausschließlich die benannten Lichtbefehle an ihren jeweiligen Pi', async () => {
    const sent = [];
    const capture = (...args) => sent.push(args);
    for (const lamp of io.lights) for (const on of [true, false])
        await io.switchLight(lamp.id, on, capture);
    assert.equal(new Set(sent.map(row=>row.join(' '))).size, 50);
    assert.ok(sent.every(([ip, port, text]) => ['192.168.0.104','192.168.0.105'].includes(ip) && port===10000 && /^TURN-[A-Z0-9-]+-(ON|OFF)$/.test(text)));
    assert.deepEqual(sent[0], ['192.168.0.105',10000,'TURN-LIGHTS-WALL-WEST-ON']);
    assert.deepEqual(sent.at(-1), ['192.168.0.104',10000,'TURN-GALLERY-UP11-OFF']);
    await assert.rejects(io.switchLight('heater', true, capture));
    await assert.rejects(io.switchLight('door', 'OFF', capture));
});

test('Kontaktzustände berücksichtigen Raum, Kanal, Erreichbarkeit, Alter und Quelle', () => {
    const row = {id:'ost',name:'Fenster Ost',rooms:'Wohnzimmer',quality:'current',reachable:true,lastSeen:100,
        points:[{name:'1.functionalChannelType',value:'SHUTTER_CONTACT_CHANNEL'},{name:'1.windowState',value:'CLOSED'}]};
    const hm = {rows:[row,{...row,rooms:'Wintergarten'},{...row,points:[{name:'1.windowState',value:'OPEN'}]}],lastSuccess:100,intervalMs:3000};
    const result = io.contacts(hm, {[io.first]:{inputs:8,until:300}}, 200);
    assert.deepEqual(result.map(r=>r.state), ['Unbekannt','Unbekannt','Geschlossen','Kontakt aktiv','Zuordnung offen']);
    assert.equal(io.contacts(hm, {}, 70000)[2].state,'Unbekannt');
    assert.deepEqual(result[4].candidates.map(r=>r.level), ['inaktiv','unbekannt']);
    assert.deepEqual(io.contacts(hm, {[io.second]:{inputs:16,until:300}}, 200)[4].candidates.map(r=>r.level), ['unbekannt','aktiv']);
    row.quality='stale';
    assert.deepEqual(io.contacts(hm, {}, 200).slice(2,4).map(r=>r.state), ['Unbekannt','Unbekannt']);
    row.quality='current';row.reachable=false;
    assert.equal(io.contacts(hm, {}, 200)[2].state,'Unbekannt');
});

import windows from '../nodes/living-room-windows.cjs';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('West und Ost lernen nur eindeutige Fensterkontakte mit Rückkehr und richtiger Polarität',()=>{
 const west={'348403':16},east={'345764':2,'346077':0};
 const a=windows.detect('west',west,{'348403':0},west,[]);
 const b=windows.detect('east',{'345764':0,'346077':0},east,{'345764':0,'346077':0},[a]);
 assert.deepEqual([a.pin,a.openHigh,b.pin,b.openHigh],[4,false,1,true]);
 assert.throws(()=>windows.detect('west',west,{'348403':0},west,[a]),/bereits/);
 assert.throws(()=>windows.detect('west',west,{'348403':16|32},west,[]),/Kein/);
 assert.throws(()=>windows.detect('west',west,{'348403':64},west,[]),/Mehrere/);
 assert.throws(()=>windows.detect('west',west,{'348403':0},{'348403':0},[]),/Kein/);
 assert.throws(()=>windows.measure('east',{'345764':{until:200,inputs:0}},100),/vollständige/);
 const dir=mkdtempSync(join(tmpdir(),'wz-map-')),file=join(dir,'windows.json');
 try{
   windows.save(file,[{...a,name:'Fenster links'},{...b,name:'Fenster Ost'}]);
   const view=windows.windowRows(windows.load(file),{'348403':{inputs:0,until:200},'345764':{inputs:2,until:200}},100);
   assert.deepEqual(view.map(x=>x.state),['Offen','Offen']);
   assert.deepEqual(windows.windowRows(windows.load(file),{'348403':{inputs:16,until:200}},100).map(x=>x.state),['Geschlossen','Unbekannt']);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
