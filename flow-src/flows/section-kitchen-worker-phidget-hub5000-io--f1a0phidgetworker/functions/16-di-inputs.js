// Nur echte Zustandsänderungen übernehmen.
if (msg.topic !== "StateChange") return null;
if (!Number.isInteger(msg.inputIndex)) return null;

const state = msg.payload?.state === true;
let inputs = flow.get("phidgetInputs");

if (!Array.isArray(inputs) || inputs.length !== 16) {
    inputs = Array(16).fill(false);
}

inputs[msg.inputIndex] = state;
flow.set("phidgetInputs", inputs);

node.status({
    fill: state ? "green" : "grey",
    shape: "dot",
    text: `DI${msg.inputIndex + 1}=${state ? "ON" : "OFF"}`
});

return {
    topic: "phidget/inputs",
    payload: {
        Inputs: [...inputs],
        ButtonPressed: inputs[0],
        ChangedInput: msg.inputIndex,
        State: state
    }
};