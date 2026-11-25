// name: Vorraum · Ausgangszustände
// nodeId: vorraum_outputs
// flow: SYSTEM · Phidget Discovery
// Gerätezuordnung für PIENTRY. Weitere Ausgänge als eigene Einträge ergänzen.
const outputs = [
    {id: 'vorraum-licht', name: 'Vorraumlicht', kind: 'light', serial: '311883', channel: 0}
];
if (msg.topic !== 'phidgets/io' || !msg.payload?.io || !Array.isArray(msg.payload.rows)) return null;

const now = Date.now();
const maxAge = 10000;
const devices = outputs.map(({id, name, kind, serial, channel}) => {
    const row = msg.payload.rows.find(r => r.serial === serial && r.index === channel &&
        r.type === 'Digital Output' && r.server === 'pientry' && r.actualServer === 'pientry');
    const live = row?.quality === 'live' && row.deviceState === 'online' &&
        Number.isFinite(row.lastRead) && row.lastRead <= now && now - row.lastRead < maxAge;
    // Nur binäre, übereinstimmende Phidget-Rückmeldungen gelten für diese Lampe.
    const binary = live && typeof row.boolean === 'boolean' && row.value === (row.boolean ? 100 : 0);
    return {id, name, kind, state: binary ? (row.boolean ? 'on' : 'off') : 'unknown',
        sampledAt: binary ? row.lastRead : 0, validUntil: binary ? row.lastRead + maxAge : 0};
});
context.set('lamp', devices[0]);
return {topic: 'room/outputs', payload: {devices}};
