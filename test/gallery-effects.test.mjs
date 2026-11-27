import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import gallery from '../nodes/gallery.cjs';
function fixture(initial=0){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync('nodes/home-automation-history.schema.sql','utf8'));let mask=initial,time=Date.now();
 const writes=[];
 const engine=gallery.create(db,{timers:false,now:()=>time,random:()=>0,read:async()=>mask,
  write:async(id,on)=>{writes.push(id);const i=id.startsWith('down')?Number(id.slice(5))-1:Number(id.slice(3))+3;mask=on?mask|(1<<i):mask&~(1<<i);},
  temp:()=>({value:21.3,observed_at:time-3000,device_name:'Wohnzimmer'})});
 return {engine,db,writes,time:()=>time,wait:n=>time+=n,close(){engine.close();db.close();}};
}
test('Teach führt durch Stabilisierung, Handyverlust und Bewertung und archiviert nur zugeordnete Positionen',async()=>{
 const f=fixture(),e=f.engine;
 try{
 f.db.exec("INSERT INTO gallery_phone(name,token_hash) VALUES('Handy A','a'),('Handy B','b')");
 await e.command({action:'teach',place:'Sofa',phone:1});const id=e.state().step.id;
 assert.match(e.state().guide.message,/pausiert/);
 const sample={kind:'position',at:f.time(),lat:48,lon:14,accuracy:12};
 e.phone(2,{step:id,samples:[sample]});e.phone(1,{step:id+1,samples:[sample]});
 assert.equal(f.db.prepare('SELECT count(*) n FROM gallery_sample').get().n,0);
 e.phone(1,{step:id,samples:[sample,sample]});
 assert.equal(f.db.prepare('SELECT count(*) n FROM gallery_sample').get().n,1);
 await assert.rejects(e.command({action:'rate',step:id,rating:'angenehm'}),/acht/);
 f.wait(8100);await e.command({action:'rate',step:id,rating:'angenehm'});await e.command({action:'advance'});
 assert.equal(e.state().archive[0].temperature,21.3);assert.deepEqual(f.writes,['down-1']);
 f.wait(16000);await assert.rejects(e.command({action:'advance'}),/pausiert/);
 await e.command({action:'stop'});e.phone(1,{step:id,samples:[sample]});assert.equal(e.state().teach,null);
 const learned=e.state().learned[0];assert.equal(learned.count,1);
 await e.command({action:'effect',area:'gemeinsam',learnedId:learned.id});await e.tick();assert.equal(e.state().mask,0);assert.equal(e.state().active,'');
 }finally{f.close();}
});
test('Zeitfenster über Wiener Mitternacht behält denselben Abend',()=>{
 const c={scheduled:true,start_time:'20:00',end_time:'02:00'};
 assert.equal(gallery.windowKey(Date.parse('2026-11-24T23:54:00Z'),c),'2026-11-24');
 assert.equal(gallery.windowKey(Date.parse('2026-11-25T04:54:00Z'),c),null);
});

test('Das gekoppelte Handy startet den geführten Lauf und kann einen freien Lauf übernehmen',async()=>{
 const f=fixture(),e=f.engine;
 try{
  f.db.exec("INSERT INTO gallery_phone(name,token_hash) VALUES('Handy A','a'),('Handy B','b')");
  assert.match(e.phone(1,{}).message,/Lernlauf starten/);
  const first=await e.phoneCommand(1,{action:'start',place:'Sofa'});
  assert.match(first.message,/acht|8 Sekunden/);
  await assert.rejects(e.phoneCommand(2,{action:'start'}),/anderer Ablauf/);
  await assert.rejects(e.phoneCommand(2,{action:'advance',step:first.step}));
  f.wait(8100);
  const rated=await e.phoneCommand(1,{action:'rate',rating:'angenehm',step:first.step});
  assert.match(rated.message,/gespeichert/);
  const next=await e.phoneCommand(1,{action:'advance',step:first.step});
  assert.match(next.scene,/Unten 1/);
  await assert.rejects(e.phoneCommand(1,{action:'stop',step:first.step}));
  assert.equal((await e.phoneCommand(1,{action:'stop',step:next.step})).step,null);
  await e.command({action:'teach',place:'Galerie'});
  const adopted=await e.phoneCommand(2,{action:'start'});
  assert.equal(adopted.teach,e.state().teach.id);
  assert.equal(e.state().teach.phone,2);
 }finally{f.close();}
});

test('Handy-Diagnose trennt Lichtquelle, Messzeitraum, Raumtemperatur und Geräte',async()=>{
 const f=fixture(),e=f.engine;
 try{
  f.db.exec("INSERT INTO gallery_phone(name,token_hash) VALUES('A','a'),('B','b')");
  await e.command({action:'teach',phone:1,place:'Sofa'});
  const step=e.state().step.id,at=f.time();
  e.phone(1,{kind:'lux',gps:true,step,samples:[{at,kind:'lux',value:0},{at,kind:'position',lat:47,lon:14,accuracy:9}]});
  f.wait(1000);e.phone(1,{kind:'camera',step,samples:[{at:f.time(),kind:'camera',value:42}]});
  const d=e.diagnostics(1,at,at+1);
  assert.equal(d.count,2);assert.equal(d.steps[0].lux_min,0);assert.equal(d.steps[0].camera_max,null);
  assert.equal(d.position.accuracy,9);assert.equal(d.live.kind,'camera');assert.equal(d.live.reading.value,42);assert.equal(d.live.gps,null);
  assert.equal(d.steps[0].temperature,21.3);
  assert.deepEqual(e.diagnostics(2,at,at+2000).steps,[]);
  e.phone(1,{stop:true});assert.equal(e.diagnostics(1,at,at+2000).live,null);
  assert.equal(e.diagnostics(1,at,at+2000).trend.length,2);
  assert.throws(()=>e.diagnostics(1,at,at));
 }finally{f.close();}
});

for(const mode of ['sequenziell','zufall']){
 test('Fester Abendeffekt '+mode+' schaltet alle 15 Kreise einzeln weiter, auch mit nur einer gelernten Szene',async()=>{
  const f=fixture();
  try{
   f.db.exec("INSERT INTO gallery_teach(start,end,place) VALUES(1,2,'Sofa'); INSERT INTO gallery_step(teach,at,mask,rating) VALUES(1,1,0,'angenehm')");
   await f.engine.command({action:'effect',mode,seconds:2,area:'gemeinsam'});
   let previous=0;
   const on=[];
   for(let step=0;step<65;step++){
    await f.engine.tick();
    assert.equal(f.writes.length,step+1);
    const mask=f.engine.state().mask,changed=mask^previous;
    assert.ok(changed && !(changed&(changed-1)));
    if(mask&changed)on.push(f.writes.at(-1));
    const lit=mask.toString(2).replaceAll('0','').length;
    if(step>=2)assert.ok(lit===2||lit===3);
    previous=mask;
    f.wait(1999);await f.engine.tick();assert.equal(f.writes.length,step+1);f.wait(1);
   }
   assert.equal(new Set(on).size,15);
   if(mode==='sequenziell')assert.deepEqual(on.slice(0,6),['down-1','down-2','down-3','down-4','up-1','up-2']);
   else assert.notEqual(on[0],'down-1');
   await f.engine.command({action:'stop'});f.wait(10000);await f.engine.tick();assert.equal(f.writes.length,65);
  }finally{f.close();}
 });
}

test('Schrittzeit und Modus werden gespeichert; ungültige Grenzen und unbekannte Lernläufe starten nichts',async()=>{
 const f=fixture(),e=f.engine;
 try{
  for(const seconds of [1,2.5,3601,null])await assert.rejects(e.command({action:'effect',mode:'zufall',seconds}),/Schrittzeit/);
  await assert.rejects(e.command({action:'effect',learnedId:55}),/Lernlauf/);
  assert.equal(e.state().active,'');assert.deepEqual(f.writes,[]);
  await e.command({action:'playback',mode:'ruhig',seconds:3600});assert.equal(e.state().config.mode,'sequenziell');
  await e.command({action:'effect'});await e.tick();
  f.wait(1000);await e.command({action:'playback',mode:'zufall',seconds:2});await e.tick();assert.equal(f.writes.length,1);
  f.wait(1000);await e.tick();assert.equal(f.writes.length,2);
  assert.equal(f.db.prepare('SELECT mode,seconds FROM gallery_config').get().mode,'zufall');
 }finally{f.close();}
});

test('Gelernte Effekte spielen nur angenehme Lichtbilder des gewählten abgeschlossenen Lernlaufs',async()=>{
 const f=fixture(),e=f.engine;
 try{
  f.db.exec(`INSERT INTO gallery_teach(start,end,place) VALUES(1,2,'Sofa'),(3,4,'Tisch');
    INSERT INTO gallery_step(teach,at,mask,rating) VALUES(1,1,1,'angenehm'),(1,2,3,'angenehm'),(1,3,16,'zu hell'),(2,3,32,'angenehm')`);
  assert.deepEqual(e.state().learned.map(r=>r.count),[1,2]);
  await e.command({action:'effect',area:'gemeinsam',learnedId:1,mode:'sequenziell',seconds:2});
  const masks=[];
  for(let i=0;i<5;i++){await e.tick();masks.push(e.state().mask);f.wait(2000);}
  assert.deepEqual(masks,[1,3,1,3,1]);
 }finally{f.close();}
});

test('Oben ist vorausgewählt. Beide Modi respektieren den Bereich auch bei einem Wechsel im Betrieb',async()=>{
 for(const mode of ['sequenziell','zufall']){
  const f=fixture(15),e=f.engine;
  try{
   assert.equal(e.state().config.area,'oben');
   await assert.rejects(e.command({action:'effect',area:'unbekannt'}),/Oben/);
   await e.command({action:'effect',mode,seconds:2});
   for(const area of ['oben','unten']){
    if(area==='unten')await e.command({action:'playback',area});
    const outside=area==='oben'?15:32752;
    const preserved=e.state().mask&outside;
    const start=f.writes.length;
    for(let i=0;i<60;i++){
     await e.tick();f.wait(2000);
     assert.equal(e.state().mask&outside,preserved);
    }
    const writes=f.writes.slice(start);
    assert.equal(writes.length,60);
    assert.ok(writes.every(id=>id.startsWith(area==='oben'?'up-':'down-')));
    assert.equal(new Set(writes).size,area==='oben'?11:4);
   }
   await e.command({action:'stop'});
   await e.command({action:'effect',mode,seconds:2});
   await e.tick();assert.match(f.writes.at(-1),/^down-/);
  }finally{f.close();}
 }
});

test('Gelernte Lichtbilder werden auf den Bereich begrenzt und dort identische Bilder zusammengefasst',async()=>{
 const f=fixture(7),e=f.engine;
 try{
  f.db.exec(`INSERT INTO gallery_teach(start,end,place) VALUES(1,3,'Sofa');
   INSERT INTO gallery_step(teach,at,mask,rating) VALUES(1,1,17,'angenehm'),(1,2,18,'angenehm')`);
  await e.command({action:'effect',learnedId:1});await e.tick();
  assert.deepEqual(f.writes,['up-1']);assert.equal(e.state().mask,23);assert.equal(e.state().active,'');
 }finally{f.close();}
});

test('Bestehender Zeitplan erhält Oben und verwendet nach Neustart den gespeicherten Bereich',async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync('nodes/home-automation-history.schema.sql','utf8'));
 db.exec("ALTER TABLE gallery_config DROP COLUMN area; UPDATE gallery_config SET mode='zufall', seconds=45");
 const now=()=>Date.parse('2026-11-27T19:00Z'),writes=[];
 const options={timers:false,now,read:async()=>writes.length?1:0,write:async id=>writes.push(id)};
 let e=gallery.create(db,options);
 try{
  const config=e.state().config;
  assert.deepEqual([config.area,config.mode,config.seconds],['oben','zufall',45]);
  await e.command({action:'settings',mode:'sequenziell',seconds:45,area:'unten',scheduled:true,start:'19:00',end:'22:00'});
  e.close();e=gallery.create(db,options);
  await e.tick();await e.tick();
  assert.deepEqual(writes,['down-1']);assert.equal(e.state().config.area,'unten');
 }finally{e.close();db.close();}
});
