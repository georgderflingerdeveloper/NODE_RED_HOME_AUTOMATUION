// name: Scheduler · Küche registrieren / bestätigen
// nodeId: scheduler_kitchen_status
// flow: LIGHT_CONTROLLER
const TARGET_ID = "kitchen-light";
const output = msg.payload || {};

const messages = [];

// Controller beim Scheduler registrieren
if (Array.isArray(output.ScenarioList)) {
    messages.push({
        topic: "scheduler/register",
        payload: {
            id: TARGET_ID,
            name: "Küche · Lichtsteuerung",
            room: "kitchen",
            kind: "light",
            groups: ["indoor"],
            actions: ["brightness", "on", "off", "scenario"],
            profileRoom: "kitchen_profile",
            channels: output.OutputCount,
            editableScenes: output.ScenarioList.filter(s => s.ScenarioType === "user").map(s => s.ScenarioName),
            sceneLevels: Object.fromEntries(output.ScenarioList.map(s => [s.ScenarioName,
                Array.from({length:output.OutputCount}, (_,i) => s.ScenarioProperties?.[i+1] || 0)])),
            scenarios: output.ScenarioList.map(
                scenario => scenario.ScenarioName
            )
        }
    });
}

// Scheduler-Anfrage bestätigen
if (msg.schedulerRequest) {

    const request = msg.schedulerRequest;

    const expected = {
        brightness: "duty_cycle_changed",
        on: "all_lights_on",
        off: "all_lights_off",
        scenario: "scenario_selected"
    };

    const actionType = request.action?.type;
    const expectedEvent = expected[actionType];

    const ok = Boolean(expectedEvent) &&
               (output.Event === expectedEvent || (msg.profileOn && actionType === "on" && output.Event === "scenario_selected"));

    messages.push({
        topic: "scheduler/ack",
        payload: {
            requestId: request.requestId,
            targetId: TARGET_ID,
            ok: ok,
            text: ok
                ? "Controller bestätigt: " + output.Event
                : "Controller meldet: " + (output.Event || "Kein Event")
        }
    });
}

return messages.length > 0 ? [messages] : null;