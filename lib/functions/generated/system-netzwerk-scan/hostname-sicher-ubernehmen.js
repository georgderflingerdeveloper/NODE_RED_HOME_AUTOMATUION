// name: Hostname sicher übernehmen
// nodeId: system_hostname_result
// flow: System · Netzwerk-Scan
// nodeId: system_hostname_result
const marker = "__SYSTEM_HOSTNAME__";
const raw = String(msg.payload || "").trim();
let hostname = raw.startsWith(marker) ? raw.slice(marker.length).trim() : "";

if (hostname.endsWith(".")) hostname = hostname.slice(0, -1);
if (!/^[A-Za-z0-9][A-Za-z0-9.-]{0,251}$/.test(hostname)) hostname = "";

msg.hostname = hostname || null;
msg.online = true;
msg.payload = msg.targetIp;
return msg;
