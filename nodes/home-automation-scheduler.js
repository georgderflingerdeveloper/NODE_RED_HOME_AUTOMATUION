'use strict';
const path = require('node:path');
const { Scheduler } = require('./scheduler-core.cjs');
const { SchedulerStore } = require('./scheduler-store.cjs');
module.exports = function(RED) {
    function SchedulerNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const store = new SchedulerStore(path.join(RED.settings.userDir, 'scheduler-data', `${node.id.replace(/[^a-z0-9_-]/gi, '_')}.json`));
        let engine, saved, loadError, storageError = false;
        try { engine = new Scheduler(store.load()); saved = JSON.stringify(engine.state); }
        catch (error) { loadError = error; node.status({ fill: 'red', shape: 'ring', text: 'Datendatei prüfen' }); node.error(error); }
        function processInput(msg, send, done, batch = false) {
            if (loadError) { send([null, null, { payload: { notice: `Scheduler gesperrt: ${loadError.message}`, errors: [loadError.message], health: {state:'error',label:'Fehler',color:'red',reasons:[loadError.message]} } }]); done?.(); return; }
            const previousState = JSON.stringify(engine.state), previousLive = JSON.stringify(engine.live);
            let saving = false;
            try {
                const result = batch ? engine.handleBatch(msg) : engine.handle(msg);
                const next = JSON.stringify(engine.state);
                // Erst dauerhaft speichern, dann Befehle versenden. Speicherfehler => kein Schalten.
                if (next !== saved || storageError) { saving = true; store.save(engine.state); saved = next; saving = false; storageError = false; }
                send([result.commands.length ? result.commands : null, result.cron.length ? result.cron : null, { payload: result.status }]);
                node.status({ fill: result.status.health.color, shape: 'dot', text: result.status.health.label });
                done?.();
            } catch (error) {
                if (saving) storageError = true;
                engine.state = JSON.parse(previousState); engine.live = JSON.parse(previousLive);
                const status = engine.status(Date.now(), error.message);
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
