'use strict';
const {windowRows} = require('./living-room-windows.cjs');
const path = require('node:path');
const os = require('node:os');
const { promisify } = require('node:util');
const run = promisify(require('node:child_process').execFile);
const udp = require('node:dgram');

const hosts = { east: '192.168.0.104', west: '192.168.0.105', ante: '192.168.0.125' };
const first = '345764', second = '346077', west = '348403';
const upper = [0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11];
function lamp(id, name, serial, channels, command, section = 'Raumlicht') {
    return { id, name, serial, channels, command, section };
}
const lights = [
    lamp('wall', 'Wandleuchte West', west, [14], 'LIGHTS-WALL-WEST'),
    lamp('ledge', 'Fensterbank West', west, [4, 5], 'WINDOW-LEDGE-WEST'),
    lamp('window', 'Fenster oben Ost', first, [7], 'LIGHT-WINDOW-SOUTHEAST-UPSIDE'),
    lamp('left', 'Lichtbalken Tür links', west, [0], 'WINDOW-LIGHT-DOOR-ENTRY-LEFT'),
    lamp('door', 'Licht über der Tür', first, [5], 'LIGHTBAR-OVER-DOOR-ENTRY'),
    lamp('right', 'Fenster rechts neben der Tür', first, [6], 'LIGHTBAR-OVER-RIGHTWINDOW-BESIDE-DOOR'),
    lamp('triangle-west', 'Dreieckfenster West', west, [6], 'LIGHT-TRIANGLE-SMALL-WEST'),
    lamp('triangle-east', 'Dreieck oben', first, [4], 'TRIANAGLE-UPSTAIRS'),
    lamp('down', 'Galerie unten', first, [0, 1, 2, 3], 'GALLERY-DOWN'),
    // The installed group command covers ten circuits. Upper 11 is a separate light bar.
    lamp('up', 'Galerie oben · 1–10', second, upper.slice(0, 10), 'GALLERY-UP'),
    ...[0, 1, 2, 3].map((ch, i) => lamp('down-' + (i+1), 'Unten ' + (i+1), first, [ch], 'GALLERY-DOWN-' + (i+1), 'Galerie einzeln')),
    ...upper.map((ch, i) => lamp('up-' + (i+1), 'Oben ' + (i+1), second, [ch], 'GALLERY-UP' + (i+1), 'Galerie einzeln'))
];
const READ_TTL = 12000;

// Mehrere Ansichten teilen sich eine laufende USB-Abfrage pro Raspberry.
const pendingSamples = new Map();
async function sample(side) {
    return (await sampleController(side)).cards;
}
function sampleController(side) {
    if (!pendingSamples.has(side)) {
        pendingSamples.set(side, readCards(side).finally(() => pendingSamples.delete(side)));
    }
    return pendingSamples.get(side);
}

async function readCards(side) {
    if (!Object.hasOwn(hosts, side)) throw Error('Unbekannter Controller');
    const helper = path.join(os.homedir(), 'Homeautomation-Recovery', 'remote.cjs');
    const command = 'sudo -n modprobe usbmon && (sudo -n mountpoint -q /sys/kernel/debug || sudo -n mount -t debugfs debugfs /sys/kernel/debug) && sudo -n timeout 5 python - ' + side;
    const { stdout } = await run(process.execPath, [helper, hosts[side], command, path.join(__dirname, 'living-room-report.py')], {timeout: 13000, maxBuffer: 16384});
    const data = JSON.parse(stdout), result = {};
    for (const serial of {east:[first, second], west:[west], ante:['311893']}[side]) {
        const row = data[serial];
        if (row && [row.inputs, row.outputs].every(v => Number.isInteger(v) && v >= 0 && v <= 65535))
            result[serial] = {...row, until: Date.now() + READ_TTL};
    }
    return {cards: result, application: data.application};
}

function status(devices, now = Date.now()) {
    return lights.map(({id, name, serial, channels, section}) => {
        const card = devices[serial];
        const count = channels.filter(ch => card && (card.outputs & (1 << ch))).length;
        const state = !card || card.until <= now ? 'unknown' : count === channels.length ? 'on' : count ? 'mixed' : 'off';
        return { id, name, section, state, until: card?.until || 0 };
    });
}

function contacts(hm, cards, now = Date.now(), windows = []) {
    const results = [];
    for (const row of hm?.rows || []) {
        if (!String(row.rooms).split(/[,;]/).some(r => r.trim().toLowerCase() === 'wohnzimmer')) continue;
        const channel = row.points?.find(p => p.name.endsWith('.functionalChannelType') && p.value === 'SHUTTER_CONTACT_CHANNEL');
        if (!channel) continue;
        const state = row.points.find(p => p.name === channel.name.split('.')[0] + '.windowState')?.value;
        const label = {OPEN:'Offen', CLOSED:'Geschlossen', TILTED:'Gekippt'}[state];
        const until = Number(hm.lastSuccess) + (Number(hm.intervalMs) || 3600000) + 60000;
        const current = label && until > now && row.reachable === true && row.quality === 'current' && hm.cloudConnected !== false && !hm.errorCode;
        results.push({id:row.id, name:row.name, state:current ? label : 'Unbekannt', last:label, at:row.lastSeen, source:'Homematic IP', until});
    }
    const card = cards[first];
    results.push({id:'entry-right', name:'Haupteingang rechts', source:'PIEAST · Eingang 3',
        state:!card || card.until <= now ? 'Unbekannt' : card.inputs & 8 ? 'Kontakt aktiv' : 'Kontakt inaktiv', until:card?.until || 0});
    for (const [input, name] of [[4, 'Seitenflügel rechts']]) {
        const candidates = [first, second].map(serial => {
            const row = cards[serial];
            return {serial, until:row?.until || 0, level:!row || row.until <= now ? 'unbekannt'
                : (row.inputs & (1 << input)) ? 'aktiv' : 'inaktiv'};
        });
        results.push({id:'east-input-' + input, name, source:'PIEAST · Eingang ' + input,
            state:'Zuordnung offen', candidates});
    }
    return [...windowRows(windows,cards,now), ...results];
}

async function switchLight(id, on, send = sendUdp) {
    const light = lights.find(item => item.id === id);
    if (!light || typeof on !== 'boolean') throw Error('Ungültiger Lichtbefehl');
    await send(hosts[light.serial === west ? 'west' : 'east'], 10000, 'TURN-' + light.command + (on ? '-ON' : '-OFF'));
}

function sendUdp(host, port, text) {
    return new Promise((resolve, reject) => {
        const socket = udp.createSocket('udp4');
        socket.send(Buffer.from(text, 'utf8'), port, host, err => {
            socket.close();
            if (err) reject(err); else resolve();
        });
    });
}
module.exports = {sampleController, sample, status, contacts, switchLight, lights, first, second, west};
