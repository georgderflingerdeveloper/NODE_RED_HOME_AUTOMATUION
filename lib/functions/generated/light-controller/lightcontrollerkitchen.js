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
let storeReadFailed = false;
if (scenarioStore) {
    try {
        persistedConfiguration = scenarioStore.load(INSTANCE_NAME);
    } catch (error) {
        storeReadFailed = true;
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

function persistControllerState(output, requireDiskSave = false) {
    if (!output.ScenariosChanged && !output.PersistentStateChanged) return;
    const nextConfiguration = controller.getConfiguration();
    if (scenarioStore) {
        try {
            scenarioStore.save(INSTANCE_NAME, nextConfiguration);
        } catch (error) {
            if (requireDiskSave) throw new Error("Die Szene konnte nicht gespeichert werden. Bitte erneut versuchen.");
            node.error(`LightController-Szenarien konnten nicht gespeichert werden: ${error.message}`, msg);
        }
    }
    configuration = nextConfiguration;
    fingerprint = JSON.stringify(configuration);
    flow.set(CONFIGURATION_KEY, configuration);
    context.set(CONTROLLER_KEY, controller);
    context.set(FINGERPRINT_KEY, fingerprint);
}

if (msg.topic === "light-controller/configure") {
    configuration = { ...configuration, ...(msg.payload || {}), instanceName: INSTANCE_NAME };
    controller = new Controller(configuration);
    context.set(CONTROLLER_KEY, controller);
    msg.payload = controller.getOutput({ event: "configuration_changed" });
    msg.payload.ScenariosChanged = true;
    persistControllerState(msg.payload);
} else if (msg.sceneCreationId && msg.payload?.Command === "AddScenario") {
    const request = msg.payload;
    let added = false;
    try {
        if (!scenarioStore || storeReadFailed) throw new Error("Der Szenenspeicher ist nicht verfügbar.");
        if (Object.keys(request.ScenarioProperties || {}).length !== controller.getOutput().OutputCount) {
            throw new Error("Die Anzahl der LEDs hat sich geändert. Bitte die Helligkeiten prüfen.");
        }
        msg.payload = controller.process(request);
        added = true;
        persistControllerState(msg.payload, true);
    } catch (error) {
        if (added) {
            controller = new Controller(configuration);
            context.set(CONTROLLER_KEY, controller);
        }
        msg.payload = controller.getOutput({ event: "scenario_create_failed", commandResult: error.message });
    }
} else {
    msg.payload = controller.process(msg.payload || {});
    persistControllerState(msg.payload);
}

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