import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const template=fs.readFileSync('flow-src/flows/schedulers--schedulers_flow/templates/schedulers-dashboard.html','utf8');
function ui() {
    let update, timer, destroy, clock=1000;const sent=[];
    const scope={$evalAsync(fn){fn();},$on(event,fn){destroy=fn;},$watch(_,cb){update=cb;},send(msg){sent.push(JSON.parse(JSON.stringify(msg)));}};
    vm.runInNewContext(template.match(/<script>([\s\S]*?)<\/script>/)[1],{scope,Date:class extends Date {static now(){return clock;}},window:{confirm:()=>true,setInterval(fn){timer=fn;return 1;},clearInterval(){timer=null;}}});
    return {scope,sent,tick:()=>timer?.(),advance:ms=>clock+=ms,destroy:()=>destroy(),update:payload=>update({payload})};
}
test('Scheduler-Dashboard erhält Eingaben und Bearbeitungsrevision bei Live-Status',()=>{
    const {scope,sent,update}=ui();update({revision:1,plans:[],targets:[]});scope.newPlan();scope.draft.name='Mein Entwurf';
    update({revision:2,plans:[],targets:[]});scope.savePlan();
    assert.equal(scope.draft.name,'Mein Entwurf');assert.equal(sent.at(-1).payload.revision,1);
});
test('Nach bestätigtem Speichern ist weiteres Speichern ohne Neuladen möglich',()=>{
    const {scope,sent,update}=ui();update({revision:1,plans:[],targets:[]});scope.newPlan();scope.savePlan();const request=sent.at(-1).payload;
    update({revision:2,plans:[],targets:[],ack:{id:request.plan.id,revision:2,token:request.token}});
    scope.draft.name='Weitere Änderung';scope.savePlan();assert.equal(sent.at(-1).payload.revision,2);assert.equal(sent.at(-1).payload.plan.name,'Weitere Änderung');
});
test('Neue Zeitpläne sind deaktiviert; Status löst keine Verwaltungs-Endlosschleife aus',()=>{
    const {scope,sent,update}=ui();scope.newPlan();assert.equal(scope.draft.enabled,false);const count=sent.length;
    update({revision:0,plans:[],targets:[]});assert.equal(sent.length,count);
});

test('Ampel verarbeitet auch gesperrten Speicherstatus ohne Planliste und behält Entwurf',()=>{
 const {scope,update,destroy}=ui();scope.newPlan();scope.draft.name='Nicht verlieren';
 update({health:{state:'error',label:'Fehler',reasons:['Datei beschädigt']},notice:'Gesperrt'});
 assert.equal(scope.health.state,'error');assert.equal(scope.draft.name,'Nicht verlieren');destroy();
});

test('Verbindungsverlust wird gelb, Rückkehr wird grün und Timer endet beim Verlassen',()=>{
 const {scope,update,tick,advance,destroy}=ui();
 const health={state:'running',label:'Läuft',reasons:['Bereit']};update({health});
 advance(60001);tick();assert.equal(scope.health.state,'warning');
 update({health});assert.equal(scope.health.state,'running');
 destroy();advance(60001);tick();assert.equal(scope.health.state,'running');
});

test('Countdown läuft ohne Senden und bewahrt Entwurf; veralteter Status wird rot',()=>{
 const {scope,update,tick,advance,sent}=ui();
 const plan={id:'p',type:'window',next:new Date(11000).toISOString(),health:{state:'running',label:'Läuft'}};
 update({now:1000,plans:[plan],targets:[],health:{state:'running'}});scope.newPlan();scope.draft.name='Bleibt';const count=sent.length;
 assert.equal(scope.countdown(plan),'Umschalten in 00:00:10');advance(1000);tick();assert.equal(scope.countdown(plan),'Umschalten in 00:00:09');assert.equal(sent.length,count);assert.equal(scope.draft.name,'Bleibt');
 advance(60000);tick();assert.equal(scope.planHealth(plan).state,'error');assert.equal(scope.countdown(plan),'—');
});
