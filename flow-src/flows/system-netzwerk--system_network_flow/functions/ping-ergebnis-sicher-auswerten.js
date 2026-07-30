// nodeId: system_ping_result
const targetIp = String(msg.targetIp || "");
const scan = flow.get("systemNetworkScan");
const result = msg.payload;
const code = typeof result === "object" && result !== null ? Number(result.code) : Number(result);

if (!scan || msg.scanId !== scan.scanId || !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(targetIp) || !Number.isFinite(code)) {
    return [null, null];
}

msg.online = code === 0;
msg.payload = targetIp;
return msg.online ? [msg, null] : [null, msg];
