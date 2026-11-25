'use strict';
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const io = require('./living-room-io.cjs');
const {kidHardware} = require('./light-output-http.cjs');
const run = promisify(execFile);
const hosts = {east:['PIEAST','104'], west:['PIWEST','105'], ante:['PIANTE','125'],
    entry:['PIENTRY','190'], kid:['PICENTER2','150']};
const boards = {east:[io.first,io.second],west:[io.west],ante:['311893']};
const shared = {upper:'ante',bath:'ante',wc:'ante'};
const ttl = 15000;
function check(state, detail, until = Date.now()+ttl) {return {state,detail,until};}
async function hostCheck(room, answered) {
    const [name,last] = hosts[room];
    if (answered) return check('up',name+' antwortet.');
    try {
        await run('ping',['-n','-c','1','-W','1','192.168.0.'+last],{timeout:2000});
        return check('up',name+' antwortet auf Ping.');
    } catch {return check('down',name+' antwortet weder auf die Abfrage noch auf Ping.');}
}
async function legacy(room) {
    const sample = await io.sampleController(room).catch(()=>null);
    const host = await hostCheck(room,!!sample);
    const app = sample?.application;
    const name = room==='ante' ? 'HomeControl' : 'light.exe';
    const application = !sample ? check('unknown','Dienstprüfung über SSH ohne Rückmeldung.') :
        app?.listening ? check('up',name+' hält den UDP-Empfang auf Port 10000 offen.') :
        check('down',name+' hat keinen aktiven Befehlsempfänger auf Port 10000.');
    if (!sample) return {host,application,io:check('unknown','USB-Karten konnten nicht gelesen werden.')};
    const missing = boards[room].filter(serial => !sample.cards[serial] || !app?.attached?.includes(serial));
    const hardware = missing.length ? check('down','USB-Rückmeldung oder Kartenverbindung der Anwendung fehlt für '+missing.join(', ')+'.') :
        check('up','USB-Karten '+boards[room].join(', ')+' sind in der Anwendung geöffnet und liefern aktuelle Daten.',
            Math.min(...boards[room].map(serial=>sample.cards[serial].until)));
    return {host,application,io:hardware};
}
async function roomApplication(room) {
    const entry = room==='entry';
    const nonce = String(Date.now());
    const path = entry ? '/vorraum/verbindung?probe='+nonce : '/georgszimmer/light';
    let answered = false;
    let active = false;
    try {
        const response = await fetch('http://192.168.0.'+hosts[room][1]+':1880'+path,
            {signal:AbortSignal.timeout(2500),cache:'no-store',redirect:'error'});
        answered = true;
        if (response.ok) {
            const data = await response.json();
            active = entry ? data.room==='vorraum' && data.probe===nonce :
                typeof data.on==='boolean' && Number.isFinite(data.brightness) && data.scenarios?.includes(data.scenario);
        }
    } catch { /* Separate Rechnerprüfung, falls der Raumdienst nicht antwortet. */ }
    return {host:await hostCheck(room,answered),application:active ? check('up','Der Raumflow beantwortet die Statusabfrage.') :
        check('down','Der Raumflow liefert keine gültige Statusantwort.')};
}
function cloudRoom(RED) {
    const state = RED.nodes.getNode('sissi_ewelink_control')?.context().get('room');
    const until = (state?.lastUpdate || 0)+120000;
    if (until<=Date.now() || !Object.keys(state?.devices || {}).length) {
        return {host:check('unknown','Zigbee-Bridge ohne aktuelle Rückmeldung.'),
            application:check('unknown',state?.message || 'Keine aktuelle eWeLink-Geräteliste.'),
            io:check('unknown','Taster und Lichtrelais ohne aktuelle Rückmeldung.')};
    }
    function deviceStatus(names) {
        const missing = names.filter(name=>state.devices[name]!=='online');
        if (missing.length) return check(missing.some(name=>state.devices[name]==='offline')?'down':'unknown',
            missing.map(name=>({bridge:'Bridge',button:'Taster',relay:'Lichtrelais'})[name]).join(', ')+' ohne Verbindungsmeldung.',until);
        return check('up',names.includes('bridge')?'Zigbee-Bridge online.':'Taster und Lichtrelais online.',until);
    }
    return {host:deviceStatus(['bridge']),application:check('up','eWeLink hat die Geräteabfrage beantwortet.',until),
        io:typeof state.light!=='boolean' && state.devices.relay==='online' ? check('unknown','Relaiszustand ist unbekannt.',until) : deviceStatus(['button','relay'])};
}
function register(RED,kitchenOutput) {
    const jobs = new Map();
    async function read(room) {
        if (Object.hasOwn(boards,room)) return legacy(room);
        if (room==='sissi') return cloudRoom(RED);
        if (room==='kitchen') {
            const output = kitchenOutput(RED);
            const ok = output?.OutputCount>0 && output.LedOutput?.length===output.OutputCount;
            return {host:check('up','Der Home-PC beantwortet die lokale Abfrage.'),
                application:check(ok?'up':'down',ok?'Der Küchen-Lichtcontroller antwortet.':'Der Küchen-Lichtcontroller antwortet nicht.'),
                io:check('missing','Für die Küche ist keine physische Ausgangskarte angebunden.')};
        }
        const result = await roomApplication(room);
        if (room==='entry') {
            const lamp = RED.nodes.getNode('vorraum_outputs')?.context().get('lamp');
            result.io = lamp?.validUntil>Date.now() && ['on','off'].includes(lamp.state) ?
                check('up','InterfaceKit 311883 meldet den Lampenausgang.',lamp.validUntil) :
                check('unknown','Keine aktuelle Hardware-Rückmeldung vom Lampenausgang 0 auf 311883.');
        } else {
            const hw = kidHardware(RED);
            const missing = hw.duty.flatMap((value,index)=>value===null?[index]:[]);
            result.io = missing.length ? check(hw.offline?'down':'unknown','Hub 800330, Port 2 · keine aktuelle Hardware-Rückmeldung für Ausgang '+missing.join(', ')+'.') :
                check('up','Hub 800330, Port 2 · alle fünf Ausgänge antworten.',hw.until);
        }
        return result;
    }
    RED.httpNode.get('/home-automation/room-live/:room',async(req,res)=>{
        const id=req.params.room;
        const room=Object.hasOwn(shared,id)?shared[id]:id;
        if (!Object.hasOwn(hosts,room) && room!=='kitchen' && room!=='sissi') return res.sendStatus(404);
        let job=jobs.get(room);
        if (!job || job.next<=Date.now()) {
            job={next:Infinity};
            job.result=read(room).finally(()=>{job.next=Date.now()+3000;});
            jobs.set(room,job);
        }
        res.set('Cache-Control','no-store');
        try {
            const result=await job.result;
            const now=Date.now();
            const checks=Object.fromEntries(Object.entries(result).map(([key,item])=>[key,
                {state:item.state,detail:item.detail,remainingMs:Math.max(0,item.until-now)}]));
            const remainingMs=Math.min(...Object.values(checks).map(c=>c.state==='up'?c.remainingMs:0));
            res.json({remainingMs,checks});
        } catch {res.status(503).json({error:'Raumdiagnose vorübergehend nicht verfügbar.'});}
    });
}
module.exports={register};
