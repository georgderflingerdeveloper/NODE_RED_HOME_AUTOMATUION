// name: Online-Liste mit Hostnamen bilden
// nodeId: system_scan_result
// flow: System · Netzwerk-Scan
// nodeId: system_scan_result
const targetIp = String(msg.targetIp || "");
const scan = flow.get("systemNetworkScan");
const liveMetricsUpdate = msg.liveMetricsUpdate === true;
const raspberryInventory = {
    "192.168.0.104": { hostname: "pieast", model: "Frühes Raspberry-Pi-Modell", operatingSystem: "Raspbian 7 Wheezy", services: "SSH 22 · SMB 445", temperatureC: 55 },
    "192.168.0.105": { hostname: "piwest", model: "Raspberry Pi Model B Rev 2", operatingSystem: "Raspbian 7 Wheezy", services: "SSH 22 · SMB 445", temperatureC: 54 },
    "192.168.0.125": { hostname: "PIANTE_", model: "Raspberry Pi Model B Rev 2", operatingSystem: "Raspbian 9 Stretch", services: "SSH 22 · SMB 445", temperatureC: 52 },
    "192.168.0.150": { hostname: "PICENTER2", model: "Raspberry Pi 2 Model B Rev 1.1", operatingSystem: "Raspbian 11 Bullseye", services: "SSH 22 · Node-RED 1880 · Dienst 8080", temperatureC: 45 },
    "192.168.0.190": { hostname: "pientry", model: "Raspberry Pi 2 Model B Rev 1.1", operatingSystem: "Raspbian 13 Trixie", services: "SSH 22 · Node-RED 1880 · Dienst 8080", temperatureC: 48 }
};

if (!scan || (!liveMetricsUpdate && (msg.scanId !== scan.scanId || !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(targetIp) || typeof msg.online !== "boolean"))) {
    return null;
}

if (!liveMetricsUpdate) {
    scan.completed += 1;
    scan.results[targetIp] = {
        ip: targetIp,
        hostname: msg.online && msg.hostname ? String(msg.hostname) : null,
        state: msg.online ? "online" : "offline",
        observedAt: new Date().toISOString()
    };
    flow.set("systemNetworkScan", scan);
}

const liveMetrics = flow.get("systemLiveMetrics") || {};
const entries = Object.values(scan.results);
const onlineDevices = entries
    .filter((entry) => entry.state === "online")
    .sort((left, right) => left.ip.localeCompare(right.ip, undefined, { numeric: true }))
    .map((entry) => {
        const inventory = raspberryInventory[entry.ip] || null;
        const live = liveMetrics[entry.ip] || null;
        return {
            name: live?.hostname || inventory?.hostname || entry.hostname || "Netzwerkgerät",
            hostname: live?.hostname || inventory?.hostname || entry.hostname || null,
            model: inventory?.model || null,
            operatingSystem: inventory?.operatingSystem || null,
            services: inventory?.services || null,
            temperatureC: live?.temperatureC ?? inventory?.temperatureC ?? null,
            temperatureSource: live?.temperatureC !== null && live?.temperatureC !== undefined ? "live" : (inventory ? "inventory" : null),
            memoryUsedPercent: live?.memoryUsedPercent ?? null,
            diskUsedPercent: live?.diskUsedPercent ?? null,
            uptimeSeconds: live?.uptimeSeconds ?? null,
            loadAverage: live?.loadAverage ?? null,
            inventoryObservedAt: inventory ? "2026-07-26" : null,
            ip: entry.ip,
            lastSeen: entry.observedAt,
            state: "online"
        };
    });
const finished = scan.completed >= scan.expected;

if (!liveMetricsUpdate && !finished && scan.completed % 5 !== 0) return null;

msg.topic = "system/network/overview";
msg.payload = {
    system: {
        network: {
            state: finished ? "online" : "scanning",
            label: liveMetricsUpdate
                ? `Live-Systemwerte aktualisiert · ${Object.keys(liveMetrics).length} Raspberry Pis erreichbar`
                : (finished
                ? `Netzscan abgeschlossen · ${onlineDevices.length} Geräte erreichbar`
                : `Netzscan läuft · ${scan.completed}/${scan.expected} Adressen geprüft`),
            updatedAt: new Date().toISOString()
        },
        summary: {
            devices: onlineDevices.length,
            online: onlineDevices.length,
            offline: null,
            updatedAt: new Date().toISOString()
        },
        devices: onlineDevices
    }
};
node.status({
    fill: finished || liveMetricsUpdate ? "green" : "blue",
    shape: "dot",
    text: liveMetricsUpdate ? `${Object.keys(liveMetrics).length} Live-Systeme` : (finished ? `${onlineDevices.length} Geräte online` : `${scan.completed}/${scan.expected} geprüft`)
});
return msg;
