// name: LightControllerKitchen
// nodeId: lightcontrollerkitchen
// flow: LIGHT_CONTROLLER
// Generische Klasse, raumspezifische Instanz.
const INSTANCE_NAME = "Kitchen";
const CONFIGURATION_KEY = "LightControllerKitchenConfiguration";
const CONTROLLER_KEY = "lightControllerKitchen";
const FINGERPRINT_KEY = "lightControllerKitchenConfigurationFingerprint";
const CLICK_TIMER_KEY = "lightControllerKitchenClickTimer";
const ULTRA_TIMER_KEY = "lightControllerKitchenUltraLongTimer";
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
    doubleClickTimeMs: 500,
    ultraHoldTimeMs: 4000,
    inputBindings: [{
        shortAction: "next",
        doubleAction: "next-scenario",
        longAction: "toggle-mode",
        ultraLongAction: "all-off-command"
    }]
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
if (!configuration.runtimeState) {
    configuration = {
        ...configuration,
        inputBindings: (configuration.inputBindings || defaultConfiguration.inputBindings).map((binding) => ({
            ...binding,
            doubleAction: binding.doubleAction || "next-scenario",
            ultraLongAction: binding.ultraLongAction || "all-off-command",
            longAction: binding.longAction === "toggle-next"
                ? "toggle-mode"
                : binding.longAction && binding.longAction.type === "toggle-next"
                    ? { ...binding.longAction, type: "toggle-mode" }
                    : binding.longAction
        }))
    };
}
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

function persistControllerState(output) {
    if (!output.ScenariosChanged && !output.PersistentStateChanged) return;
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
persistControllerState(msg.payload);

const oldClickTimer = context.get(CLICK_TIMER_KEY);
if (oldClickTimer) clearTimeout(oldClickTimer);
if (Number.isFinite(msg.payload.ClickFlushAt)) {
    const delayMs = Math.max(0, msg.payload.ClickFlushAt - Date.now()) + 5;
    const clickTimer = setTimeout(() => {
        const delayedOutput = controller.process({ Command: "FlushPendingClick" });
        persistControllerState(delayedOutput);
        context.set(CLICK_TIMER_KEY, null);
        node.send({ topic: "light-controller/status", payload: delayedOutput });
    }, delayMs);
    context.set(CLICK_TIMER_KEY, clickTimer);
} else {
    context.set(CLICK_TIMER_KEY, null);
}

const oldUltraTimer = context.get(ULTRA_TIMER_KEY);
if (oldUltraTimer) clearTimeout(oldUltraTimer);
if (Number.isFinite(msg.payload.UltraLongFlushAt)) {
    const delayMs = Math.max(0, msg.payload.UltraLongFlushAt - Date.now()) + 5;
    const ultraTimer = setTimeout(() => {
        const delayedOutput = controller.process({ Command: "FlushUltraLongPress" });
        persistControllerState(delayedOutput);
        context.set(ULTRA_TIMER_KEY, null);
        node.send({ topic: "light-controller/status", payload: delayedOutput });
    }, delayMs);
    context.set(ULTRA_TIMER_KEY, ultraTimer);
} else {
    context.set(ULTRA_TIMER_KEY, null);
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