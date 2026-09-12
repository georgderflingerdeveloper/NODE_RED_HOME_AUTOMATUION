// Generische Klasse, raumspezifische Instanz.
const INSTANCE_NAME = "Kitchen";
const controllerModule = global.get("LightControllerModule") || global.get("LightControllerKitchenModule");
const Controller = controllerModule && (controllerModule.LightController || controllerModule.LightControllerKitchen);

if (typeof Controller !== "function") {
    node.status({ fill: "red", shape: "ring", text: "LightController-Modul fehlt" });
    node.error("LightController ist nicht geladen. settings.js und Moduldatei prüfen.", msg);
    return null;
}

const defaultConfiguration = {
    instanceName: INSTANCE_NAME,
    inputCount: 1,
    outputCount: 6,
    holdTimeMs: 2000,
    inputBindings: [{ shortAction: "next", longAction: "toggle-next" }]
};

let configuration = flow.get("LightControllerKitchenConfiguration") || defaultConfiguration;
configuration = { ...configuration, instanceName: INSTANCE_NAME };
let fingerprint = JSON.stringify(configuration);
let controller = context.get("lightControllerKitchen");
let previousFingerprint = context.get("lightControllerKitchenConfigurationFingerprint");

if (!controller || typeof controller.process !== "function" || fingerprint !== previousFingerprint) {
    controller = new Controller(configuration);
    context.set("lightControllerKitchen", controller);
    context.set("lightControllerKitchenConfigurationFingerprint", fingerprint);
}

if (msg.topic === "light-controller/configure") {
    configuration = { ...configuration, ...(msg.payload || {}), instanceName: INSTANCE_NAME };
    controller = new Controller(configuration);
    fingerprint = JSON.stringify(configuration);
    flow.set("LightControllerKitchenConfiguration", configuration);
    context.set("lightControllerKitchen", controller);
    context.set("lightControllerKitchenConfigurationFingerprint", fingerprint);
    msg.payload = controller.getOutput({ event: "configuration_changed" });
} else {
    msg.payload = controller.process(msg.payload || {});
}

const active = msg.payload.ActiveLights.map(index => index + 1).join(",");
if (msg.payload.Event === "configuration_changed") {
    node.status({ fill: "blue", shape: "dot", text: `Konfiguration v${msg.payload.ConfigurationVersion}` });
} else if (msg.payload.ScenarioSaved) {
    node.status({ fill: "blue", shape: "dot", text: "Szenario gespeichert" });
} else if (active) {
    node.status({ fill: "green", shape: "dot", text: `${msg.payload.ScenarioName || "Licht"}: ${active}` });
} else {
    node.status({ fill: "grey", shape: "ring", text: "alle aus" });
}
return msg;