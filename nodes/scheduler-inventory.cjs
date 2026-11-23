'use strict';

// Speichert nur die Gerätekennung und die zur Unterscheidung nötigen Angaben.
function discoveredRows(topic, payload) {
    switch (topic) {
        case 'phidgets/discovery':
            return (payload?.inventory?.devices || []).map(d => ({
                source:'Phidget', key:d.key, name:d.name,
                location:[d.server, 'Seriennr. ' + d.serial, d.port != null ? 'Port ' + d.port : ''].filter(Boolean).join(' · ')
            }));
        case 'homematic-ip/state':
            return (payload?.rows || []).map(d => ({
                source:'Homematic IP', key:d.id, name:d.name, location:[d.rooms,d.model].filter(Boolean).join(' · ')
            }));
        case 'system/network/overview':
            return (payload?.system?.devices || []).map(d => ({
                source:'Netzwerk', key:d.ip, name:d.name || d.hostname || d.ip, location:d.ip
            }));
        default: return null;
    }
}

function mergeDiscovered(known, rows) {
    const entries = new Map(known.map(d => [d.source + '/' + d.key, d]));
    for (const row of rows) {
        if (typeof row.key === 'string' && row.key && typeof row.name === 'string' && row.name)
            entries.set(row.source + '/' + row.key, row);
    }
    return Array.from(entries.values());
}
module.exports = { discoveredRows, mergeDiscovered };
