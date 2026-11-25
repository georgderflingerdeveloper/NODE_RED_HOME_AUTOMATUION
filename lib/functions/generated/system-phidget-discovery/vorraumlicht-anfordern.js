// name: Vorraumlicht anfordern
// nodeId: vorraum_command
// flow: SYSTEM · Phidget Discovery
if (!['vorraum/set', 'house/lights'].includes(msg.topic) || typeof msg.payload !== 'boolean') return null;
return {payload:msg.payload ? 'ENTRY-LIGHT-ON' : 'ENTRY-LIGHT-OFF'};
