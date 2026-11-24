'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { candidates } = require('./scheduler-switches.cjs');
const { Scheduler } = require('./scheduler-core.cjs');
const { SchedulerStore } = require('./scheduler-store.cjs');
const { roomList } = require('./scheduler-rooms.cjs');
const servedRooms = new WeakMap();
module.exports = function(RED) {
    function SchedulerNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const directory = path.join(RED.settings.userDir, 'scheduler-data');
        const previousFile = path.join(directory, node.id.replace(/[^a-z0-9_-]/gi, '_') + '.json');
        const primary = node.id === 'scheduler_engine';
        const store = new SchedulerStore(primary ? path.join(directory, 'scheduler-setup.json') : previousFile);
        const receipt = '/var/lib/georg-scheduler-backup/status.json';
        let engine, saved, loadError, storageError = false, digest;
        try {
            const migrate = primary && !fs.existsSync(store.file) && fs.existsSync(previousFile);
            const input = migrate ? new SchedulerStore(previousFile) : store;
            engine = new Scheduler(input.load());
            if (migrate) fs.renameSync(previousFile, store.file);
            saved = JSON.stringify(engine.state);
            if (primary && !fs.existsSync(store.file)) store.save(engine.state);
            if (primary) digest = crypto.createHash('sha256').update(fs.readFileSync(store.file)).digest('hex');
        }
        catch (error) { loadError = error; node.status({ fill: 'red', shape: 'ring', text: 'Datendatei prüfen' }); node.error(error); }
        if (primary && RED.httpNode) {
            if (!servedRooms.has(RED.httpNode)) {
                RED.httpNode.get('/home-automation/room-names', (_req,res) => {
                    const read = servedRooms.get(RED.httpNode);
                    if (!read) return res.sendStatus(503);
                    res.set('Cache-Control','no-store').json(read());
                });
            }
            servedRooms.set(RED.httpNode, () => roomList(engine?.state || {}));
            node.on('close', () => servedRooms.set(RED.httpNode, null));
        }
        function processInput(msg, send, done, batch = false) {
            if (loadError) { send([null, null, { payload: { failedToken: msg?.payload?.token, notice: `Scheduler gesperrt: ${loadError.message}`, errors: [loadError.message], health: {state:'error',label:'Fehler',color:'red',reasons:[loadError.message]} } }]); done?.(); return; }
            const previousState = JSON.stringify(engine.state), previousLive = JSON.stringify(engine.live);
            let saving = false;
            try {
                const switches = candidates(RED.nodes);
                if (msg.topic === 'scheduler/manage' && msg.payload?.command === 'AddDevice') {
                    const selected = switches.get(msg.payload.id);
                    if (!selected) throw Error('Der Schalter ist nicht mehr verfügbar. Bitte erneut auswählen.');
                    msg = {...msg, payload:{...msg.payload, device:selected.descriptor}};
                }
                const now = Date.now();
                for (const target of engine.state.targets.filter(t => t.switchId)) {
                    if (switches.has(target.id)) engine.register(switches.get(target.id).descriptor, now);
                    else delete engine.live.seen[target.id];
                }
                const result = batch ? engine.handleBatch(msg) : engine.handle(msg);
                const next = JSON.stringify(engine.state);
                // Erst dauerhaft speichern, dann Befehle versenden. Speicherfehler => kein Schalten.
                if (next !== saved || storageError) { saving = true; store.save(engine.state); saved = next;
                    if (primary) digest = crypto.createHash('sha256').update(JSON.stringify(engine.state, null, 2) + '\n').digest('hex');
                    saving = false; storageError = false; }
                result.status.availableDevices = Array.from(switches.values(), s => s.descriptor)
                    .filter(d => !engine.state.targets.some(t => t.id === d.id));
                const forwarded = [];
                for (const command of result.commands) {
                    const target = engine.state.targets.find(t => t.id === command.payload.targetId);
                    if (!target?.switchId) { forwarded.push(command); continue; }
                    const selected = switches.get(target.id);
                    const control = selected && RED.nodes.getNode(selected.descriptor.switchId);
                    let ok = false;
                    if (control && ['on','off'].includes(command.payload.action.type)) {
                        try {
                            control.receive({topic:selected.topic,payload:command.payload.action.type === 'on'});
                            ok = true;
                        } catch (error) { node.warn(error.message); }
                    }
                    const ack = { ...command.payload, ok, text:ok ? 'An Dashboard-Schalter übergeben.' : 'Schalter nicht verfügbar.' };
                    engine.acknowledge(ack, now);
                }
                if (primary) {
                    result.status.savedAt = fs.statSync(store.file).mtimeMs;
                    try {
                        const backup = JSON.parse(fs.readFileSync(receipt, 'utf8'));
                        if (backup.digest === digest) result.status.backupAt = backup.at;
                    } catch { /* Erster Upload steht noch aus. */ }
                }
                send([forwarded.length ? forwarded : null, result.cron.length ? result.cron : null, { payload: result.status }]);
                node.status({ fill: result.status.health.color, shape: 'dot', text: result.status.health.label });
                done?.();
            } catch (error) {
                if (saving) storageError = true;
                engine.state = JSON.parse(previousState); engine.live = JSON.parse(previousLive);
                const status = engine.status(Date.now(), error.message);
                status.failedToken = msg?.payload?.token;
                if(msg?.payload?.command==='SetRampProfile')status.profileErrorRoom=msg.payload.room;
                // Eingabefehler sind Warnungen; fehlgeschlagene Speicherung ist ein Fehler.
                const failed = storageError || status.health.state === 'error';
                status.health = {state:failed ? 'error' : 'warning',label:failed ? 'Fehler' : 'Warnung',color:failed ? 'red' : 'yellow',reasons:[error.message,...(failed ? status.health.reasons : [])]};
                send([null, null, { payload: status }]);
                node.status({ fill: status.health.color, shape: 'ring', text: error.message });
                node.warn(error.message); done?.();
            }
        }
        // Zeitgleiche Ereignisse gemeinsam entscheiden, statt von Callback-Reihenfolge abhängen.
        let timer, queued = [];
        node.on('input', (msg, send, done) => {
            if (msg.cronplus?.triggerTimestamp || msg.payload?.triggerTimestamp) {
                queued.push({msg,done});
                if (!timer) timer = setTimeout(() => {
                    const batch = queued; queued = []; timer = null;
                    processInput(batch.map(item => item.msg), node.send.bind(node), () => batch.forEach(item => item.done?.()), true);
                }, 50);
            } else processInput(msg, send, done);
        });
        node.on('close', () => { clearTimeout(timer); queued.forEach(item => item.done?.()); queued = []; });
    }
    RED.nodes.registerType('home-automation-scheduler', SchedulerNode);
};
