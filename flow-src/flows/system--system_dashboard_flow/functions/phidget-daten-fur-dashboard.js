const payload = msg.payload || {};

let source;

if (Array.isArray(payload.phidgets)) {
    source = payload.phidgets;
} else if (Array.isArray(payload.devices)) {
    source = payload.devices;
} else if (Array.isArray(payload)) {
    source = payload;
} else if (payload && typeof payload === "object") {
    source = [payload];
} else {
    source = [];
}

const now = Date.now();

const phidgets = source.map((item, index) => {
    const attached =
        item.attached === true ||
        item.isAttached === true ||
        item.connected === true ||
        item.state === "online" ||
        item.state === "connected";

    let state = attached ? "online" : "offline";

    if (item.state === "waiting" || item.state === "connecting") {
        state = "waiting";
    }

    return {
        name: item.name || item.deviceName || item.productName || ("Phidget " + (index + 1)),
        deviceClass: item.deviceClass || item.className || item.channelClassName || "—",
        deviceID: item.deviceID ?? item.deviceId ?? item.id ?? "—",
        deviceSerialNumber:
            item.deviceSerialNumber ??
            item.serialNumber ??
            item.serial ??
            "—",
        hubSerialNumber:
            item.hubSerialNumber ??
            item.hubSerial ??
            item.deviceSerialNumber ??
            "—",
        hubPort: item.hubPort ?? item.port ?? "—",
        channel: item.channel ?? item.channelNumber ?? "—",
        value: item.value ?? item.stateValue ?? null,
        state,
        attached,
        lastSeen: item.lastSeen || item.updatedAt || now,
        firmwareVersion: item.firmwareVersion || item.version || "—"
    };
});

const hubSerials = new Set(
    phidgets
        .map(p => p.hubSerialNumber)
        .filter(v => v !== "—" && v !== null && v !== undefined)
);

const online = phidgets.filter(p => p.state === "online").length;
const offline = phidgets.filter(p => p.state === "offline").length;

msg.payload = {
    summary: {
        hardware: phidgets.length,
        hubs: hubSerials.size,
        online,
        offline,
        updatedAt: now
    },
    phidgets
};

node.status({
    fill: offline > 0 ? "yellow" : "green",
    shape: "dot",
    text: `${online}/${phidgets.length} verbunden`
});

return msg;