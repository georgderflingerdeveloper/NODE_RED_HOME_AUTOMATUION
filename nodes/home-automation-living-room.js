'use strict';
const {sample, status, contacts, switchLight, first, second, west} = require('./living-room-io.cjs');

const windows = require('./living-room-windows.cjs');
const path = require('node:path');
module.exports = RED => {
    function LivingRoom(config) {
        RED.nodes.createNode(this, config);
        const node = this, cards = {}, jobs = {}, sampled = {};
        const file=path.join(RED.settings.userDir,'living-room-windows.json');
        let hm, closed = false, saved=[], storageError, session, sampling=false;
        try {saved=windows.load(file);} catch(e) {storageError=e.message;node.error(e.message);}
        async function learn(msg) {
            const owner=msg.socketid, {step,side,name}=msg.payload||{};
            if (!owner) return;
            const reply=(next,text)=>{if(!closed)node.send({topic:'living-room/learning',socketid:owner,payload:{next,text}});};
            if (storageError) return reply('start',storageError);
            if (sampling) return reply(step,'Eine Messung läuft bereits.');
            if (session && Date.now()>session.expires) session=null;
            if (session && session.owner!==owner) return reply('start','Ein anderes Dashboard ordnet gerade ein Fenster zu.');
            if (step==='cancel') {session=null;return reply('start','');}
            if (step==='start') {
                if (!Object.hasOwn(windows.boards,side)) return;
                session={side,owner,name:String(name||windows.label(side)).trim().slice(0,60)||windows.label(side),step:'start',expires:Date.now()+300000};
            }
            if (!session || session.step!==step) return reply(session?.step||'start','Bitte den angezeigten Schritt wiederholen.');
            sampling=true;
            try {
                const reading=windows.measure(session.side,await sample(session.side));
                if(closed)return;
                session.expires=Date.now()+300000;
                if(step==='start'){session.closed=reading;session.step='open';return reply('open','Jetzt nur dieses Fenster öffnen und offen lassen.');}
                if(step==='open'){session.opened=reading;session.step='close';return reply('close','Jetzt dasselbe Fenster wieder schließen.');}
                const found=windows.detect(session.side,session.closed,session.opened,reading,saved);
                const next=[...saved,{...found,name:session.name}];
                windows.save(file,next);saved=next;session=null;sampled[found.side]=0;refresh(found.side);
                publish();reply('start','Fenster zugeordnet und gespeichert.');
            } catch(e) {session=null;reply('start',e.message?.startsWith('Command failed')?'Der Pi antwortet nicht. Bitte erneut beginnen.':e.message);}
            finally {sampling=false;}
        }
        function publish(socketid) {
            if (!closed) node.send({topic:'living-room/state', socketid,
                payload:{lights:status(cards), contacts:contacts(hm, cards, Date.now(), saved)}});
        }
        function refresh(side) {
            if (jobs[side] || Date.now() - (sampled[side] || 0) < 2200) return;
            jobs[side] = sample(side).catch(() => ({})).then(readings => {
                for (const serial of side === 'east' ? [first, second] : [west]) delete cards[serial];
                Object.assign(cards, readings);
                sampled[side] = Date.now();
                delete jobs[side];
                publish();
            });
        }
        node.on('input', async (msg, send, done) => {
            if (msg.topic === 'living-room/learn') {
                await learn(msg);
            } else if (msg.topic === 'homematic-ip/state') {
                hm = msg.payload;
                publish();
            } else if (msg.topic === 'living-room/read') {
                publish(msg.socketid);
                refresh('east');
                refresh('west');
            } else if (msg.topic === 'living-room/set') {
                const {id, on} = msg.payload || {};
                const available = status(cards).find(row => row.id === id && row.state !== 'unknown');
                try {
                    if (!available) throw Error('Keine aktuelle Rückmeldung');
                    await switchLight(id, on);
                } catch {
                    if (!closed) node.send({topic:'living-room/error', socketid:msg.socketid, payload:{id}});
                }
            }
            if (done) done();
        });
        node.on('close', () => { closed = true; });
    }
    RED.nodes.registerType('home-automation-living-room', LivingRoom);
};
