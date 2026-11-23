// name: Route cost dashboard request
// nodeId: kosten_dashboard_request_router
// flow: KOSTEN
if (["tariff/read", "tariff/refresh", "tariff/confirm"].includes(msg.topic)) return [null, null, msg];
if (msg.topic === "history/dashboard") return [msg, null];
if (msg.topic === "energy/forecast/read") return [null, msg];
node.warn(`Unbekannte Dashboard-Abfrage ignoriert: ${msg.topic || "ohne Topic"}`);
return [null, null];
