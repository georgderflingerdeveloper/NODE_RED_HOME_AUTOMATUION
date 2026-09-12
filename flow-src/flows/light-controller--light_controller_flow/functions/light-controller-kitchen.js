// Generische Klasse, raumspezifische Instanz.
const INSTANCE_NAME = "Kitchen";
const CONFIGURATION_KEY = "LightControllerKitchenConfiguration";
const CONTROLLER_KEY = "lightControllerKitchen";
const FINGERPRINT_KEY = "lightControllerKitchenConfigurationFingerprint";
const controllerModule = global.get("LightControllerModule") || global.get("LightControllerKitchenModule");
const Controller = controllerModule && (controllerModule.LightController || controllerModule.LightControllerKitchen);
const storeModule = global.get("LightControllerScenarioStoreModule");
const ScenarioStore = storeModule && storeModule.LightControllerScenarioStore;

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

let scenarioStore = context.get("lightControllerKitchenScenarioStore");
if (!scenarioStore && typeof ScenarioStore === "function") {
    scenarioStore = new ScenarioStore();
    context.set("lightControllerKitchenScenarioStore", scenarioStore);
}
let persistedConfiguration = null;
if (scenarioStore) {
    try {
        persistedConfiguration = scenarioStore.load(INSTANCE_NAME);
    } catch (error) {
        node.warn(`Persistierte LightController-Konfiguration konnte nicht gelesen werden: ${error.message}`);
    }
}
let configuration = persistedConfiguration || flow.get(CONFIGURATION_KEY) || defaultConfiguration;
configuration = { ...configuration, instanceName: INSTANCE_NAME };
let fingerprint = JSON.stringify(configuration);
let controller = context.get(CONTROLLER_KEY);
const previousFingerprint = context.get(FINGERPRINT_KEY);

if (!controller || typeof controller.process !== "function" || fingerprint !== previousFingerprint) {
    controller = new Controller(configuration);
    context.set(CONTROLLER_KEY, controller);
    context.set(FINGERPRINT_KEY, fingerprint);
}

if (msg.topic === "light-controller/configure") {
    configuration = { ...configuration, ...(msg.payload || {}), instanceName: INSTANCE_NAME };
    controller = new Controller(configuration);
    context.set(CONTROLLER_KEY, controller);
    msg.payload = controller.getOutput({ event: "configuration_changed" });
    msg.payload.ScenariosChanged = true;
} else {
    msg.payload = controller.process(msg.payload || {});
}

if (msg.payload.ScenariosChanged) {
    configuration = controller.getConfiguration();
    fingerprint = JSON.stringify(configuration);
    flow.set(CONFIGURATION_KEY, configuration);
    if (scenarioStore) {
        try {
            scenarioStore.save(INSTANCE_NAME, configuration);
        } catch (error) {
            node.error(`LightController-Szenarien konnten nicht gespeichert werden: ${error.message}`, msg);
        }
    }
    context.set(CONTROLLER_KEY, controller);
    context.set(FINGERPRINT_KEY, fingerprint);
}

msg.topic = "light-controller/status";
if (msg.payload.CommandResult) {
    node.status({ fill: "blue", shape: "dot", text: msg.payload.CommandResult });
} else if (msg.payload.LedStatus.some(status => status.includes("=On["))) {
    node.status({ fill: "green", shape: "dot", text: msg.payload.LedStatusText });
} else {
    node.status({ fill: "grey", shape: "ring", text: msg.payload.LedStatusText });
}
return msg;