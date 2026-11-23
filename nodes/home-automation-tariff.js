const {DatabaseSync} = require('node:sqlite');
const path = require('node:path');
const {openPlan, project, parseOffer, URL_LOYAL} = require('./loyal-tariff.cjs');

module.exports = function(RED) {
    function Tariff(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const db = new DatabaseSync(path.join(RED.settings.userDir, 'loyal-tariff.sqlite'));
        const plan = openPlan(db);
        let market, offer, checkedAt, error, fetching, closed = false;
        function state(socketid, message) {
            const selected = plan.all().at(-1);
            node.send([null, {topic:'tariff/state', socketid, payload:{selected, offer, checkedAt, error, message}}, null]);
        }
        async function refresh() {
            try {
                const response = await fetch(URL_LOYAL, {signal:AbortSignal.timeout(15000)});
                if (!response.ok || new URL(response.url).origin !== new URL(URL_LOYAL).origin) throw Error('Produktseite nicht verfügbar');
                offer = parseOffer(await response.text());
                error = null;
            } catch (e) {
                offer = null;
                error = e.message;
            } finally {
                checkedAt = Date.now();
                if (!closed) state();
            }
        }
        function publish() {
            const payload = project(plan.all(), market, Date.now());
            node.status({fill:payload.online?'green':'yellow',shape:'dot',text:payload.provider});
            node.send([{topic:'energy/tariff/current',payload},null,null]);
        }
        node.on('input', (msg, send, done) => {
            try {
                if (msg.topic === 'tariff/read') state(msg.socketid);
                else if (msg.topic === 'tariff/confirm') {
                    plan.confirm(msg.payload, Date.now());
                    state(undefined, 'Auswahl gespeichert.');
                    publish();
                } else if (msg.topic === 'tariff/refresh' || msg.topic === 'tariff/tick') {
                    if (!fetching && (msg.topic === 'tariff/refresh' || !checkedAt || Date.now()-checkedAt > 86400000)) {
                        fetching = refresh().finally(()=>{fetching=null;});
                    }
                    if (msg.topic === 'tariff/tick') {
                        publish();
                        node.send([null,null,{topic:'aWATTar/tariff/request'}]);
                    }
                } else if (msg.topic === 'aWATTar/tariff/current') {
                    market = msg.payload;
                    publish();
                } else if (msg.topic === 'energy/forecast/provider') {
                    publish();
                }
                done();
            } catch(e) {
                state(msg.socketid, e.message);
                done(e);
            }
        });
        node.on('close',()=>{closed=true;db.close();});
    }
    RED.nodes.registerType('home-automation-tariff',Tariff);
};
