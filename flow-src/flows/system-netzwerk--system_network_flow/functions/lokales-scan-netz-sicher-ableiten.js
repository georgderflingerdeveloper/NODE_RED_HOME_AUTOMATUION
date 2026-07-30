// nodeId: system_scan_targets
const value = String(msg.payload || "").trim();
const match = value.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/);

if (!match) {
    node.status({ fill: "red", shape: "ring", text: "Lokale IPv4-Adresse nicht erkannt" });
    node.warn("Systemnetz-Scan übersprungen: keine private lokale IPv4-Adresse erhalten.");
    return null;
}

const ip = match[1];
const parts = ip.split(".").map(Number);
if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    node.status({ fill: "red", shape: "ring", text: "Ungültige lokale IPv4-Adresse" });
    return null;
}

const privateNetwork = parts[0] === 10
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
if (!privateNetwork) {
    node.status({ fill: "red", shape: "ring", text: "Keine private lokale IPv4-Adresse" });
    node.warn("Systemnetz-Scan übersprungen: Adresse liegt nicht im privaten Heimnetzbereich.");
    return null;
}

const subnet = parts.slice(0, 3).join(".");
const scanId = `${subnet}-${Date.now()}`;
const targets = [];
for (let host = 1; host <= 254; host += 1) {
    const target = `${subnet}.${host}`;
    if (target !== ip) targets.push(target);
}

flow.set("systemNetworkScan", {
    scanId,
    subnet,
    localIp: ip,
    startedAt: new Date().toISOString(),
    expected: targets.length,
    completed: 0,
    results: {}
});

msg.topic = "system/network/scan/target";
msg.scanId = scanId;
msg.scanSubnet = subnet;
msg.payload = targets;
node.status({ fill: "blue", shape: "dot", text: `${subnet}.0/24 · ${targets.length} Ziele` });
return msg;
