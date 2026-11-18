// name: Gerätewerte und Status
// nodeId: hmip_device_snapshot
// flow: HOMEMATIC IP
if (msg.topic === "homematic-ip/state") {
    context.set("snapshot", msg.payload);
    return null;
}
if (msg.topic !== "homematic-ip/snapshot/tick") return null;

const snapshot = context.get("snapshot");
const publishedAt = Date.now();
const cloudReadAt = snapshot?.lastSuccess ?? null;
const devices = (snapshot?.rows ?? []).map(row => ({
    id: row.id,
    name: row.name,
    model: row.model,
    rooms: row.rooms,
    status: row.quality === "offline" ? "offline" :
        row.quality === "current" && row.reachable === true ? "online" : "unknown",
    quality: row.quality,
    lastKnownReachable: row.reachable ?? null,
    lastReadAt: row.lastSeen ?? null,
    lowBattery: row.lowBattery ?? null,
    values: row.points,
}));

return {
    topic: "homematic-ip/devices",
    payload: {
        schemaVersion: 1,
        publishedAt,
        cloudReadAt,
        cloudStatus: snapshot?.status ?? "idle",
        cloudError: snapshot?.errorCode || null,
        devices,
    },
};
