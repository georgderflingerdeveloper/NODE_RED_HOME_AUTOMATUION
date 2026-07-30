// name: Livewerte prüfen und Dashboard aktualisieren
// nodeId: system_live_metrics_result
// flow: System · Netzwerk-Scan
// nodeId: system_live_metrics_result
let payload = msg.payload;
if (typeof payload === "string") {
    try {
        payload = JSON.parse(payload);
    } catch {
        node.status({ fill: "red", shape: "ring", text: "Livewerte nicht lesbar" });
        return null;
    }
}

const devices = Array.isArray(payload?.devices) ? payload.devices : [];
const metrics = {};
for (const device of devices) {
    if (!device?.online || !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(String(device.ip || ""))) continue;
    metrics[device.ip] = device;
}

flow.set("systemLiveMetrics", metrics);
msg.liveMetricsUpdate = true;
msg.topic = "system/live/metrics";
msg.payload = null;
node.status({ fill: "green", shape: "dot", text: `${Object.keys(metrics).length} Live-Systeme erreichbar` });
return msg;
