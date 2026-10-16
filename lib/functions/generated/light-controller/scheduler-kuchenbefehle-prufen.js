// name: Scheduler · Küchenbefehle prüfen
// nodeId: scheduler_kitchen_adapter
// flow: LIGHT_CONTROLLER
// Adapter: ausschließlich typisierte Scheduler-Befehle für diese Instanz.
// Neue Räume erhalten einen eigenen Adapter mit eigener TARGET_ID.
const TARGET_ID = "kitchen-light";
const request = msg.payload;
if (msg.topic !== "scheduler/command" || request?.schemaVersion !== 1 || request.targetId !== TARGET_ID) return null;
const action = request.action || {};
let payload;
if (action.type === "brightness" && typeof action.value === "number" && Number.isFinite(action.value) && action.value >= 0 && action.value <= 100) {
    payload = { Command: "SetDutyCycle", DutyCycle: action.value };
} else if (action.type === "on") payload = { Command: "AllLightsOn" };
else if (action.type === "off") payload = { Command: "AllLightsOff" };
else if (action.type === "scenario" && typeof action.value === "string" && action.value.trim()) payload = { Command: "SelectScenario", ScenarioName: action.value };
else {
    return [null, { topic:"scheduler/ack", payload:{requestId:request.requestId,targetId:TARGET_ID,ok:false,text:"Nicht unterstützte Aktion"} }];
}
// Die vorhandene Controller-Function reicht eigene Message-Felder durch.
return [{ topic:"scheduler/kitchen", schedulerRequest:request, payload }, null];
