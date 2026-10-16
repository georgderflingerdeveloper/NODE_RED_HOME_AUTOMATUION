const TARGET_ID = "kitchen-light";
const output = msg.payload;
if (!output || !Array.isArray(output.ScenarioList)) return null;
const messages = [{ topic:"scheduler/register", payload:{
    id:TARGET_ID, name:"Küche · Lichtsteuerung", room:"kitchen", kind:"light", groups:["indoor"],
    actions:["brightness","on","off","scenario"],
    scenarios:output.ScenarioList.map(scenario => scenario.ScenarioName)
} }];
if (msg.schedulerRequest) {
    const request = msg.schedulerRequest;
    const expected = {brightness:"duty_cycle_changed",on:"all_lights_on",off:"all_lights_off",scenario:"scenario_selected"};
    const ok = output.Event === expected[request.action.type];
    messages.push({topic:"scheduler/ack",payload:{requestId:request.requestId,targetId:TARGET_ID,ok,
        text:ok ? "Controller bestätigt: " + output.Event : "Controller meldet: " + output.Event}});
}
return [messages];
