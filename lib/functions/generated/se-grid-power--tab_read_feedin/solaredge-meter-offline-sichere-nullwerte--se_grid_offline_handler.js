// name: SolarEdge Meter OFFLINE · sichere Nullwerte
// nodeId: se_grid_offline_handler
// flow: SE · GRID POWER
// Fehler nur erfassen; der zentrale Watchdog entscheidet über OFFLINE.
// So können verspätete Fehler keine frischen, bestätigten Messwerte überschreiben.
const rawReason = msg.error?.message || msg.payload?.message || msg.payload || "SolarEdge nicht erreichbar";
const technicalReason = typeof rawReason === "string" ? rawReason.trim() : "";
const reason = technicalReason && technicalReason !== "[object Object]"
    ? technicalReason
    : "SolarEdge nicht erreichbar · Modbus/TCP-Verbindung fehlgeschlagen";
global.set("SolarEdgeLastErrorMs", Date.now());
global.set("SolarEdgeLastErrorReason", reason);
node.status({fill:"red", shape:"ring", text:"Fehler erfasst · " + reason.slice(0, 38)});
return [null, null, null, null];