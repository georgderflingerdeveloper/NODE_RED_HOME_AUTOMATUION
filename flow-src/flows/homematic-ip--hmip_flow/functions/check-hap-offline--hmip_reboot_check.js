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
    offline = { first: lastSuccess, count: 0, lastAttempt: null };
}
offline.last = lastSuccess;
offline.count += 1;

const confirmed = pollInterval >= 3_600_000 ||
    (offline.count >= 3 && lastSuccess - offline.first >= 2 * pollInterval);
const trigger = confirmed && (offline.lastAttempt == null || lastSuccess - offline.lastAttempt >= 3_600_000);
if (trigger) offline.lastAttempt = lastSuccess;
context.set("offline", offline);
if (!trigger) return null;

node.warn("Cloud meldet HAP offline. Prüfe den lokalen Neustart.");
return {};
