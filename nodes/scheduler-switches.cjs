'use strict';
const { createHash } = require('node:crypto');

function candidates(nodes) {
    const graph = new Map();
    nodes.eachNode?.(config => graph.set(config.id, config));
    function hasOutput(id, visited) {
        if (visited.has(id)) return false;
        visited.add(id);
        const config = graph.get(id);
        if (!config || config.d || graph.get(config.z)?.disabled || !nodes.getNode(id)) return false;
        if (['udp out', 'mqtt out', 'phidget22-digitaloutput'].includes(config.type)) return true;
        const targets = config.type === 'link out' ? config.links : config.wires?.flat();
        return Boolean(targets?.some(next => hasOutput(next, visited)));
    }
    const switches = new Map();
    for (const config of graph.values()) {
        if (config.type !== 'ui_switch' || config.passthru !== true ||
            config.onvalueType !== 'bool' || config.offvalueType !== 'bool' ||
            String(config.onvalue) !== 'true' || String(config.offvalue) !== 'false' ||
            (config.topicType && config.topicType !== 'str') || !hasOutput(config.id, new Set())) continue;
        const stableId = value => createHash('sha256').update(value).digest('hex').slice(0, 24);
        const group = graph.get(config.group);
        const location = [graph.get(group?.tab)?.name, group?.name].filter(Boolean).join(' · ');
        const label = config.label || config.name || config.id;
        const descriptor = {
            id: 'switch-' + stableId(config.id), name: String(label).trim().slice(0, 100),
            room: 'room-' + stableId(config.group || config.z), kind: 'switch', groups: [],
            actions: ['on', 'off'], scenarios: [], location, switchId: config.id
        };
        switches.set(descriptor.id, { descriptor, topic: config.topic || '' });
    }
    return switches;
}
module.exports = { candidates };
