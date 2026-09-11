/**
 * LightControllerKitchen
 *
 * Reine Lichtlogik für 6 dimmbare Ausgänge.
 * Keine Node-RED- oder Phidgets-Abhängigkeit.
 *
 * Eingang:
 *   {
 *     ButtonPressed: true | false,
 *     DutyCycle: 0..100        // Prozent
 *   }
 *
 * Ausgang:
 *   {
 *     ButtonPressed: true | false,
 *     DutyCycle: 0..100,
 *     LedOutput: [0..1, ...],  // 6 Werte, direkt für Phidgets setDutyCycle()
 *     ActiveLights: [0..5],
 *     ScenarioIndex: number,
 *     ScenarioSaved: boolean,
 *     SavedScenario: object|null,
 *     Event: string
 *   }
 *
 * Bedienlogik:
 *   - kurzer Tastendruck:
 *       1. LED0 allein
 *       2. LED1 allein
 *       ...
 *       6. LED5 allein
 *       7. LED0 + LED1
 *       8. LED0 + LED1 + LED2
 *       ...
 *       11. alle LEDs
 *       danach wieder von vorne
 *
 *   - Tastendruck >= 2 s:
 *       aktuelles Szenario wird gespeichert
 *       (kein Szenariowechsel)
 *
 * Hinweis:
 *   Das Speichern erfolgt hier nur im Objektzustand.
 *   Persistenz in Node-RED Context / Datei / Datenbank kann später
 *   außerhalb dieses Moduls ergänzt werden.
 */

'use strict';

const LIGHT_COUNT = 6;
const DEFAULT_HOLD_TIME_MS = 2000;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function normalizeDutyCyclePercent(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return 100;
    }

    return clamp(number, 0, 100);
}

function createScenarios(lightCount = LIGHT_COUNT) {
    const scenarios = [];

    // Phase 1:
    // Immer genau ein Licht aktiv.
    for (let i = 0; i < lightCount; i += 1) {
        scenarios.push([i]);
    }

    // Phase 2:
    // Nach dem Durchschalten immer ein weiteres Licht zuschalten.
    // [0,1], [0,1,2], ... bis alle aktiv sind.
    for (let count = 2; count <= lightCount; count += 1) {
        scenarios.push(
            Array.from({ length: count }, (_, index) => index)
        );
    }

    return scenarios;
}

class LightControllerKitchen {
    constructor(options = {}) {
        this.lightCount = Number.isInteger(options.lightCount)
            ? Math.max(1, options.lightCount)
            : LIGHT_COUNT;

        this.holdTimeMs = Number.isFinite(options.holdTimeMs)
            ? Math.max(1, options.holdTimeMs)
            : DEFAULT_HOLD_TIME_MS;

        this.scenarios = createScenarios(this.lightCount);

        // -1 bedeutet: Startzustand, alle Lichter aus.
        this.scenarioIndex = -1;

        this.buttonPressed = false;
        this.pressStartedAt = null;
        this.longPressHandled = false;

        this.dutyCyclePercent = 100;
        this.savedScenario = null;
    }

    /**
     * Verarbeitet einen neuen Eingangszustand.
     *
     * @param {Object} payload
     * @param {boolean} payload.ButtonPressed
     * @param {number} payload.DutyCycle Prozent 0..100
     * @param {number} nowMs Zeitstempel in ms, für Unit Tests injizierbar
     * @returns {Object}
     */
    process(payload = {}, nowMs = Date.now()) {
        const now = Number.isFinite(nowMs) ? nowMs : Date.now();

        const buttonPressed = payload.ButtonPressed === true;
        this.dutyCyclePercent = normalizeDutyCyclePercent(payload.DutyCycle);

        let event = 'none';
        let scenarioSaved = false;

        // Steigende Flanke
        if (buttonPressed && !this.buttonPressed) {
            this.pressStartedAt = now;
            this.longPressHandled = false;
            event = 'button_pressed';
        }

        // Taste bleibt gedrückt:
        // Falls zyklische Eingangsdaten kommen, kann bereits nach 2 s
        // gespeichert werden, ohne auf das Loslassen warten zu müssen.
        if (
            buttonPressed &&
            this.buttonPressed &&
            !this.longPressHandled &&
            this.pressStartedAt !== null &&
            (now - this.pressStartedAt) >= this.holdTimeMs
        ) {
            this.saveCurrentScenario(now);
            this.longPressHandled = true;
            scenarioSaved = true;
            event = 'scenario_saved';
        }

        // Fallende Flanke
        if (!buttonPressed && this.buttonPressed) {
            const pressDuration =
                this.pressStartedAt === null
                    ? 0
                    : Math.max(0, now - this.pressStartedAt);

            if (!this.longPressHandled) {
                if (pressDuration >= this.holdTimeMs) {
                    this.saveCurrentScenario(now);
                    scenarioSaved = true;
                    event = 'scenario_saved';
                } else {
                    this.nextScenario();
                    event = 'scenario_changed';
                }
            } else {
                event = 'button_released_after_save';
            }

            this.pressStartedAt = null;
            this.longPressHandled = false;
        }

        this.buttonPressed = buttonPressed;

        return this.getOutput({
            event,
            scenarioSaved
        });
    }

    /**
     * Zum nächsten Lichtbild wechseln.
     */
    nextScenario() {
        this.scenarioIndex =
            (this.scenarioIndex + 1) % this.scenarios.length;
    }

    /**
     * Aktuelles Szenario speichern.
     */
    saveCurrentScenario(nowMs = Date.now()) {
        const output = this.getLedOutput();

        this.savedScenario = {
            scenarioIndex: this.scenarioIndex,
            activeLights: this.getActiveLights(),
            dutyCyclePercent: this.dutyCyclePercent,
            ledOutput: [...output],
            savedAt: new Date(nowMs).toISOString()
        };

        return this.savedScenario;
    }

    /**
     * Liefert die Indizes der aktuell aktiven Lichter.
     */
    getActiveLights() {
        if (this.scenarioIndex < 0) {
            return [];
        }

        return [...this.scenarios[this.scenarioIndex]];
    }

    /**
     * Liefert 6 Duty-Cycle-Werte im Phidgets-Format 0.0 ... 1.0.
     */
    getLedOutput() {
        const output = Array(this.lightCount).fill(0.0);
        const dutyCycleNormalized = this.dutyCyclePercent / 100.0;

        for (const lightIndex of this.getActiveLights()) {
            output[lightIndex] = dutyCycleNormalized;
        }

        return output;
    }

    /**
     * Einheitliches Ausgangsobjekt.
     */
    getOutput({ event = 'none', scenarioSaved = false } = {}) {
        return {
            ButtonPressed: this.buttonPressed,
            DutyCycle: this.dutyCyclePercent,
            LedOutput: this.getLedOutput(),
            ActiveLights: this.getActiveLights(),
            ScenarioIndex: this.scenarioIndex,
            ScenarioSaved: scenarioSaved,
            SavedScenario: this.savedScenario
                ? {
                    ...this.savedScenario,
                    activeLights: [...this.savedScenario.activeLights],
                    ledOutput: [...this.savedScenario.ledOutput]
                }
                : null,
            Event: event
        };
    }

    /**
     * Optional nützlich, wenn Node-RED später einen gespeicherten
     * Zustand wiederherstellen soll.
     */
    restoreScenario(savedScenario) {
        if (!savedScenario || !Number.isInteger(savedScenario.scenarioIndex)) {
            throw new TypeError('savedScenario.scenarioIndex ist ungültig');
        }

        const index = savedScenario.scenarioIndex;

        if (index < -1 || index >= this.scenarios.length) {
            throw new RangeError('savedScenario.scenarioIndex außerhalb des gültigen Bereichs');
        }

        this.scenarioIndex = index;

        if (Number.isFinite(Number(savedScenario.dutyCyclePercent))) {
            this.dutyCyclePercent =
                normalizeDutyCyclePercent(savedScenario.dutyCyclePercent);
        }

        this.savedScenario = {
            scenarioIndex: this.scenarioIndex,
            activeLights: this.getActiveLights(),
            dutyCyclePercent: this.dutyCyclePercent,
            ledOutput: this.getLedOutput(),
            savedAt:
                typeof savedScenario.savedAt === 'string'
                    ? savedScenario.savedAt
                    : new Date().toISOString()
        };

        return this.getOutput({
            event: 'scenario_restored',
            scenarioSaved: false
        });
    }

    /**
     * Controller auf Ausgangszustand zurücksetzen.
     */
    reset() {
        this.scenarioIndex = -1;
        this.buttonPressed = false;
        this.pressStartedAt = null;
        this.longPressHandled = false;
        this.dutyCyclePercent = 100;
        this.savedScenario = null;

        return this.getOutput({
            event: 'reset',
            scenarioSaved: false
        });
    }
}

module.exports = {
    LightControllerKitchen,
    createScenarios,
    normalizeDutyCyclePercent,
    LIGHT_COUNT,
    DEFAULT_HOLD_TIME_MS
};
