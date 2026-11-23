// name: Lichtbefehl an PICENTER2
// nodeId: georg_room_request
// flow: FLOW_KIDROOM
const targetId = "georgszimmer-light";
if (msg.topic === "scheduler/command") {
    const p = msg.payload || {};
    if (p.schemaVersion !== 1 || p.targetId !== targetId) return null;
    msg.requestId = p.requestId;
    msg.payload = p.action;
} else if (msg.topic !== "georgszimmer/set" && msg.topic !== "georgszimmer/read") {
    return null;
}
msg.method = msg.topic === "georgszimmer/read" ? "GET" : "POST";
if (msg.method === "GET") delete msg.payload;
msg.headers = {"Content-Type":"application/json"};
msg.requestTimeout = 4000;
return msg;
