
/**
 * Scheduler → Kitchen LightController
 *
 * Übersetzt Scheduler-Befehle in Controller-Kommandos.
 *
 * Ausgang 1: Befehl an LightController
 * Ausgang 2: Fehler-ACK an Scheduler
 *
 * Unterstützte Aktionen:
 *   brightness: 0–100 %
 *   on:         Alle Lichter einschalten
 *   off:        Alle Lichter ausschalten
 *   scenario:   Gespeichertes Szenario aktivieren
 */

// =====================================================
// 1. KONFIGURATION
// =====================================================

const CONFIG = {
    targetId: "kitchen-light",
    schemaVersion: 1,
    outputTopic: "scheduler/kitchen",

    brightness: {
        min: 0,
        max: 100
    }
};

// =====================================================
// 2. HILFSFUNKTIONEN
// =====================================================

function isValidRequest(request) {
    return (
        request !== null &&
        typeof request === "object" &&
        !Array.isArray(request) &&
        request.schemaVersion === CONFIG.schemaVersion &&
        request.targetId === CONFIG.targetId
    );
}

function isValidBrightness(value) {
    return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= CONFIG.brightness.min &&
        value <= CONFIG.brightness.max
    );
}

function isValidScenario(value) {
    return (
        typeof value === "string" &&
        value.trim().length > 0
    );
}

/**
 * Übersetzt eine Scheduler-Aktion.
 * Gibt null bei ungültiger Aktion zurück.
 */
function translateAction(action) {

    if (!action || typeof action !== "object") {
        return null;
    }

    switch (action.type) {

        case "brightness":
            if (!isValidBrightness(action.value)) {
                return null;
            }

            return {
                Command: "SetDutyCycle",
                DutyCycle: action.value
            };

        case "on":
            return {
                Command: "AllLightsOn"
            };

        case "off":
            return {
                Command: "AllLightsOff"
            };

        case "scenario":
            if (!isValidScenario(action.value)) {
                return null;
            }

            return {
                Command: "SelectScenario",
                ScenarioName: action.value
            };

        default:
            return null;
    }
}

/**
 * Erstellt eine negative Scheduler-Bestätigung.
 */
function createErrorAck(request, errorText) {
    return {
        topic: "scheduler/ack",
        payload: {
            requestId: request.requestId,
            targetId: CONFIG.targetId,
            ok: false,
            text: errorText
        }
    };
}

// =====================================================
// 3. EINGANGSPRÜFUNG
// =====================================================

// Nur Scheduler-Kommandos bearbeiten.
if (msg.topic !== "scheduler/command") {
    return null;
}

const request = msg.payload;

// Fremde oder ungültige Befehle ignorieren.
if (!isValidRequest(request)) {
    return null;
}

// =====================================================
// 4. BEFEHL ÜBERSETZEN
// =====================================================

const controllerPayload = translateAction(request.action);

if (controllerPayload === null) {

    node.warn(
        `Scheduler: Ungültige Aktion für ${CONFIG.targetId}`
    );

    return [
        null,
        createErrorAck(request, "Nicht unterstützte Aktion")
    ];
}

// =====================================================
// 5. BEFEHL AN CONTROLLER SENDEN
// =====================================================

const controllerMessage = {
    topic: CONFIG.outputTopic,

    // Wird für die spätere Bestätigung benötigt.
    schedulerRequest: request,

    payload: controllerPayload
};

return [controllerMessage, null];

