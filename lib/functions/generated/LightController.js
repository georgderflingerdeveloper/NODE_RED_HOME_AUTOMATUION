/**
 * LightController
 *
 * Provider- und hardwareunabhängige Lichtsteuerung. Der Klassenname ist für
 * alle Räume gleich; nur instanceName unterscheidet die konkrete Instanz.
 *
 * Kompatibler Eingang:
 *   { ButtonPressed: boolean, DutyCycle: 0..100 }
 *
 * Erweiterter Eingang:
 *   { Inputs: [boolean, ...], DutyCycle: 0..100 }
 *
 * Dynamische Konfiguration:
 *   controller.configure({ inputCount, outputCount, inputBindings, scenarios })
 * oder:
 *   controller.process({ Command: "configure", Configuration: { ... } })
 *
 * Namensbasierte Szenarien:
 *   { Command: "SaveScenario", ScenarioName: "Dinner",
 *     ScenarioProperties: { 1: 50, 2: 100, 6: 70 } }
 */

'use strict';

const LIGHT_COUNT = 6;
const DEFAULT_OUTPUT_COUNT = LIGHT_COUNT;
const DEFAULT_INPUT_COUNT = 1;
const DEFAULT_HOLD_TIME_MS = 2000;
const DEFAULT_DOUBLE_CLICK_TIME_MS = 500;
const DEFAULT_ULTRA_HOLD_TIME_MS = 4000;
const OPERATING_MODE_NORMAL = 'normal';
const OPERATING_MODE_SCENARIO = 'scenario';
const OPERATING_MODE_MANUAL_LIGHT = 'manual-light';

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

function normalizeDutyCyclePercent(value) {
    const number = Number(value);
    return Number.isFinite(number) ? clamp(number, 0, 100) : 100;
}

function normalizePositiveInteger(value, fallback, fieldName) {
    if (value === undefined) return fallback;
    if (!Number.isInteger(value)) throw new TypeError(`${fieldName} muss eine ganze Zahl sein`);
    return Math.max(1, value);
}

function createScenarios(outputCount = DEFAULT_OUTPUT_COUNT) {
    const count = normalizePositiveInteger(outputCount, DEFAULT_OUTPUT_COUNT, 'outputCount');
    const scenarios = [];
    for (let index = 0; index < count; index += 1) scenarios.push([index]);
    for (let length = 2; length <= count; length += 1) {
        scenarios.push(Array.from({ length }, (_, index) => index));
    }
    return scenarios;
}

function normalizeActiveLights(activeLights, outputCount, scenarioName) {
    if (!Array.isArray(activeLights)) {
        throw new TypeError(`${scenarioName}.activeLights muss ein Array sein`);
    }
    const unique = new Set();
    for (const value of activeLights) {
        if (!Number.isInteger(value) || value < 0 || value >= outputCount) {
            throw new RangeError(`${scenarioName} enthält einen ungültigen Ausgangsindex`);
        }
        unique.add(value);
    }
    return [...unique].sort((left, right) => left - right);
}

function normalizeScenario(scenario, index, outputCount) {
    const scenarioName = `scenarios[${index}]`;
    if (Array.isArray(scenario)) {
        const activeLights = normalizeActiveLights(scenario, outputCount, scenarioName);
        return {
            id: `scenario-${index + 1}`,
            name: `Szenario ${index + 1}`,
            outputs: Array.from({ length: outputCount }, (_, outputIndex) =>
                activeLights.includes(outputIndex) ? 1 : 0),
        };
    }
    if (!scenario || typeof scenario !== 'object') {
        throw new TypeError(`${scenarioName} muss ein Array oder Objekt sein`);
    }

    const id = String(scenario.id || `scenario-${index + 1}`).trim();
    const name = String(scenario.name || id).trim();
    if (!id) throw new RangeError(`${scenarioName}.id darf nicht leer sein`);
    if (!name) throw new RangeError(`${scenarioName}.name darf nicht leer sein`);
    let outputs;
    if (Array.isArray(scenario.outputs)) {
        if (scenario.outputs.length > outputCount) {
            throw new RangeError(`${scenarioName}.outputs enthält mehr Werte als Ausgänge`);
        }
        outputs = Array.from({ length: outputCount }, (_, outputIndex) => {
            const value = Number(scenario.outputs[outputIndex] ?? 0);
            if (!Number.isFinite(value) || value < 0 || value > 1) {
                throw new RangeError(`${scenarioName}.outputs muss Werte von 0 bis 1 enthalten`);
            }
            return value;
        });
    } else {
        const activeLights = normalizeActiveLights(scenario.activeLights || [], outputCount, scenarioName);
        outputs = Array.from({ length: outputCount }, (_, outputIndex) =>
            activeLights.includes(outputIndex) ? 1 : 0);
    }
    return { id, name, outputs };
}

function normalizeScenarios(scenarios, outputCount) {
    const source = scenarios === undefined ? createScenarios(outputCount) : scenarios;
    if (!Array.isArray(source)) throw new TypeError('scenarios muss ein Array sein');
    const normalized = source.map((scenario, index) => normalizeScenario(scenario, index, outputCount));
    const ids = new Set(normalized.map((scenario) => scenario.id));
    if (ids.size !== normalized.length) throw new RangeError('Szenario-IDs müssen eindeutig sein');
    const names = new Set(normalized.map((scenario) => scenario.name.toLocaleLowerCase('de-DE')));
    if (names.size !== normalized.length) throw new RangeError('Szenario-Namen müssen eindeutig sein');
    return normalized;
}

function normalizeScenarioName(value) {
    const name = String(value ?? '').trim();
    if (!name) throw new RangeError('ScenarioName darf nicht leer sein');
    return name;
}

function normalizeScenarioProperties(properties, outputCount) {
    if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
        throw new TypeError('ScenarioProperties muss ein Objekt sein');
    }
    const outputs = Array(outputCount).fill(0);
    for (const [key, rawValue] of Object.entries(properties)) {
        const outputNumber = Number(key);
        const percentage = Number(rawValue);
        if (!Number.isInteger(outputNumber) || outputNumber < 1 || outputNumber > outputCount) {
            throw new RangeError(`ScenarioProperties enthält den ungültigen Ausgang ${key}`);
        }
        if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
            throw new RangeError(`ScenarioProperties[${key}] muss zwischen 0 und 100 liegen`);
        }
        outputs[outputNumber - 1] = percentage / 100;
    }
    return outputs;
}

function scenarioPropertiesFromOutputs(outputs) {
    return Object.fromEntries(outputs.flatMap((value, index) => value > 0
        ? [[String(index + 1), Math.round(value * 10000) / 100]]
        : []));
}

function scenarioIdFromName(name, existingScenarios = []) {
    const base = name
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('de-DE')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'scenario';
    const ids = new Set(existingScenarios.map((scenario) => scenario.id));
    if (!ids.has(base)) return base;
    let suffix = 2;
    while (ids.has(`${base}-${suffix}`)) suffix += 1;
    return `${base}-${suffix}`;
}

function normalizeAction(action, fallback) {
    if (action === undefined) return { type: fallback };
    if (typeof action === 'string') return { type: action };
    if (!action || typeof action !== 'object' || typeof action.type !== 'string') {
        throw new TypeError('Eingangsaktion muss ein String oder ein Objekt mit type sein');
    }
    return { ...action };
}

function normalizeInputBindings(bindings, inputCount) {
    if (bindings !== undefined && !Array.isArray(bindings)) {
        throw new TypeError('inputBindings muss ein Array sein');
    }
    if (Array.isArray(bindings) && bindings.length > inputCount) {
        throw new RangeError('inputBindings enthält mehr Einträge als konfigurierte Eingänge');
    }
    return Array.from({ length: inputCount }, (_, index) => {
        const binding = bindings?.[index] || {};
        return {
            id: String(binding.id || `input-${index + 1}`),
            shortAction: normalizeAction(binding.shortAction, 'next'),
            doubleAction: normalizeAction(binding.doubleAction, 'next-scenario'),
            longAction: normalizeAction(binding.longAction, 'toggle-mode'),
            ultraLongAction: normalizeAction(binding.ultraLongAction, 'all-off-command'),
        };
    });
}

class LightController {
    constructor(options = {}) {
        this.instanceName = String(options.instanceName || 'LightController');
        this.configurationVersion = 0;
        this.scenarioIndex = -1;
        this.allLightsOverride = false;
        this.dutyCyclePercent = 100;
        this.savedScenario = null;
        this.operatingMode = OPERATING_MODE_NORMAL;
        this.modeOutputEnabled = true;
        this.manualLightIndex = null;
        this.normalScenarioIndex = -1;
        this.configure(options, { initial: true });
    }

    configure(configuration = {}, { initial = false } = {}) {
        if (!configuration || typeof configuration !== 'object') {
            throw new TypeError('Configuration muss ein Objekt sein');
        }
        const outputCount = normalizePositiveInteger(
            configuration.outputCount ?? configuration.lightCount,
            initial ? DEFAULT_OUTPUT_COUNT : this.outputCount,
            'outputCount',
        );
        const inputCount = normalizePositiveInteger(
            configuration.inputCount,
            initial ? DEFAULT_INPUT_COUNT : this.inputCount,
            'inputCount',
        );
        const holdTimeMs = Number(configuration.holdTimeMs ?? (initial ? DEFAULT_HOLD_TIME_MS : this.holdTimeMs));
        if (!Number.isFinite(holdTimeMs)) throw new TypeError('holdTimeMs muss eine Zahl sein');
        const doubleClickTimeMs = Number(configuration.doubleClickTimeMs
            ?? (initial ? DEFAULT_DOUBLE_CLICK_TIME_MS : this.doubleClickTimeMs));
        if (!Number.isFinite(doubleClickTimeMs)) throw new TypeError('doubleClickTimeMs muss eine Zahl sein');
        const ultraHoldTimeMs = Number(configuration.ultraHoldTimeMs
            ?? (initial ? DEFAULT_ULTRA_HOLD_TIME_MS : this.ultraHoldTimeMs));
        if (!Number.isFinite(ultraHoldTimeMs)) throw new TypeError('ultraHoldTimeMs muss eine Zahl sein');

        const scenarioSource = configuration.scenarios === undefined && !initial && outputCount === this.outputCount
            ? this.scenarioDefinitions
            : configuration.scenarios;
        const scenarioDefinitions = normalizeScenarios(scenarioSource, outputCount);
        const inputBindings = normalizeInputBindings(
            configuration.inputBindings === undefined && !initial && inputCount === this.inputCount
                ? this.inputBindings
                : configuration.inputBindings,
            inputCount,
        );
        const previousScenarioId = this.getCurrentScenario()?.id;
        const persistentState = configuration.runtimeState
            ?? (!initial ? this.getPersistentState() : null);

        this.outputCount = outputCount;
        this.lightCount = outputCount;
        this.inputCount = inputCount;
        this.holdTimeMs = Math.max(1, holdTimeMs);
        this.doubleClickTimeMs = Math.max(1, doubleClickTimeMs);
        this.ultraHoldTimeMs = Math.max(this.holdTimeMs + 1, ultraHoldTimeMs);
        this.scenarioDefinitions = scenarioDefinitions.map((scenario) => ({
            ...scenario,
            outputs: [...scenario.outputs],
        }));
        this.scenarios = this.scenarioDefinitions.map((scenario) =>
            scenario.outputs.flatMap((value, index) => value > 0 ? [index] : []));
        this.inputBindings = inputBindings;
        this.inputStates = Array.from({ length: inputCount }, () => ({
            pressed: false,
            pressStartedAt: null,
            longPressHandled: false,
            ultraLongPressHandled: false,
            pendingClick: null,
            doublePressCandidate: false,
        }));
        this.buttonPressed = false;
        this.pressStartedAt = null;
        this.longPressHandled = false;

        const preservedIndex = previousScenarioId
            ? this.scenarioDefinitions.findIndex((scenario) => scenario.id === previousScenarioId)
            : -1;
        this.scenarioIndex = preservedIndex >= 0 ? preservedIndex : -1;
        this.allLightsOverride = false;
        this.pendingScenarioIndex = 0;
        this.operatingMode = OPERATING_MODE_NORMAL;
        this.modeOutputEnabled = true;
        this.manualLightIndex = null;
        this.normalScenarioIndex = this.scenarioIndex;
        if (persistentState) this.restorePersistentState(persistentState);
        this.configurationVersion += 1;
        return this.getOutput({ event: initial ? 'initialized' : 'configuration_changed' });
    }

    setScenarios(scenarios) {
        return this.configure({ scenarios });
    }

    process(payload = {}, nowMs = Date.now()) {
        const messageNow = Number(payload.NowMs);
        const now = Number.isFinite(messageNow)
            ? messageNow
            : Number.isFinite(nowMs) ? nowMs : Date.now();
        if (payload.Command === 'configure' || payload.Configuration) {
            this.configure(payload.Configuration || {});
            if (payload.DutyCycle !== undefined) {
                this.dutyCyclePercent = normalizeDutyCyclePercent(payload.DutyCycle);
            }
            return this.getOutput({ event: 'configuration_changed' });
        }

        if (payload.DutyCycle !== undefined) {
            this.dutyCyclePercent = normalizeDutyCyclePercent(payload.DutyCycle);
        }
        if (payload.Command === 'FlushPendingClick') {
            const events = this.flushPendingClicks(now);
            const event = events.length ? events[events.length - 1].event : 'none';
            return this.getOutput({
                event,
                events,
                persistentStateChanged: events.some(({ event: itemEvent }) =>
                    this.isPersistentEvent(itemEvent)),
            });
        }
        if (payload.Command === 'FlushUltraLongPress') {
            const events = this.flushUltraLongPresses(now);
            const event = events.length ? events[events.length - 1].event : 'none';
            return this.getOutput({
                event,
                events,
                sendCommand: events.some(({ event: itemEvent }) =>
                    itemEvent === 'all_lights_off_command') ? 'CommandAllLightsOff' : null,
                persistentStateChanged: events.some(({ event: itemEvent }) =>
                    this.isPersistentEvent(itemEvent)),
            });
        }
        if (['SaveScenario', 'SelectScenario', 'ListScenarios', 'AddScenario', 'DeleteScenario', 'ClearAllScenarios']
            .includes(payload.Command)) {
            this.cancelPendingClicks();
            return this.processScenarioCommand(payload, now);
        }
        if (payload.Command === 'AllLightsOn') {
            this.cancelPendingClicks();
            this.pendingScenarioIndex = this.scenarioDefinitions.length === 0
                ? null
                : this.scenarioIndex >= 0
                ? (this.scenarioIndex + 1) % this.scenarioDefinitions.length
                : 0;
            this.scenarioIndex = -1;
            this.allLightsOverride = true;
            this.leaveSpecialMode({ restoreNormalScenario: false });
            return this.getOutput({ event: 'all_lights_on', persistentStateChanged: true });
        }
        if (payload.Command === 'AllLightsOff') {
            this.cancelPendingClicks();
            this.allLightsOverride = false;
            this.scenarioIndex = -1;
            this.leaveSpecialMode({ restoreNormalScenario: false });
            return this.getOutput({ event: 'all_lights_off', persistentStateChanged: true });
        }

        const inputs = Array.isArray(payload.Inputs)
            ? Array.from({ length: this.inputCount }, (_, index) => payload.Inputs[index] === true)
            : Array.from({ length: this.inputCount }, (_, index) => index === 0 && payload.ButtonPressed === true);
        const events = this.flushPendingClicks(now);
        let scenarioSaved = false;
        let persistentStateChanged = events.some(({ event }) => this.isPersistentEvent(event));
        let sendCommand = events.some(({ event }) => event === 'all_lights_off_command')
            ? 'CommandAllLightsOff' : null;

        inputs.forEach((pressed, inputIndex) => {
            const state = this.inputStates[inputIndex];
            const binding = this.inputBindings[inputIndex];
            if (pressed && !state.pressed) {
                state.doublePressCandidate = Boolean(
                    state.pendingClick && now <= state.pendingClick.dueAt,
                );
                if (state.doublePressCandidate) state.pendingClick = null;
                state.pressStartedAt = now;
                state.longPressHandled = false;
                state.ultraLongPressHandled = false;
                events.push({ inputIndex, event: 'button_pressed' });
            }
            if (pressed && state.pressed && !state.ultraLongPressHandled
                && state.pressStartedAt !== null
                && now - state.pressStartedAt >= this.ultraHoldTimeMs) {
                const event = this.applyAction(binding.ultraLongAction, now);
                state.ultraLongPressHandled = true;
                state.longPressHandled = true;
                state.pendingClick = null;
                state.doublePressCandidate = false;
                persistentStateChanged ||= this.isPersistentEvent(event);
                sendCommand ||= event === 'all_lights_off_command'
                    ? 'CommandAllLightsOff' : null;
                events.push({ inputIndex, event });
            }
            if (!pressed && state.pressed) {
                const duration = state.pressStartedAt === null ? 0 : Math.max(0, now - state.pressStartedAt);
                let event;
                if (state.ultraLongPressHandled) {
                    event = 'button_released_after_ultra_long_action';
                } else if (duration >= this.ultraHoldTimeMs) {
                    event = this.applyAction(binding.ultraLongAction, now);
                    state.pendingClick = null;
                    state.doublePressCandidate = false;
                    state.ultraLongPressHandled = true;
                    sendCommand ||= event === 'all_lights_off_command'
                        ? 'CommandAllLightsOff' : null;
                } else if (state.longPressHandled) {
                    event = binding.longAction.type === 'save'
                        ? 'button_released_after_save'
                        : 'button_released_after_long_action';
                } else if (duration >= this.holdTimeMs) {
                    event = this.applyAction(binding.longAction, now);
                    state.pendingClick = null;
                    state.doublePressCandidate = false;
                } else if (state.doublePressCandidate) {
                    event = this.applyAction(binding.doubleAction, now);
                    state.doublePressCandidate = false;
                } else {
                    state.pendingClick = {
                        action: { ...binding.shortAction },
                        dueAt: now + this.doubleClickTimeMs,
                    };
                    event = 'short_press_pending';
                }
                scenarioSaved ||= event === 'scenario_saved';
                persistentStateChanged ||= this.isPersistentEvent(event);
                events.push({ inputIndex, event });
                state.pressStartedAt = null;
                state.longPressHandled = false;
                state.ultraLongPressHandled = false;
            }
            state.pressed = pressed;
        });

        this.buttonPressed = inputs[0] || false;
        this.pressStartedAt = this.inputStates[0]?.pressStartedAt ?? null;
        this.longPressHandled = this.inputStates[0]?.longPressHandled ?? false;
        const event = events.length ? events[events.length - 1].event : 'none';
        return this.getOutput({ event, events, scenarioSaved, persistentStateChanged, sendCommand });
    }

    flushUltraLongPresses(nowMs = Date.now()) {
        const events = [];
        this.inputStates.forEach((state, inputIndex) => {
            if (state.pressed && !state.ultraLongPressHandled && state.pressStartedAt !== null
                && nowMs - state.pressStartedAt >= this.ultraHoldTimeMs) {
                const event = this.applyAction(this.inputBindings[inputIndex].ultraLongAction, nowMs);
                state.ultraLongPressHandled = true;
                state.longPressHandled = true;
                state.pendingClick = null;
                state.doublePressCandidate = false;
                events.push({ inputIndex, event });
            }
        });
        return events;
    }

    flushPendingClicks(nowMs = Date.now()) {
        const events = [];
        this.inputStates.forEach((state, inputIndex) => {
            if (!state.pressed && state.pendingClick && nowMs >= state.pendingClick.dueAt) {
                const event = this.applyAction(state.pendingClick.action, nowMs);
                state.pendingClick = null;
                events.push({ inputIndex, event });
            }
        });
        return events;
    }

    cancelPendingClicks() {
        this.inputStates.forEach((state) => {
            state.pendingClick = null;
            state.doublePressCandidate = false;
        });
    }

    processScenarioCommand(payload, nowMs = Date.now()) {
        const command = payload.Command;
        if (command === 'ListScenarios') {
            return this.getOutput({
                event: 'scenarios_listed',
                commandResult: `${this.scenarioDefinitions.length} Szenarien`,
            });
        }
        if (command === 'ClearAllScenarios') {
            this.replaceScenarioDefinitions([], null);
            return this.getOutput({
                event: 'scenarios_cleared',
                scenariosChanged: true,
                commandResult: 'Alle Szenarien gelöscht',
            });
        }

        const name = normalizeScenarioName(payload.ScenarioName);
        const existingIndex = this.findScenarioIndexByName(name);
        if (command === 'SelectScenario') {
            if (existingIndex < 0) throw new RangeError(`Szenario nicht gefunden: ${name}`);
            if (this.operatingMode === OPERATING_MODE_NORMAL) {
                this.normalScenarioIndex = this.scenarioIndex;
            }
            this.allLightsOverride = false;
            this.scenarioIndex = existingIndex;
            this.pendingScenarioIndex = null;
            this.operatingMode = OPERATING_MODE_SCENARIO;
            this.modeOutputEnabled = true;
            this.manualLightIndex = null;
            return this.getOutput({
                event: 'scenario_selected',
                commandResult: `Szenario aktiviert: ${this.scenarioDefinitions[existingIndex].name}`,
                persistentStateChanged: true,
            });
        }
        if (command === 'DeleteScenario') {
            if (existingIndex < 0) throw new RangeError(`Szenario nicht gefunden: ${name}`);
            const definitions = this.scenarioDefinitions.filter((_, index) => index !== existingIndex);
            this.replaceScenarioDefinitions(definitions, null);
            return this.getOutput({
                event: 'scenario_deleted',
                scenariosChanged: true,
                commandResult: `Szenario gelöscht: ${name}`,
            });
        }

        if (command === 'AddScenario' && existingIndex >= 0) {
            throw new RangeError(`Szenario existiert bereits: ${name}`);
        }
        let outputs;
        if (payload.ScenarioProperties !== undefined) {
            outputs = normalizeScenarioProperties(payload.ScenarioProperties, this.outputCount);
        } else if (command === 'SaveScenario') {
            const current = this.getCurrentScenario();
            if (current) outputs = [...current.outputs];
            else if (this.allLightsOverride) outputs = Array(this.outputCount).fill(1);
            else throw new RangeError('SaveScenario benötigt ScenarioProperties oder ein aktives Szenario');
        } else {
            throw new RangeError('AddScenario benötigt ScenarioProperties');
        }

        const definitions = this.scenarioDefinitions.map((scenario) => ({
            ...scenario,
            outputs: [...scenario.outputs],
        }));
        const definition = {
            id: existingIndex >= 0
                ? definitions[existingIndex].id
                : scenarioIdFromName(name, definitions),
            name,
            outputs,
        };
        if (existingIndex >= 0) definitions[existingIndex] = definition;
        else definitions.push(definition);
        this.replaceScenarioDefinitions(definitions, name);
        this.savedScenario = {
            scenarioIndex: this.scenarioIndex,
            scenarioId: definition.id,
            activeLights: this.getActiveLights(),
            dutyCyclePercent: this.dutyCyclePercent,
            ledOutput: this.getLedOutput(),
            savedAt: new Date(nowMs).toISOString(),
        };
        return this.getOutput({
            event: command === 'AddScenario' ? 'scenario_added' : 'scenario_saved',
            scenarioSaved: command === 'SaveScenario',
            scenariosChanged: true,
            commandResult: `${command === 'AddScenario' ? 'Szenario hinzugefügt' : 'Szenario gespeichert'}: ${name}`,
        });
    }

    findScenarioIndexByName(name) {
        const key = normalizeScenarioName(name).toLocaleLowerCase('de-DE');
        return this.scenarioDefinitions.findIndex(
            (scenario) => scenario.name.toLocaleLowerCase('de-DE') === key,
        );
    }

    replaceScenarioDefinitions(definitions, activeScenarioName = null) {
        const normalized = normalizeScenarios(definitions, this.outputCount);
        this.scenarioDefinitions = normalized.map((scenario) => ({
            ...scenario,
            outputs: [...scenario.outputs],
        }));
        this.scenarios = this.scenarioDefinitions.map((scenario) =>
            scenario.outputs.flatMap((value, index) => value > 0 ? [index] : []));
        this.scenarioIndex = activeScenarioName === null
            ? -1
            : this.findScenarioIndexByName(activeScenarioName);
        this.allLightsOverride = false;
        this.pendingScenarioIndex = this.scenarioDefinitions.length ? 0 : null;
        this.operatingMode = OPERATING_MODE_NORMAL;
        this.modeOutputEnabled = true;
        this.manualLightIndex = null;
        this.normalScenarioIndex = this.scenarioIndex;
        this.configurationVersion += 1;
    }

    isPersistentEvent(event) {
        return [
            'scenario_toggled_on', 'scenario_toggled_off', 'scenario_mode_exited',
            'manual_light_mode_entered', 'manual_light_toggled_on',
            'manual_light_toggled_off', 'manual_light_mode_exited',
            'scenario_double_selected', 'lights_off', 'all_lights_off_command',
        ].includes(event);
    }

    toggleSpecialModeOutput() {
        this.modeOutputEnabled = !this.modeOutputEnabled;
        if (this.operatingMode === OPERATING_MODE_SCENARIO) {
            return this.modeOutputEnabled ? 'scenario_toggled_on' : 'scenario_toggled_off';
        }
        return this.modeOutputEnabled ? 'manual_light_toggled_on' : 'manual_light_toggled_off';
    }

    enterManualLightMode() {
        if (this.scenarioIndex < 0) return 'no_light_selected';
        const scenario = this.getCurrentScenario();
        const selectedLight = scenario?.outputs.findIndex((value) => value > 0) ?? -1;
        if (selectedLight < 0) return 'no_light_selected';
        this.normalScenarioIndex = this.scenarioIndex;
        this.manualLightIndex = selectedLight;
        this.modeOutputEnabled = true;
        this.operatingMode = OPERATING_MODE_MANUAL_LIGHT;
        this.allLightsOverride = false;
        return 'manual_light_mode_entered';
    }

    leaveSpecialMode({ restoreNormalScenario = true } = {}) {
        if (restoreNormalScenario) this.scenarioIndex = this.normalScenarioIndex;
        this.operatingMode = OPERATING_MODE_NORMAL;
        this.modeOutputEnabled = true;
        this.manualLightIndex = null;
        this.normalScenarioIndex = this.scenarioIndex;
    }

    applyAction(action, nowMs = Date.now()) {
        switch (action.type) {
        case 'next':
            if (this.operatingMode !== OPERATING_MODE_NORMAL) return this.toggleSpecialModeOutput();
            this.nextScenario();
            return 'scenario_changed';
        case 'previous':
            this.previousScenario();
            return 'scenario_changed';
        case 'next-scenario': {
            if (this.scenarioDefinitions.length === 0) return 'no_scenarios';
            if (this.operatingMode === OPERATING_MODE_NORMAL) {
                this.normalScenarioIndex = this.scenarioIndex;
            }
            const baseIndex = this.operatingMode === OPERATING_MODE_MANUAL_LIGHT
                ? this.normalScenarioIndex
                : this.scenarioIndex;
            this.scenarioIndex = (baseIndex + 1) % this.scenarioDefinitions.length;
            this.operatingMode = OPERATING_MODE_SCENARIO;
            this.modeOutputEnabled = true;
            this.manualLightIndex = null;
            this.allLightsOverride = false;
            this.pendingScenarioIndex = null;
            return 'scenario_double_selected';
        }
        case 'off':
            if (this.operatingMode !== OPERATING_MODE_NORMAL) {
                this.modeOutputEnabled = false;
                return 'lights_off';
            }
            this.allLightsOverride = false;
            this.scenarioIndex = -1;
            return 'lights_off';
        case 'all-off-command':
            this.allLightsOverride = false;
            this.scenarioIndex = -1;
            this.leaveSpecialMode({ restoreNormalScenario: false });
            return 'all_lights_off_command';
        case 'toggle-mode':
            if (this.operatingMode !== OPERATING_MODE_NORMAL) {
                const exitedMode = this.operatingMode;
                this.leaveSpecialMode();
                return exitedMode === OPERATING_MODE_SCENARIO
                    ? 'scenario_mode_exited'
                    : 'manual_light_mode_exited';
            }
            return this.enterManualLightMode();
        case 'toggle-next':
            if (this.scenarioIndex >= 0 || this.allLightsOverride) {
                if (this.scenarioIndex >= 0) {
                    this.pendingScenarioIndex = (this.scenarioIndex + 1) % this.scenarioDefinitions.length;
                }
                this.allLightsOverride = false;
                this.scenarioIndex = -1;
                this.normalScenarioIndex = -1;
                return 'lights_off';
            }
            if (this.scenarioDefinitions.length === 0) return 'no_scenarios';
            this.scenarioIndex = Number.isInteger(this.pendingScenarioIndex)
                ? this.pendingScenarioIndex % this.scenarioDefinitions.length
                : 0;
            this.normalScenarioIndex = this.scenarioIndex;
            this.pendingScenarioIndex = null;
            return 'scenario_changed';
        case 'save':
            this.saveCurrentScenario(nowMs);
            return 'scenario_saved';
        case 'select': {
            const index = action.scenarioId !== undefined
                ? this.scenarioDefinitions.findIndex((scenario) => scenario.id === String(action.scenarioId))
                : Number(action.scenarioIndex);
            if (!Number.isInteger(index) || index < 0 || index >= this.scenarioDefinitions.length) {
                throw new RangeError('select verweist auf kein gültiges Szenario');
            }
            this.allLightsOverride = false;
            if (this.operatingMode === OPERATING_MODE_NORMAL) {
                this.normalScenarioIndex = this.scenarioIndex;
            }
            this.scenarioIndex = index;
            this.pendingScenarioIndex = null;
            this.operatingMode = OPERATING_MODE_SCENARIO;
            this.modeOutputEnabled = true;
            this.manualLightIndex = null;
            return 'scenario_selected';
        }
        case 'none':
            return 'none';
        default:
            throw new RangeError(`Unbekannte Eingangsaktion: ${action.type}`);
        }
    }

    nextScenario() {
        this.leaveSpecialMode({ restoreNormalScenario: false });
        this.allLightsOverride = false;
        if (this.scenarioDefinitions.length === 0) {
            this.scenarioIndex = -1;
            this.pendingScenarioIndex = null;
            return;
        }
        this.scenarioIndex = (this.scenarioIndex + 1) % this.scenarioDefinitions.length;
        this.normalScenarioIndex = this.scenarioIndex;
        this.pendingScenarioIndex = null;
    }

    previousScenario() {
        this.leaveSpecialMode({ restoreNormalScenario: false });
        this.allLightsOverride = false;
        if (this.scenarioDefinitions.length === 0) {
            this.scenarioIndex = -1;
            this.pendingScenarioIndex = null;
            return;
        }
        this.scenarioIndex = this.scenarioIndex <= 0
            ? this.scenarioDefinitions.length - 1
            : this.scenarioIndex - 1;
        this.normalScenarioIndex = this.scenarioIndex;
        this.pendingScenarioIndex = null;
    }

    getCurrentScenario() {
        return this.scenarioIndex >= 0 ? this.scenarioDefinitions[this.scenarioIndex] : null;
    }

    getActiveLights() {
        if (this.operatingMode === OPERATING_MODE_MANUAL_LIGHT) {
            return this.modeOutputEnabled && Number.isInteger(this.manualLightIndex)
                ? [this.manualLightIndex] : [];
        }
        if (this.operatingMode === OPERATING_MODE_SCENARIO && !this.modeOutputEnabled) return [];
        if (this.allLightsOverride) {
            return Array.from({ length: this.outputCount }, (_, index) => index);
        }
        const scenario = this.getCurrentScenario();
        return scenario ? scenario.outputs.flatMap((value, index) => value > 0 ? [index] : []) : [];
    }

    getLedOutput() {
        const factor = this.dutyCyclePercent / 100;
        if (this.operatingMode === OPERATING_MODE_MANUAL_LIGHT) {
            return Array.from({ length: this.outputCount }, (_, index) =>
                this.modeOutputEnabled && index === this.manualLightIndex ? factor : 0);
        }
        if (this.operatingMode === OPERATING_MODE_SCENARIO && !this.modeOutputEnabled) {
            return Array(this.outputCount).fill(0);
        }
        if (this.allLightsOverride) return Array(this.outputCount).fill(factor);
        const scenario = this.getCurrentScenario();
        return scenario
            ? scenario.outputs.map((value) => value * factor)
            : Array(this.outputCount).fill(0);
    }

    saveCurrentScenario(nowMs = Date.now()) {
        const current = this.getCurrentScenario();
        this.savedScenario = {
            scenarioIndex: this.scenarioIndex,
            scenarioId: current?.id ?? null,
            activeLights: this.getActiveLights(),
            dutyCyclePercent: this.dutyCyclePercent,
            ledOutput: this.getLedOutput(),
            savedAt: new Date(nowMs).toISOString(),
        };
        return this.savedScenario;
    }

    restoreScenario(savedScenario) {
        if (!savedScenario || (savedScenario.scenarioId === undefined && !Number.isInteger(savedScenario.scenarioIndex))) {
            throw new TypeError('savedScenario benötigt scenarioId oder scenarioIndex');
        }
        const index = savedScenario.scenarioId !== undefined
            ? this.scenarioDefinitions.findIndex((scenario) => scenario.id === String(savedScenario.scenarioId))
            : savedScenario.scenarioIndex;
        if (!Number.isInteger(index) || index < -1 || index >= this.scenarioDefinitions.length) {
            throw new RangeError('Gespeichertes Szenario ist nicht verfügbar');
        }
        this.allLightsOverride = false;
        this.scenarioIndex = index;
        this.pendingScenarioIndex = null;
        this.operatingMode = OPERATING_MODE_NORMAL;
        this.modeOutputEnabled = true;
        this.manualLightIndex = null;
        this.normalScenarioIndex = index;
        if (savedScenario.dutyCyclePercent !== undefined) {
            this.dutyCyclePercent = normalizeDutyCyclePercent(savedScenario.dutyCyclePercent);
        }
        this.saveCurrentScenario(Date.parse(savedScenario.savedAt) || Date.now());
        if (typeof savedScenario.savedAt === 'string') this.savedScenario.savedAt = savedScenario.savedAt;
        return this.getOutput({ event: 'scenario_restored' });
    }

    getConfiguration() {
        return {
            instanceName: this.instanceName,
            inputCount: this.inputCount,
            outputCount: this.outputCount,
            holdTimeMs: this.holdTimeMs,
            doubleClickTimeMs: this.doubleClickTimeMs,
            ultraHoldTimeMs: this.ultraHoldTimeMs,
            inputBindings: this.inputBindings.map((binding) => ({
                ...binding,
                shortAction: { ...binding.shortAction },
                doubleAction: { ...binding.doubleAction },
                longAction: { ...binding.longAction },
                ultraLongAction: { ...binding.ultraLongAction },
            })),
            scenarios: this.scenarioDefinitions.map((scenario) => ({
                ...scenario,
                outputs: [...scenario.outputs],
            })),
            runtimeState: this.getPersistentState(),
            version: this.configurationVersion,
        };
    }

    getPersistentState() {
        return {
            operatingMode: this.operatingMode,
            modeOutputEnabled: this.modeOutputEnabled,
            scenarioId: this.getCurrentScenario()?.id ?? null,
            normalScenarioId: this.normalScenarioIndex >= 0
                ? this.scenarioDefinitions[this.normalScenarioIndex]?.id ?? null : null,
            manualLightNumber: Number.isInteger(this.manualLightIndex)
                ? this.manualLightIndex + 1 : null,
            dutyCyclePercent: this.dutyCyclePercent,
        };
    }

    restorePersistentState(state) {
        if (!state || typeof state !== 'object' || Array.isArray(state)) {
            throw new TypeError('runtimeState muss ein Objekt sein');
        }
        const scenarioIndex = state.scenarioId == null ? -1
            : this.scenarioDefinitions.findIndex((scenario) => scenario.id === String(state.scenarioId));
        const normalScenarioIndex = state.normalScenarioId == null ? scenarioIndex
            : this.scenarioDefinitions.findIndex(
                (scenario) => scenario.id === String(state.normalScenarioId),
            );
        const requestedMode = String(state.operatingMode || OPERATING_MODE_NORMAL);
        this.dutyCyclePercent = normalizeDutyCyclePercent(
            state.dutyCyclePercent ?? this.dutyCyclePercent,
        );
        this.scenarioIndex = scenarioIndex;
        this.normalScenarioIndex = normalScenarioIndex;
        this.modeOutputEnabled = state.modeOutputEnabled !== false;
        this.manualLightIndex = null;
        this.operatingMode = OPERATING_MODE_NORMAL;
        if (requestedMode === OPERATING_MODE_SCENARIO && scenarioIndex >= 0) {
            this.operatingMode = OPERATING_MODE_SCENARIO;
        } else if (requestedMode === OPERATING_MODE_MANUAL_LIGHT) {
            const manualLightNumber = Number(state.manualLightNumber);
            if (Number.isInteger(manualLightNumber)
                && manualLightNumber >= 1 && manualLightNumber <= this.outputCount) {
                this.operatingMode = OPERATING_MODE_MANUAL_LIGHT;
                this.manualLightIndex = manualLightNumber - 1;
            }
        }
        return this.getOutput({ event: 'persistent_state_restored' });
    }

    getScenarioList() {
        return this.scenarioDefinitions.map((scenario) => ({
            ScenarioName: scenario.name,
            ScenarioId: scenario.id,
            ScenarioProperties: scenarioPropertiesFromOutputs(scenario.outputs),
        }));
    }

    getLedStatus() {
        return this.getLedOutput().map((value, index) => {
            const percentage = Math.round(value * 10000) / 100;
            return `${index + 1}=${percentage > 0 ? `On[${percentage}%]` : 'Off'}`;
        });
    }

    getOutput({
        event = 'none',
        events = [],
        scenarioSaved = false,
        scenariosChanged = false,
        persistentStateChanged = false,
        commandResult = null,
        sendCommand = null,
    } = {}) {
        const current = this.getCurrentScenario();
        const ledStatus = this.getLedStatus();
        return {
            InstanceName: this.instanceName,
            ButtonPressed: this.buttonPressed,
            Inputs: this.inputStates.map((state) => state.pressed),
            InputCount: this.inputCount,
            OutputCount: this.outputCount,
            DutyCycle: this.dutyCyclePercent,
            LedOutput: this.getLedOutput(),
            ActiveLights: this.getActiveLights(),
            ScenarioIndex: this.scenarioIndex,
            ScenarioId: current?.id ?? null,
            ScenarioName: current?.name ?? null,
            ScenarioCount: this.scenarioDefinitions.length,
            ScenarioProperties: current ? scenarioPropertiesFromOutputs(current.outputs) : {},
            ScenarioList: this.getScenarioList(),
            AllLightsOverride: this.allLightsOverride,
            OperatingMode: this.operatingMode,
            ModeOutputEnabled: this.modeOutputEnabled,
            ManualLightNumber: Number.isInteger(this.manualLightIndex)
                ? this.manualLightIndex + 1 : null,
            PersistentState: this.getPersistentState(),
            PersistentStateChanged: persistentStateChanged,
            ClickFlushAt: this.inputStates.reduce((earliest, state) => {
                if (!state.pendingClick) return earliest;
                return earliest === null ? state.pendingClick.dueAt
                    : Math.min(earliest, state.pendingClick.dueAt);
            }, null),
            UltraLongFlushAt: this.inputStates.reduce((earliest, state) => {
                if (!state.pressed || state.ultraLongPressHandled || state.pressStartedAt === null) {
                    return earliest;
                }
                const dueAt = state.pressStartedAt + this.ultraHoldTimeMs;
                return earliest === null ? dueAt : Math.min(earliest, dueAt);
            }, null),
            ScenarioSaved: scenarioSaved,
            ScenariosChanged: scenariosChanged,
            SavedScenario: this.savedScenario ? {
                ...this.savedScenario,
                activeLights: [...this.savedScenario.activeLights],
                ledOutput: [...this.savedScenario.ledOutput],
            } : null,
            ConfigurationVersion: this.configurationVersion,
            LedStatus: ledStatus,
            LedStatusText: ledStatus.join(', '),
            CommandResult: commandResult,
            SendCommand: sendCommand,
            Event: event,
            Events: events.map((entry) => ({ ...entry })),
        };
    }

    reset() {
        this.scenarioIndex = -1;
        this.allLightsOverride = false;
        this.pendingScenarioIndex = 0;
        this.dutyCyclePercent = 100;
        this.savedScenario = null;
        this.operatingMode = OPERATING_MODE_NORMAL;
        this.modeOutputEnabled = true;
        this.manualLightIndex = null;
        this.normalScenarioIndex = -1;
        this.inputStates = Array.from({ length: this.inputCount }, () => ({
            pressed: false,
            pressStartedAt: null,
            longPressHandled: false,
            ultraLongPressHandled: false,
            pendingClick: null,
            doublePressCandidate: false,
        }));
        this.buttonPressed = false;
        this.pressStartedAt = null;
        this.longPressHandled = false;
        return this.getOutput({ event: 'reset' });
    }
}

// Übergangsname: bestehende Function-Nodes funktionieren weiterhin.
const LightControllerKitchen = LightController;

module.exports = {
    LightController,
    LightControllerKitchen,
    createScenarios,
    normalizeDutyCyclePercent,
    normalizeScenarios,
    LIGHT_COUNT,
    DEFAULT_OUTPUT_COUNT,
    DEFAULT_INPUT_COUNT,
    DEFAULT_HOLD_TIME_MS,
    DEFAULT_DOUBLE_CLICK_TIME_MS,
    DEFAULT_ULTRA_HOLD_TIME_MS,
    OPERATING_MODE_NORMAL,
    OPERATING_MODE_SCENARIO,
    OPERATING_MODE_MANUAL_LIGHT,
};
