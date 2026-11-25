'use strict';
const fs = require('node:fs');
const path = require('node:path');
const io = require('./living-room-io.cjs');
const {inputs, lightState, setLight} = require('./load-devices.cjs');
const kidUrl = 'http://192.168.0.150:1880/georgszimmer/light';

async function kidRequest(action) {
    const options = {signal: AbortSignal.timeout(3500)};
    if (action) Object.assign(options, {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(action)
    });
    const response = await fetch(kidUrl, options);
    if (!response.ok) throw Error('PICENTER2 antwortet nicht.');
    return response.json();
}
function kitchenOutput(RED) {
    const node = RED.nodes.getNode('lightcontrollerkitchen');
    if (!node) return;
    if (!node.context().get('lightControllerKitchen')) node.receive({topic:'house/kitchen/read'});
    return node.context().get('lightControllerKitchen')?.getOutput();
}
function entryLamp(RED) {
    return RED.nodes.getNode('vorraum_outputs')?.context().get('lamp');
}
function validLevels(values, count, max) {
    return Array.isArray(values) && values.length === count &&
        values.every(value => Number.isFinite(value) && value >= 0 && value <= max);
}
function kidScene(room, pwm) {
    const levels = room?.sceneLevels?.[room.scenario];
    if (!room?.on || room.scenario === 'Gute Nacht' || room.scenario !== pwm?.profile ||
        !validLevels(pwm.duty,5,1) || !validLevels(levels,5,100) ||
        !levels.every((level,index) => (level > 0) === (pwm.duty[index] > 0)) ||
        !levels.some(Boolean) || !(room.brightness > 0 && room.brightness <= 100)) return null;
    return {profile:room.scenario, levels, brightness:room.brightness};
}
async function restoreKid(saved) {
    const room = await kidRequest();
    if (JSON.stringify(room.sceneLevels?.[saved.profile]) !== JSON.stringify(saved.levels))
        throw Error('Die Szene in Georgszimmer wurde geändert.');
    if (room.brightness !== saved.brightness)
        await kidRequest({type:'brightness', value:saved.brightness, ramp:false});
    const result = await kidRequest({type:'on', profile:saved.profile, ramp:false});
    if (!result.on || result.scenario !== saved.profile) throw Error('PICENTER2 hat die Szene nicht bestätigt.');
    if (result.brightness !== saved.brightness)
        await kidRequest({type:'brightness', value:saved.brightness, ramp:false});
}

async function capture(RED) {
    const [east, west, ante, kid, pwm] = await Promise.all([
        ...['east','west','ante'].map(side => io.sample(side).catch(() => ({}))),
        kidRequest().catch(() => null),
        require('./light-output-http.cjs').readKidOutputs().catch(() => null)
    ]);
    const cards = {...east,...west,...ante};
    const channels = inputs.filter(channel => lightState(channel,cards) === 'on').map(channel => channel.key);
    const entry = entryLamp(RED);
    const kitchen = kitchenOutput(RED);
    const relay = RED.nodes.getNode('sissi_ewelink_control')?.context().get('room');
    return {
        channels, entry: entry?.state === 'on' && entry.validUntil > Date.now(),
        kitchen: kitchen?.LedOutput.some(Boolean) ? {outputs:kitchen.LedOutput,state:kitchen.PersistentState} : null,
        kid:kidScene(kid,pwm),
        relay:relay?.light === true && relay.lastUpdate > Date.now()-120000 &&
            relay.devices.relay === 'online' && relay.devices.bridge === 'online'
    };
}
function count(saved) {
    if (!saved) return 0;
    return saved.channels.length + [saved.entry,saved.kitchen,saved.kid,saved.relay].filter(Boolean).length;
}

module.exports = RED => {
    require('./room-connectivity.cjs').register(RED,kitchenOutput);
    RED.httpNode.get('/home-automation/room-live.mjs',(_req,res) =>
        res.set('Cache-Control','no-cache').sendFile(path.join(__dirname,'room-live.mjs')));
    function HouseLights(config) {
        RED.nodes.createNode(this,config);
        const node = this;
        const file = path.join(RED.settings.userDir,'house-last-lights.json');
        let saved, busy = false, closed = false;
        let notice = '';
        try { saved = JSON.parse(fs.readFileSync(file,'utf8')); count(saved); }
        catch (error) { saved = null; if (error.code !== 'ENOENT') node.warn('Lichtauswahl konnte nicht gelesen werden.'); }
        function publish() {
            if (!closed) node.send([null,null,null,null,{topic:'house/memory',payload:{available:count(saved)>0,busy,notice}}]);
        }
        function sendAt(index, msg) {
            if (closed) return;
            const outputs = Array(5).fill(null);
            outputs[index] = msg;
            node.send(outputs);
        }
        async function restore() {
            let failed = 0;
            for (const channel of inputs.filter(channel => saved.channels.includes(channel.key))) {
                if (closed) return;
                try { await setLight(channel,true); } catch { failed++; }
            }
            if (closed) return;
            if (saved.entry) sendAt(1,{topic:'vorraum/set',payload:true});
            if (saved.relay) sendAt(3,{topic:'sissi/light',payload:true});
            if (saved.kitchen) {
                const controller = RED.nodes.getNode('lightcontrollerkitchen')?.context().get('lightControllerKitchen');
                if (controller) {
                    const probe = new controller.constructor(controller.getConfiguration());
                    const preview = probe.restorePersistentState(saved.kitchen.state);
                    if (JSON.stringify(preview.LedOutput) === JSON.stringify(saved.kitchen.outputs))
                        sendAt(2,{topic:'house/kitchen/restore',payload:saved.kitchen});
                    else failed++;
                } else failed++;
            }
            if (saved.kid && !closed) {
                try {await restoreKid(saved.kid);} catch { failed++; }
            }
            notice = failed ? 'Wiederherstellung teilweise angefordert. Übersprungen: '+failed+'.' :
                'Einschalten der gemerkten Lichter angefordert.';
        }
        node.on('input',async (msg,send,done) => {
            if (msg.topic === 'house/memory/read') {publish(); done?.(); return;}
            const restoreLast = msg.topic === 'house/lights/restore';
            if (busy || !(restoreLast || msg.topic === 'house/lights' && typeof msg.payload === 'boolean')) {
                done?.(); return;
            }
            busy = true;
            notice = restoreLast ? 'Gemerkte Lichter werden angefordert …' : msg.payload ? 'Einschalten …' : 'Lichtzustände werden gelesen …';
            publish();
            try {
                if (restoreLast) {
                    if (count(saved)) await restore();
                    else notice = 'Keine eingeschalteten Lichter gespeichert.';
                } else {
                    if (!msg.payload) {
                        try {
                            const selection = await capture(RED);
                            if (closed) return;
                            // Wiederholtes Aus bei dunklem Haus behält die letzte belegte Auswahl.
                            if (count(selection)) {
                                fs.writeFileSync(file+'.tmp',JSON.stringify(selection),{mode:0o600});
                                fs.renameSync(file+'.tmp',file);
                                saved = selection;
                            }
                            notice = 'Ausschalten angefordert.';
                        } catch {
                            saved = null;
                            try { fs.rmSync(file,{force:true}); }
                            catch { node.warn('Lichtspeicher auf dem Datenträger nicht beschreibbar.'); }
                            notice = 'Ausschalten angefordert. Auswahl konnte nicht gespeichert werden.';
                        }
                    } else notice = 'Einschalten angefordert.';
                    sendAt(0,{topic:'house/lights',payload:msg.payload});
                }
            } catch {notice = 'Der Lichtbefehl konnte nicht vollständig verarbeitet werden.';}
            finally {busy=false;publish();done?.();}
        });
        node.on('close',() => {closed=true;});
    }
    RED.nodes.registerType('home-automation-house-lights',HouseLights);
};
