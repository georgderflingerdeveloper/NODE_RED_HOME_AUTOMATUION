// SolarEdge Netzleistung aufteilen
// Gemessene Geräte-Konvention: positiv = Einspeisung, negativ = Netzbezug
const vals = Array.isArray(msg.payload) ? msg.payload : msg.payload?.data;
if (!vals || vals.length < 5) {
    node.status({fill:"red", shape:"ring", text:"keine Modbus-Daten"});
    return [null, null];
}

const toI16 = value => (value & 0x8000) ? value - 0x10000 : value;
const roundWatt = value => Math.round((value + Number.EPSILON) * 10) / 10;
const rawPower = toI16(vals[0]);
const scaleFactor = toI16(vals[4]);

if (rawPower === -32768 || scaleFactor === -32768 || scaleFactor < -5 || scaleFactor > 5) {
    node.status({fill:"red", shape:"ring", text:"ungültige Registerwerte"});
    return [null, null];
}

const gridPowerWatt = roundWatt(rawPower * Math.pow(10, scaleFactor));
const feedInWatt = roundWatt(Math.max(0, gridPowerWatt));
const gridImportWatt = roundWatt(Math.max(0, -gridPowerWatt));
const nowMs = Date.now();

global.set("SolarEdgeGridLastSuccessMs", nowMs);
global.set("SolarEdgeGridPowerWatt", gridPowerWatt);
global.set("SolarEdgeFeedInWatt", feedInWatt);
global.set("SolarEdgeGridImportWatt", gridImportWatt);
global.set("SolarEdgeRawGridPower", rawPower);
global.set("SolarEdgeGridPowerScaleFactor", scaleFactor);
const pvLastMs = Number(global.get("SolarEdgePvLastSuccessMs")) || 0;
const displayHealthy = nowMs - pvLastMs <= 7000;
const displayFeedInWatt = displayHealthy ? feedInWatt : 0;
const displayGridImportWatt = displayHealthy ? gridImportWatt : 0;
const displayGridPowerWatt = displayHealthy ? gridPowerWatt : 0;

node.status({
    fill: gridImportWatt > 0 ? "red" : "green",
    shape: "dot",
    text: gridImportWatt > 0
        ? "Netzbezug " + gridImportWatt + " W"
        : "Einspeisung " + feedInWatt + " W"
});

const common = {gridPowerWatt:displayGridPowerWatt, rawPower, scaleFactor, timestamp:nowMs};
return [
    {...msg, topic:"FeedInW", payload:displayFeedInWatt, ...common},
    {...msg, topic:"GridImportWatt", payload:displayGridImportWatt, ...common}
];