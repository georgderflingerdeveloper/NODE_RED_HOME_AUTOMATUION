// name: HAP offline bestätigen
// nodeId: hmip_reboot_check
// flow: HOMEMATIC IP
if (msg.topic !== "homematic-ip/state") return null;
const { cloudConnected, lastSuccess, intervalMs } = msg.payload;
if (cloudConnected === undefined) return null;
if (cloudConnected !== false || !Number.isSafeInteger(lastSuccess)) {
    context.set("offline", null);
    return null;
}

const pollInterval = Number.isSafeInteger(intervalMs) && intervalMs >= 600_000 ? intervalMs : 600_000;
let offline = context.get("offline");
if (offline && lastSuccess <= offline.last) return null;
if (!offline || lastSuccess - offline.last > 1.5 * pollInterval) {
    offline = { first: lastSuccess, count: 0, triggered: false };
}
offline.last = lastSuccess;
offline.count += 1;

const trigger = !offline.triggered && offline.count >= 3 &&
    lastSuccess - offline.first >= 2 * pollInterval;
if (trigger) offline.triggered = true;
context.set("offline", offline);
if (!trigger) return null;

node.warn("HAP mehrfach offline gemeldet. Prüfe den lokalen Neustart.");
return {};
