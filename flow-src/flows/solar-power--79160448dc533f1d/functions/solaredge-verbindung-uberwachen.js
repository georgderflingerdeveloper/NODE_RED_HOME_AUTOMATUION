// Einzige Instanz, die SolarEdgeData und den Dashboard-Status schreibt.
const nowMs = Date.now();
const pvLastMs = Number(global.get("SolarEdgePvLastSuccessMs")) || 0;
const gridLastMs = Number(global.get("SolarEdgeGridLastSuccessMs")) || 0;
const staleAfterMs = 7000;
const pvFresh = nowMs - pvLastMs <= staleAfterMs;
const gridFresh = nowMs - gridLastMs <= staleAfterMs;
const communicationHealthy = pvFresh && gridFresh;

let healthyCycles = Number(context.get("healthyCycles")) || 0;
healthyCycles = communicationHealthy ? Math.min(healthyCycles + 1, 2) : 0;
context.set("healthyCycles", healthyCycles);

const online = communicationHealthy && healthyCycles >= 2;
const recovering = communicationHealthy && !online;
let reason = "";
if (!online) {
    if (recovering) {
        reason = "Verbindung wiederhergestellt · Messwerte werden bestätigt";
    } else if (!pvFresh && !gridFresh) {
        reason = "Keine aktuellen SolarEdge-Daten · Modbus-Verbindung wird neu aufgebaut";
    } else if (!pvFresh) {
        reason = "Keine aktuellen Wechselrichterdaten · Modbus-Verbindung wird neu aufgebaut";
    } else {
        reason = "Keine aktuellen Smart-Meter-Daten · Modbus-Verbindung wird neu aufgebaut";
    }
}

const status = {
    State: online ? "ONLINE" : (recovering ? "RECOVERING" : "OFFLINE"),
    OnlineFlag: online,
    OfflineFlag: !online,
    OfflineReason: reason,
    UpdatedAt: new Date(nowMs).toISOString(),
    Source: "SolarEdge Modbus/TCP",
    PvLastSuccessMs: pvLastMs,
    GridLastSuccessMs: gridLastMs,
    LastErrorMs: Number(global.get("SolarEdgeLastErrorMs")) || 0,
    LastErrorReason: global.get("SolarEdgeLastErrorReason") || ""
};

if (online) {
    status.PvPowerWatt = Number(global.get("SolarEdgePvPowerWatt")) || 0;
    status.FeedInWatt = Number(global.get("SolarEdgeFeedInWatt")) || 0;
    status.GridImportWatt = Number(global.get("SolarEdgeGridImportWatt")) || 0;
    status.GridPowerWatt = Number(global.get("SolarEdgeGridPowerWatt")) || 0;
    status.RawGridPower = Number(global.get("SolarEdgeRawGridPower")) || 0;
    status.GridPowerScaleFactor = Number(global.get("SolarEdgeGridPowerScaleFactor")) || 0;
} else {
    status.PvPowerWatt = 0;
    status.FeedInWatt = 0;
    status.GridImportWatt = 0;
    status.GridPowerWatt = 0;
}
global.set("SolarEdgeData", status);

node.status(online
    ? {fill:"green", shape:"dot", text:"ONLINE · Daten aktuell"}
    : recovering
        ? {fill:"yellow", shape:"ring", text:"VERBINDE · bestätige Messwerte"}
        : {fill:"red", shape:"ring", text:"OFFLINE · Reconnect läuft"});

let reconnectMsg = null;
if (!communicationHealthy) {
    const lastReconnectMs = Number(context.get("lastReconnectMs")) || 0;
    if (nowMs - lastReconnectMs >= 15000) {
        context.set("lastReconnectMs", nowMs);
        reconnectMsg = {
            topic: "SolarEdgeModbusReconnect",
            payload: {
                connectorType: "TCP",
                tcpHost: "192.168.0.128",
                tcpPort: "502",
                tcpType: "DEFAULT",
                unitId: 1,
                commandDelay: 1,
                clientTimeout: 1000,
                reconnectTimeout: 2000
            }
        };
    }
}

if (online) {
    return [null, null, null, {topic:"SolarEdgeStatus", payload:status}, null];
}
const common = {
    OfflineFlag: true,
    OfflineReason: reason,
    UpdatedAt: status.UpdatedAt,
    Source: status.Source
};
return [
    {topic:"PvPowerWatt", payload:0, ...common},
    {topic:"FeedInW", payload:0, gridPowerWatt:0, ...common},
    {topic:"GridImportWatt", payload:0, gridPowerWatt:0, ...common},
    {topic:"SolarEdgeStatus", payload:status},
    reconnectMsg
];