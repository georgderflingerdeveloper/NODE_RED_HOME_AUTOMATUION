import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import register from '../nodes/home-automation-motion.js';

test('PIENTRY filtert, dedupliziert und lädt Verlauf und letzten Zeitpunkt nach Neustart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'motion-test-'));
  let Node;
  register({settings:{userDir:dir}, nodes:{registerType(_, ctor){ Node=ctor; }, createNode(node){
    const events=new EventEmitter(); node.on=events.on.bind(events); node.emit=events.emit.bind(events);
  }}});
  const create=()=>new Node({databasePath:'test.sqlite'});
  let node=create();
  const read=msg=>{let result;node.emit('input',msg,m=>result=m.payload,err=>{if(err)throw err});return result;};
  const refresh=()=>read({topic:'presence/refresh'});
  const now=Date.now(), ip='192.168.0.190';
  const motion=(seq,time,boot='boot1')=>JSON.stringify({v:1,detector:'DetectorEntryRoom',kind:'motion',state:'Active',ts:new Date(time).toISOString(),seq,boot});
  try {
    assert.equal(refresh().last,null);
    assert.equal(refresh().capture,null);
    const measurement = new DatabaseSync(join(dir, 'test.sqlite'));
    const rows = [{name:'PICENTER2',ip:'192.168.0.150',port:137,kind:'NetBIOS',count:3}];
    measurement.prepare('INSERT INTO presence_broadcast_observation VALUES (1,?,?,?)')
      .run(now-1200000,now,JSON.stringify(rows));
    measurement.close();
    assert.deepEqual(refresh().capture.rows,rows);
    assert.equal(refresh().total,0);
    read({ip:'127.0.0.1',payload:motion(1,now)});read({ip,payload:'invalid'});read({ip,payload:motion(1,now+3600000)});
    assert.equal(refresh().total,0);
    const first=read({ip,payload:motion(1,now)});assert.equal(first.total,1);assert.equal(first.bins.length,24);assert.match(first.reception.detail,/Active.*Nr. 1/);
    assert.equal(read({ip,payload:motion(1,now)}),undefined);
    assert.equal(read({ip,payload:motion(2,now-3600000)}).last,first.last);
    read({ip,payload:motion(1,now,'boot2')});read({ip,payload:motion(1,now-26*3600000,'previous')});
    node.emit('close');node=create();
    const saved=refresh();assert.equal(saved.total,3);assert.equal(saved.last,first.last);assert.equal(saved.bins.at(-1).count,2);
  } finally {node.emit('close');rmSync(dir,{recursive:true,force:true});}
});

test('Eingang 5 zählt vollständige Zyklen in getrennten, wiederholbar lesbaren Verläufen', () => {
  const dir = mkdtempSync(join(tmpdir(), 'motion-multi-'));
  let Motion;
  register({ settings: { userDir: dir }, nodes: {
    registerType(_, ctor) { Motion = ctor; },
    createNode(node) {
      const events = new EventEmitter();
      node.on = events.on.bind(events);
      node.emit = events.emit.bind(events);
    }
  } });
  const create = detector => new Motion({ databasePath: 'motion.sqlite', detector });
  const east = create('DetectorPiEast');
  const west = create('DetectorPiWest');
  function read(node, msg) {
    let payload;
    node.emit('input', msg, m => { payload = m.payload; }, e => { if (e) throw e; });
    return payload;
  }
  const packet = (payload, ip = '192.168.0.105') => read(west, { ip, payload });
  try {
    packet('9_5_True', '192.168.0.104');
    packet('10_5_False');
    assert.equal(packet('11_5_True'), undefined);
    packet('12_5_False');
    packet('13_1_True');
    const partial = read(west, {topic:'presence/refresh'});
    assert.match(partial.reception.detail, /Eingang 1 = True · Nr. 13/);
    assert.equal(partial.total, 0);
    assert.equal(packet('14_5_True').total, 1);
    assert.equal(packet('14_5_True'), undefined);
    packet('16_5_False');
    assert.equal(packet('17_5_True'), undefined);
    const yesterday = new Date(Date.now() - 86400000);
    const ddmm = [yesterday.getDate(), yesterday.getMonth()+1].map(v => String(v).padStart(2,'0')).join('');
    const lines = ['True','False','True'].map((s,i) =>
      ddmm+yesterday.getFullYear()+'_10h20m0'+i+'s123ms Device digital input  (5)  is: '+s).join('\n');
    const log = { topic: 'presence/east-log', payload: lines };
    assert.equal(read(east, {...log, ip:'192.168.0.105'}), undefined);
    const event = read(east,log);
    assert.equal(event.detector, 'DetectorPiEast');
    assert.equal(event.bins.length, 24);
    assert.equal(read(east,log), undefined);
    read(east, {...log, payload:'', rc:{code:255}});
    assert.match(read(east,{topic:'presence/refresh'}).reception.log,/Abruf fehlgeschlagen/);
    const stamp = new Date(yesterday);
    stamp.setHours(10,20,2,124);
    const eastPacket = {ip:'192.168.0.104',payload:JSON.stringify({v:1,detector:'DetectorPiEast',
      kind:'motion',state:'Active',ts:stamp.toISOString(),boot:'sample',seq:17})};
    assert.equal(read(east,{...eastPacket,ip:'192.168.0.105'}),undefined);
    const before = read(east,{topic:'presence/refresh'});
    const after = read(east,eastPacket);
    assert.match(after.reception.detail,/Nr. 17/);
    assert.equal(before.total,after.total);
    assert.equal(read(east,eastPacket),undefined);
    assert.equal(read(east,log),undefined);
    const persisted = new DatabaseSync(join(dir,'motion.sqlite'));
    assert.equal(persisted.prepare("SELECT count(*) AS n FROM presence_event WHERE detector='DetectorPiEast'").get().n,1);
    persisted.close();
    assert.equal(read(west, {topic:'presence/refresh'}).total, 1);
  } finally {
    east.emit('close'); west.emit('close'); rmSync(dir,{recursive:true,force:true});
  }
});
