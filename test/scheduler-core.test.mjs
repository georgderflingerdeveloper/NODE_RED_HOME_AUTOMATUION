import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {Scheduler,initialState,validatePlan,localTime,windowValue} = require('../nodes/scheduler-core.cjs');
const at = text => Date.parse(text);
const target = {id:'kitchen-light',name:'Küche',room:'kitchen',kind:'light',groups:['indoor'],actions:['brightness','on','off','scenario'],scenarios:['Abend']};
function setup(time='2026-10-05T21:00:00+02:00') {
    const now=at(time), engine=new Scheduler();
    engine.state.plans[0].enabled=true;
    engine.register(target,now);
    return {engine,now};
}
function save(engine,plan,now) {return engine.handle({topic:'scheduler/manage',payload:{command:'Save',revision:engine.state.revision,plan}},now);}
function fire(planId,now) {return {payload:{triggerTimestamp:now,config:{name:'schedule-'+planId}}};}

for (const [time,value] of [['20:59',100],['21:00',30],['23:59',30],['00:00',30],['05:59',30],['06:00',100]]) {
    test(`Nachtfenster liefert um ${time} exakt ${value} %`,()=>{
        const {engine,now}=setup(`2026-10-05T${time}:00+02:00`);
        assert.equal(engine.reconcile(now)[0].payload.action.value,value);
        assert.equal(engine.reconcile(now+1000).length,0);
    });
}
test('Montag-Nacht reicht bis Dienstag; Sonntag-Nacht ist nicht ausgewählt',()=>{
    const p=initialState().plans[0];p.days=[1];
    for(const [iso,value] of [['2026-10-05T01:00:00+02:00',100],['2026-10-05T22:00:00+02:00',30],['2026-10-06T01:00:00+02:00',30],['2026-10-06T22:00:00+02:00',100]])assert.equal(windowValue(p,localTime(at(iso),'Europe/Vienna')).value,value);
});
for(const time of ['2026-03-29T00:59:00Z','2026-03-29T01:01:00Z','2026-10-25T00:30:00Z','2026-10-25T01:30:00Z'])test(`Zeitumstellung: Nachtzustand bleibt korrekt bei ${time}`,()=>{
    const {engine,now}=setup(time);assert.equal(engine.reconcile(now)[0].payload.action.value,30);
});
test('Neustart stellt aktuellen Fensterzustand erst nach Registrierung her',()=>{
    const {engine,now}=setup();engine.reconcile(now);
    const restarted=new Scheduler(engine.state);
    assert.equal(restarted.reconcile(now).length,0);
    const output=restarted.handle({topic:'scheduler/register',payload:target},now);
    assert.equal(output.commands[0].payload.action.value,30);
});
test('Ungültige Werte und Termine werden abgewiesen',()=>{
    const original=initialState().plans[0];
    for(const change of [{start:'25:00'},{end:'21:00'},{action:{type:'brightness',value:101}},{days:[]},{priority:-1},{id:'__proto__'},{validFrom:'2026-02-30'},{type:'once',at:'2026-10-05T12:00:00'},{type:'interval',intervalMinutes:0},{type:'solar',solarEvent:'sunset',latitude:200,longitude:0,offsetMinutes:0}])assert.throws(()=>validatePlan({...original,...change}));
});
test('Konkurrierende Editoren: veraltete Revision wird nicht gespeichert',()=>{
    const {engine,now}=setup();const old=engine.state.revision;
    save(engine,{...engine.state.plans[0],name:'Neu'},now);
    assert.throws(()=>engine.handle({topic:'scheduler/manage',payload:{command:'Delete',id:'kitchen-night',revision:old}},now),/inzwischen/);
    assert.equal(engine.state.plans[0].name,'Neu');
});
test('Alle Räume und Raumgruppen erreichen nur passende Gerätearten und Aktionen',()=>{
    const {engine,now}=setup();
    engine.register({...target,id:'bedroom-light',room:'bedroom'},now);
    engine.register({...target,id:'kitchen-socket',kind:'socket',actions:['on','off']},now);
    engine.state.plans[0].target={scope:'all',kind:'light'};
    assert.deepEqual(engine.reconcile(now).map(m=>m.payload.targetId),['kitchen-light','bedroom-light']);
    engine.live.applied={};engine.state.plans[0].target={scope:'room',id:'bedroom',kind:'*'};
    assert.deepEqual(engine.reconcile(now).map(m=>m.payload.targetId),['bedroom-light']);
    engine.live.applied={};engine.state.plans[0].target={scope:'group',id:'indoor',kind:'light'};
    assert.equal(engine.reconcile(now).length,2);
});
test('Priorität und ID lösen überlappende Fenster deterministisch auf',()=>{
    const {engine,now}=setup();const p=engine.state.plans[0];
    engine.state.plans.push({...p,id:'priority',priority:99,action:{type:'brightness',value:60}});
    assert.equal(engine.reconcile(now)[0].payload.action.value,60);
    engine.live.applied={};engine.state.plans[1].priority=10;engine.state.plans[1].id='aaa';
    assert.equal(engine.reconcile(now)[0].payload.action.value,60);
});
test('Manuelle Bedienung wird nicht zyklisch überschrieben; Pause endet mit Neuberechnung',()=>{
    const {engine,now}=setup();engine.reconcile(now);
    engine.handle({topic:'scheduler/manage',payload:{command:'PauseTarget',id:target.id}},now);
    engine.register(target,now+3599000);assert.equal(engine.reconcile(now+3599000).length,0);
    engine.register(target,now+3600001);assert.equal(engine.reconcile(now+3600001)[0].payload.action.value,30);
});
test('Deaktivieren und Löschen schicken kein überraschendes Einschalten',()=>{
    const {engine,now}=setup();engine.reconcile(now);
    assert.equal(engine.handle({topic:'scheduler/manage',payload:{command:'Enable',enabled:false,revision:0}},now).commands.length,0);
    assert.equal(engine.handle({topic:'scheduler/manage',payload:{command:'Delete',id:'kitchen-night',revision:1}},now).commands.length,0);
});
test('Einmalereignis wird trotz doppelter Zustellung und Neustart nur einmal gesendet',()=>{
    const {engine,now}=setup();engine.state.plans=[];
    const plan={...initialState().plans[0],id:'once',enabled:true,type:'once',at:new Date(now).toISOString(),action:{type:'off'}};
    save(engine,plan,now);assert.equal(engine.handle(fire('once',now),now).commands.length,1);
    assert.equal(engine.handle(fire('once',now),now).commands.length,0);
    const restarted=new Scheduler(engine.state);restarted.register(target,now);
    assert.equal(restarted.handle(fire('once',now),now).commands.length,0);
});
test('Ereignisse während Offlinezeit werden nicht später nachgeholt',()=>{
    const {engine,now}=setup();engine.state.plans=[{...engine.state.plans[0],id:'weekly',type:'weekly',action:{type:'on'}}];engine.live.seen={};
    assert.equal(engine.handle(fire('weekly',now),now).commands.length,0);engine.register(target,now);
    assert.equal(engine.handle(fire('weekly',now),now).commands.length,0);
    assert.equal(engine.handle(fire('weekly',now-300000),now).commands.length,0);
});
test('Gleiche Wochenzeit in wiederholter Winterzeit-Stunde wird nur einmal ausgeführt',()=>{
    const {engine}=setup();engine.state.plans=[{...engine.state.plans[0],id:'weekly',type:'weekly',start:'02:30',action:{type:'on'}}];
    const first=at('2026-10-25T00:30:00Z'),second=at('2026-10-25T01:30:00Z');
    engine.register(target,first);assert.equal(engine.handle(fire('weekly',first),first).commands.length,1);
    engine.register(target,second);assert.equal(engine.handle(fire('weekly',second),second).commands.length,0);
});
test('Intervall bleibt beim Neuaufbau am festen Raster ausgerichtet',()=>{
    const {engine,now}=setup();engine.state.plans=[{...engine.state.plans[0],type:'interval',intervalMinutes:60}];
    const a=engine.cronCommands(now+1000).find(m=>m.payload?.command==='add').payload.expression;
    const b=engine.cronCommands(now+5000).find(m=>m.payload?.command==='add').payload.expression;
    assert.equal(a,b);
});
test('Gleichzeitige Ereignisse erhalten unabhängig von Eingangsreihenfolge dieselbe Priorität',()=>{
    for(const reverse of [false,true]) {
        const {engine,now}=setup();const p=engine.state.plans[0];
        engine.state.plans=[{...p,id:'low',type:'weekly',action:{type:'off'}},{...p,id:'high',priority:99,type:'weekly',action:{type:'on'}}];
        const events=[fire('low',now),fire('high',now)];if(reverse)events.reverse();
        const result=engine.handleBatch(events,now);assert.equal(result.commands.length,1);assert.equal(result.commands[0].payload.action.type,'on');
    }
});
test('Szenarioaktionen werden nur bei bekanntem Szenarionamen gesendet',()=>{
    const {engine,now}=setup();engine.state.plans=[{...engine.state.plans[0],type:'weekly',action:{type:'scenario',value:'Fehlt'}}];
    assert.equal(engine.handle(fire('kitchen-night',now),now).commands.length,0);
});
test('Controller-Bestätigung wird korreliert; fehlende Bestätigung sichtbar statt blind erneut schalten',()=>{
    const {engine,now}=setup();const command=engine.reconcile(now)[0].payload;
    engine.handle({topic:'scheduler/ack',payload:{requestId:command.requestId,targetId:'wrong',ok:true}},now);
    assert.equal(engine.live.feedback[target.id].ok,null);
    engine.reconcile(now+16000);assert.equal(engine.live.feedback[target.id].ok,false);
    assert.equal(engine.reconcile(now+17000).length,0);
});
test('Gültigkeitszeitraum verhindert zu frühe und zu späte Ausführung',()=>{
    const {engine,now}=setup();engine.state.plans[0].validFrom='2026-10-06';assert.equal(engine.reconcile(now).length,0);
    engine.state.plans[0].validFrom='2026-10-01';engine.state.plans[0].validUntil='2026-10-04';assert.equal(engine.reconcile(now).length,0);
});

function tick(engine,now) { return engine.handle({payload:{triggerTimestamp:now,config:{name:'scheduler-watchdog'}}},now); }
test('Ampel: Idle, Warnung, Läuft, Fehler, Erholung – Priorität und Gründe',()=>{
 const engine=new Scheduler(),now=at('2026-10-10T12:00:00Z');
 assert.equal(engine.status(now).health.state,'idle');
 engine.state.plans[0].enabled=true;
 assert.equal(engine.status(now).health.state,'warning');
 engine.register(target,now);tick(engine,now);
 assert.equal(engine.status(now).health.state,'running');
 const request=Object.keys(engine.live.pending)[0];
 engine.handle({topic:'scheduler/ack',payload:{targetId:target.id,requestId:request,ok:false,text:'Controller lehnt ab'}},now);
 assert.equal(engine.status(now).health.state,'error');
 engine.live.applied={};const retry=engine.reconcile(now)[0];
 engine.handle({topic:'scheduler/ack',payload:{targetId:target.id,requestId:retry.payload.requestId,ok:true}},now);
 assert.equal(engine.status(now).health.state,'running');
 engine.state.enabled=false;assert.equal(engine.status(now).health.state,'idle');
 engine.handle({topic:'scheduler/cron-error',payload:{message:'Zeitgeber defekt'}},now);
 assert.equal(engine.status(now).health.state,'error');
 engine.handle({payload:{command:{command:'list-all'},result:[{config:{name:'scheduler-watchdog'}}]}},now);
 assert.equal(engine.status(now).health.state,'idle');
});
test('Fehler erst nach vollständiger Zeitgeber-Reparatur löschen',()=>{
 const {engine,now}=setup();tick(engine,now);engine.live.pending={};
 engine.handle({topic:'scheduler/cron-error'},now);
 engine.handle({payload:{command:{command:'list-all'},result:[{config:{name:'scheduler-watchdog'}}]}},now);
 assert.equal(engine.status(now).health.state,'error');
 const result=['scheduler-watchdog','schedule-kitchen-night-start','schedule-kitchen-night-end'].map(name=>({config:{name}}));
 engine.handle({payload:{command:{command:'list-all'},result}},now);
 assert.equal(engine.status(now).health.state,'running');
});
test('Veralteter Tick, Offline-Empfänger und Pause melden Warnung; Neustart erfindet kein Grün',()=>{
 const {engine,now}=setup();tick(engine,now);engine.live.pending={};
 assert.equal(engine.status(now+45001).health.state,'warning');
 tick(engine,now+181000);assert.equal(engine.status(now+181000).health.state,'warning');
 engine.register(target,now+181000);engine.state.pauses[target.id]=now+200000;
 assert.match(engine.status(now+181000).health.reasons.join(),/pausiert/);
 const restarted=new Scheduler(engine.state);assert.equal(restarted.status(now+181000).health.state,'warning');
 assert.equal(restarted.state.pauses[target.id],now+200000);
});
test('Abgelaufener Einmaltermin und zukünftige Gültigkeit sind Idle',()=>{
 const {engine,now}=setup();engine.state.plans[0]={...engine.state.plans[0],type:'once',at:new Date(now-1000).toISOString()};
 assert.equal(engine.status(now).health.state,'idle');
 engine.state.plans[0]={...initialState().plans[0],enabled:true,validFrom:'2099-01-01'};
 assert.equal(engine.status(now).health.state,'idle');
});
test('Befehle tragen Raum-ID des registrierten Empfängers; fehlendes ACK wird rot',()=>{
 const {engine,now}=setup();tick(engine,now);
 assert.equal(engine.command(engine.state.plans[0],target,{type:'off'},now).payload.roomId,'kitchen');
 engine.reconcile(now+15001);assert.equal(engine.status(now+15001).health.state,'error');
});
