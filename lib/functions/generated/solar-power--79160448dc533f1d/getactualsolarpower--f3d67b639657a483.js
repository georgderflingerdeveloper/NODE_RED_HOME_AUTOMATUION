// name: GetActualSolarPower
// nodeId: f3d67b639657a483
// flow: SOLAR_POWER
let SCALING_FACTOR = global.get("SCALING_FACTOR") || 0;
const rawPower = Number(msg.payload);
if (!Number.isFinite(rawPower)) {
    return [null, null, {payload:{message:"Ungültige SolarEdge-Leistungsdaten"}}];
}

const nowMs = Date.now();
const pvPowerWatt = rawPower > 0 ? rawPower * Math.pow(10, SCALING_FACTOR) : 0;
global.set("SolarEdgePvLastSuccessMs", nowMs);
global.set("SolarEdgePvPowerWatt", pvPowerWatt);
const gridLastMs = Number(global.get("SolarEdgeGridLastSuccessMs")) || 0;
const displayPvPowerWatt = nowMs - gridLastMs <= 7000 ? pvPowerWatt : 0;

node.status({fill:"green", shape:"dot", text:"Messwert · " + Math.round(pvPowerWatt) + " W"});
return [
    {...msg, payload:displayPvPowerWatt, timestamp:nowMs},
    null,
    null
];