// Akzeptiert:
//   msg.LedOutput = [0..1, ...]
//   msg.payload.LedOutput = [0..1, ...]
//   msg.payload = [0..1, ...]
//
// Nur vorhandene Werte werden geschrieben.
// Nicht genannte Hardware-Kanäle bleiben unverändert.

let values = null;

if (Array.isArray(msg.LedOutput)) {
    values = msg.LedOutput;
} else if (Array.isArray(msg.payload?.LedOutput)) {
    values = msg.payload.LedOutput;
} else if (Array.isArray(msg.payload)) {
    values = msg.payload;
}

if (!values) {
    node.warn("Kein LedOutput-Array gefunden");
    return null;
}

const out = Array(16).fill(null);

for (let i = 0; i < Math.min(16, values.length); i++) {
    const n = Number(values[i]);
    const dutyCycle = Number.isFinite(n)
        ? Math.max(0, Math.min(1, n))
        : 0;

    out[i] = {
        topic: "setDutyCycle",
        payload: { dutyCycle },
        outputIndex: i,
        source: "PhidgetWorker"
    };
}

node.status({
    fill: "green",
    shape: "dot",
    text: values.slice(0, 16)
        .map((v, i) => `${i + 1}=${Math.round(Number(v || 0) * 100)}%`)
        .join(" ")
});

return out;