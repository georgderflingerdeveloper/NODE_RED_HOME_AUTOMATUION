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
const errorText = typeof payload?.error === "string" ? payload.error.trim() : "";
const metrics = {};
for (const device of devices) {
    if (!device?.online || !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(String(device.ip || ""))) continue;
    metrics[device.ip] = device;
}

flow.set("systemLiveMetrics", metrics);
flow.set("systemLiveMetricsError", errorText || null);
msg.liveMetricsUpdate = true;
msg.liveMetricsError = errorText || null;
msg.topic = "system/live/metrics";
msg.payload = null;
if (errorText) {
    node.status({ fill: "red", shape: "ring", text: errorText.slice(0, 48) });
    node.warn(`System-Livewerte: ${errorText}`);
} else {
    node.status({ fill: "green", shape: "dot", text: `${Object.keys(metrics).length} Live-Systeme erreichbar` });
}
return msg;
