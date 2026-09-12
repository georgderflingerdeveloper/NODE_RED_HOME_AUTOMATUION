import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const modulePath = process.env.LIGHT_CONTROLLER_FILE
    || new URL('../lib/functions/generated/LightController.js', import.meta.url).pathname;
const compatibilityPath = new URL(
    '../lib/functions/generated/LightControllerKitchen.js',
    import.meta.url,
).pathname;
const {
    LightController,
    LightControllerKitchen,
    createScenarios,
    normalizeDutyCyclePercent,
    LIGHT_COUNT,
    DEFAULT_INPUT_COUNT,
    DEFAULT_OUTPUT_COUNT,
    DEFAULT_HOLD_TIME_MS,
} = require(modulePath);

function press(controller, at = 0, dutyCycle = 100, inputs = undefined) {
    return controller.process(inputs
        ? { Inputs: inputs, DutyCycle: dutyCycle }
        : { ButtonPressed: true, DutyCycle: dutyCycle }, at);
}

function release(controller, at = 100, dutyCycle = 100, inputs = undefined) {
    return controller.process(inputs
        ? { Inputs: inputs, DutyCycle: dutyCycle }
        : { ButtonPressed: false, DutyCycle: dutyCycle }, at);
}

function shortPress(controller, at = 0, dutyCycle = 100, inputIndex = 0) {
    const inputs = controller.inputCount > 1
        ? Array.from({ length: controller.inputCount }, (_, index) => index === inputIndex)
        : undefined;
    press(controller, at, dutyCycle, inputs);
    return release(
        controller,
        at + 100,
        dutyCycle,
        inputs && Array(controller.inputCount).fill(false),
    );
}

function shortPresses(controller, count, dutyCycle = 100) {
    let output = controller.getOutput();
    for (let index = 0; index < count; index += 1) {
        output = shortPress(controller, index * 500, dutyCycle);
    }
    return output;
}

test('01 - generische Klasse heißt LightController', () => {
    assert.equal(typeof LightController, 'function');
});

test('02 - bisheriger Klassenname bleibt als Alias verfügbar', () => {
    assert.equal(LightControllerKitchen, LightController);
});

test('03 - Standardwerte bleiben 6 Ausgänge, 1 Eingang und 2000 ms', () => {
    assert.equal(LIGHT_COUNT, 6);
    assert.equal(DEFAULT_OUTPUT_COUNT, 6);
    assert.equal(DEFAULT_INPUT_COUNT, 1);
    assert.equal(DEFAULT_HOLD_TIME_MS, 2000);
});

test('04 - ungültige Helligkeit fällt auf 100 Prozent zurück', () => {
    assert.equal(normalizeDutyCyclePercent('ungültig'), 100);
});

for (const [number, input, expected] of [
    ['05', -20, 0],
    ['06', 0, 0],
    ['07', 25, 25],
    ['08', 100, 100],
    ['09', 180, 100],
]) {
    test(`${number} - DutyCycle ${input} wird zu ${expected}`, () => {
        assert.equal(normalizeDutyCyclePercent(input), expected);
    });
}

test('10 - Standardszenarien entsprechen weiterhin der alten Küchenfolge', () => {
    assert.deepEqual(createScenarios(3), [[0], [1], [2], [0, 1], [0, 1, 2]]);
});

test('11 - sechs Ausgänge erzeugen weiterhin elf Standardszenarien', () => {
    assert.equal(createScenarios().length, 11);
});

test('12 - Ausgangszahl 0 wird kompatibel auf 1 begrenzt', () => {
    assert.deepEqual(createScenarios(0), [[0]]);
});

test('13 - Instanzname ist unabhängig vom Klassennamen', () => {
    assert.equal(new LightController({ instanceName: 'Kitchen' }).instanceName, 'Kitchen');
});

test('14 - Standardinstanz startet ausgeschaltet', () => {
    const output = new LightController().getOutput();
    assert.equal(output.ScenarioIndex, -1);
    assert.deepEqual(output.LedOutput, [0, 0, 0, 0, 0, 0]);
});

test('15 - outputCount konfiguriert die Zahl der Lichtausgänge', () => {
    assert.equal(new LightController({ outputCount: 4 }).getOutput().LedOutput.length, 4);
});

test('16 - lightCount bleibt als kompatibler Optionsname erhalten', () => {
    assert.equal(new LightController({ lightCount: 5 }).outputCount, 5);
});

test('17 - inputCount konfiguriert die Zahl der Eingänge', () => {
    const controller = new LightController({ inputCount: 4 });
    assert.equal(controller.inputCount, 4);
    assert.deepEqual(controller.getOutput().Inputs, [false, false, false, false]);
});

test('18 - inputCount 0 wird sicher auf einen Eingang begrenzt', () => {
    assert.equal(new LightController({ inputCount: 0 }).inputCount, 1);
});

test('19 - nicht ganzzahlige Eingangszahl wird abgewiesen', () => {
    assert.throws(() => new LightController({ inputCount: 1.5 }), TypeError);
});

test('20 - holdTimeMs bleibt konfigurierbar', () => {
    assert.equal(new LightController({ holdTimeMs: 3500 }).holdTimeMs, 3500);
});

test('21 - holdTimeMs 0 wird kompatibel auf 1 ms begrenzt', () => {
    assert.equal(new LightController({ holdTimeMs: 0 }).holdTimeMs, 1);
});

test('22 - alter ButtonPressed-Eingang schaltet weiterhin weiter', () => {
    const output = shortPress(new LightController({ instanceName: 'Kitchen' }));
    assert.equal(output.Event, 'scenario_changed');
    assert.deepEqual(output.ActiveLights, [0]);
});

test('23 - nur boolesches true gilt als gedrückt', () => {
    const output = new LightController().process({ ButtonPressed: 1 }, 0);
    assert.equal(output.ButtonPressed, false);
});

test('24 - Schaltfolge läuft nach dem letzten Szenario weiter', () => {
    const controller = new LightController({ outputCount: 2 });
    assert.deepEqual(shortPresses(controller, 4).ActiveLights, [0]);
});

test('25 - DutyCycle skaliert das aktive Szenario', () => {
    assert.deepEqual(shortPress(new LightController(), 0, 50).LedOutput, [0.5, 0, 0, 0, 0, 0]);
});

test('26 - DutyCycle kann ohne Szenariowechsel geändert werden', () => {
    const controller = new LightController();
    shortPress(controller);
    const output = controller.process({ ButtonPressed: false, DutyCycle: 20 }, 500);
    assert.deepEqual(output.LedOutput, [0.2, 0, 0, 0, 0, 0]);
});

test('27 - langer Tastendruck speichert das Szenario', () => {
    const controller = new LightController({ inputBindings: [{ longAction: 'save' }] });
    shortPress(controller, 0, 60);
    press(controller, 1000, 60);
    const output = press(controller, 3000, 60);
    assert.equal(output.Event, 'scenario_saved');
    assert.equal(output.ScenarioSaved, true);
    assert.deepEqual(output.SavedScenario.ledOutput, [0.6, 0, 0, 0, 0, 0]);
});

test('28 - Loslassen nach erkanntem Langdruck speichert nicht doppelt', () => {
    const controller = new LightController({ inputBindings: [{ longAction: 'save' }] });
    shortPress(controller);
    press(controller, 1000);
    press(controller, 3000);
    const savedAt = controller.savedScenario.savedAt;
    const output = release(controller, 3100);
    assert.equal(output.Event, 'button_released_after_save');
    assert.equal(output.ScenarioSaved, false);
    assert.equal(output.SavedScenario.savedAt, savedAt);
});

test('29 - dynamisches Array-Szenario bestimmt aktive Ausgänge', () => {
    const controller = new LightController({ outputCount: 4, scenarios: [[1, 3]] });
    assert.deepEqual(shortPress(controller).LedOutput, [0, 1, 0, 1]);
});

test('30 - dynamisches Objekt-Szenario besitzt ID und Namen', () => {
    const controller = new LightController({
        scenarios: [{ id: 'work', name: 'Arbeitslicht', activeLights: [0, 2] }],
    });
    const output = shortPress(controller);
    assert.equal(output.ScenarioId, 'work');
    assert.equal(output.ScenarioName, 'Arbeitslicht');
});

test('31 - Szenario kann individuelle Ausgangshelligkeiten enthalten', () => {
    const controller = new LightController({
        outputCount: 3,
        scenarios: [{ id: 'evening', outputs: [1, 0.4, 0.1] }],
    });
    assert.deepEqual(shortPress(controller, 0, 50).LedOutput, [0.5, 0.2, 0.05]);
});

test('32 - fehlende Ausgangswerte werden mit 0 ergänzt', () => {
    const controller = new LightController({ outputCount: 3, scenarios: [{ outputs: [1] }] });
    assert.deepEqual(shortPress(controller).LedOutput, [1, 0, 0]);
});

test('33 - zu viele Szenarioausgänge werden abgewiesen', () => {
    assert.throws(() => new LightController({ outputCount: 2, scenarios: [{ outputs: [1, 0, 1] }] }), RangeError);
});

test('34 - Ausgangshelligkeit außerhalb 0 bis 1 wird abgewiesen', () => {
    assert.throws(() => new LightController({ scenarios: [{ outputs: [1.1] }] }), RangeError);
});

test('35 - ungültiger Ausgangsindex wird abgewiesen', () => {
    assert.throws(() => new LightController({ outputCount: 2, scenarios: [[2]] }), RangeError);
});

test('36 - doppelte Szenario-IDs werden abgewiesen', () => {
    assert.throws(() => new LightController({ scenarios: [{ id: 'same' }, { id: 'same' }] }), RangeError);
});

test('37 - leere Szenarioliste wird abgewiesen', () => {
    assert.throws(() => new LightController({ scenarios: [] }), RangeError);
});

test('38 - setScenarios ersetzt Szenarien zur Laufzeit', () => {
    const controller = new LightController();
    controller.setScenarios([{ id: 'night', activeLights: [5] }]);
    const output = shortPress(controller);
    assert.equal(output.ScenarioCount, 1);
    assert.deepEqual(output.ActiveLights, [5]);
});

test('39 - configure erhält ein Szenario mit gleicher ID', () => {
    const controller = new LightController({ scenarios: [{ id: 'a' }, { id: 'b', activeLights: [1] }] });
    shortPresses(controller, 2);
    const output = controller.configure({ scenarios: [{ id: 'b', activeLights: [2] }] });
    assert.equal(output.ScenarioId, 'b');
    assert.deepEqual(output.ActiveLights, [2]);
});

test('40 - configure schaltet sicher aus, wenn die aktive ID entfällt', () => {
    const controller = new LightController({ scenarios: [{ id: 'a', activeLights: [0] }] });
    shortPress(controller);
    assert.equal(controller.configure({ scenarios: [{ id: 'b', activeLights: [1] }] }).ScenarioIndex, -1);
});

test('41 - Configuration kann über process geändert werden', () => {
    const controller = new LightController();
    const output = controller.process({
        Command: 'configure',
        Configuration: { inputCount: 2, outputCount: 2, scenarios: [[0], [1]] },
    });
    assert.equal(output.Event, 'configuration_changed');
    assert.equal(output.InputCount, 2);
    assert.equal(output.OutputCount, 2);
});

test('42 - Konfigurationsversion steigt bei jeder Änderung', () => {
    const controller = new LightController();
    const before = controller.configurationVersion;
    controller.configure({ holdTimeMs: 3000 });
    assert.equal(controller.configurationVersion, before + 1);
});

test('43 - zweiter Eingang kann ein Szenario direkt auswählen', () => {
    const controller = new LightController({
        inputCount: 2,
        scenarios: [{ id: 'work', activeLights: [0] }, { id: 'night', activeLights: [1] }],
        inputBindings: [{ shortAction: 'next' }, { shortAction: { type: 'select', scenarioId: 'night' } }],
    });
    const output = shortPress(controller, 0, 100, 1);
    assert.equal(output.Event, 'scenario_selected');
    assert.equal(output.ScenarioId, 'night');
});

test('44 - Eingang kann alle Lichter ausschalten', () => {
    const controller = new LightController({
        inputCount: 2,
        inputBindings: [{ shortAction: 'next' }, { shortAction: 'off' }],
    });
    shortPress(controller, 0, 100, 0);
    assert.equal(shortPress(controller, 500, 100, 1).Event, 'lights_off');
    assert.deepEqual(controller.getLedOutput(), [0, 0, 0, 0, 0, 0]);
});

test('45 - Eingang kann rückwärts durch Szenarien schalten', () => {
    const controller = new LightController({ inputBindings: [{ shortAction: 'previous' }] });
    const output = shortPress(controller);
    assert.equal(output.ScenarioIndex, 10);
});

test('46 - Aktion none verändert kein Szenario', () => {
    const controller = new LightController({ inputBindings: [{ shortAction: 'none' }] });
    assert.equal(shortPress(controller).ScenarioIndex, -1);
});

test('47 - ungültige Aktionsart wird beim Ausführen sichtbar abgewiesen', () => {
    const controller = new LightController({ inputBindings: [{ shortAction: 'unknown' }] });
    press(controller);
    assert.throws(() => release(controller), RangeError);
});

test('48 - mehrere Eingänge werden getrennt ausgewertet', () => {
    const controller = new LightController({ inputCount: 2 });
    press(controller, 0, 100, [true, true]);
    const output = release(controller, 100, 100, [false, false]);
    assert.equal(output.Events.length, 2);
    assert.equal(output.ScenarioIndex, 1);
});

test('49 - inputBindings dürfen inputCount nicht überschreiten', () => {
    assert.throws(() => new LightController({ inputCount: 1, inputBindings: [{}, {}] }), RangeError);
});

test('50 - getConfiguration liefert veränderungssichere Kopien', () => {
    const controller = new LightController({ scenarios: [{ id: 'safe', outputs: [1] }] });
    const configuration = controller.getConfiguration();
    configuration.scenarios[0].outputs[0] = 0;
    assert.equal(controller.getConfiguration().scenarios[0].outputs[0], 1);
});

test('51 - SavedScenario liefert veränderungssichere Arrays', () => {
    const controller = new LightController();
    shortPress(controller);
    controller.saveCurrentScenario(0);
    const output = controller.getOutput();
    output.SavedScenario.ledOutput[0] = 999;
    assert.equal(controller.getOutput().SavedScenario.ledOutput[0], 1);
});

test('52 - restoreScenario akzeptiert die stabile Szenario-ID', () => {
    const controller = new LightController({ scenarios: [{ id: 'work', activeLights: [2] }] });
    const output = controller.restoreScenario({ scenarioId: 'work', dutyCyclePercent: 40 });
    assert.deepEqual(output.LedOutput, [0, 0, 0.4, 0, 0, 0]);
});

test('53 - restoreScenario akzeptiert weiterhin den alten Szenarioindex', () => {
    const controller = new LightController();
    assert.equal(controller.restoreScenario({ scenarioIndex: 2 }).ScenarioIndex, 2);
});

test('54 - reset erhält die Konfiguration und löscht nur den Zustand', () => {
    const controller = new LightController({ inputCount: 2, outputCount: 3, scenarios: [[2]] });
    shortPress(controller);
    const output = controller.reset();
    assert.equal(output.InputCount, 2);
    assert.equal(output.OutputCount, 3);
    assert.equal(output.ScenarioIndex, -1);
});

test('55 - alte LightControllerKitchen-Datei lädt das generische Modul', () => {
    const compatibilityModule = require(compatibilityPath);
    assert.equal(compatibilityModule.LightController, LightController);
    assert.equal(compatibilityModule.LightControllerKitchen, LightController);
});

test('56 - Langdruck schaltet ein aktives Szenario aus', () => {
    const controller = new LightController();
    shortPress(controller);
    press(controller, 1000);
    const output = press(controller, 3000);
    assert.equal(output.Event, 'lights_off');
    assert.equal(output.ScenarioIndex, -1);
    assert.deepEqual(output.LedOutput, [0, 0, 0, 0, 0, 0]);
});

test('57 - nächster Langdruck aktiviert das folgende Szenario', () => {
    const controller = new LightController();
    shortPress(controller);
    press(controller, 1000);
    press(controller, 3000);
    release(controller, 3100);
    press(controller, 4000);
    const output = press(controller, 6000);
    assert.equal(output.Event, 'scenario_changed');
    assert.equal(output.ScenarioIndex, 1);
    assert.deepEqual(output.ActiveLights, [1]);
});

test('58 - Langdruck aus dem Startzustand aktiviert das erste Szenario', () => {
    const controller = new LightController();
    press(controller, 0);
    const output = press(controller, 2000);
    assert.equal(output.ScenarioIndex, 0);
    assert.deepEqual(output.ActiveLights, [0]);
});

test('59 - Halten löst toggle-next nur einmal aus', () => {
    const controller = new LightController();
    shortPress(controller);
    press(controller, 1000);
    press(controller, 3000);
    const output = press(controller, 5000);
    assert.equal(output.Event, 'none');
    assert.equal(output.ScenarioIndex, -1);
});

test('60 - Loslassen nach toggle-next löst keine zweite Aktion aus', () => {
    const controller = new LightController();
    shortPress(controller);
    press(controller, 1000);
    press(controller, 3000);
    const output = release(controller, 3100);
    assert.equal(output.Event, 'button_released_after_long_action');
    assert.equal(output.ScenarioIndex, -1);
});

test('61 - Command AllLightsOn aktiviert alle konfigurierten Ausgänge', () => {
    const controller = new LightController({ outputCount: 4 });
    const output = controller.process({ Command: 'AllLightsOn', DutyCycle: 60 });
    assert.equal(output.Event, 'all_lights_on');
    assert.equal(output.AllLightsOverride, true);
    assert.deepEqual(output.ActiveLights, [0, 1, 2, 3]);
    assert.deepEqual(output.LedOutput, [0.6, 0.6, 0.6, 0.6]);
});

test('62 - Command AllLightsOff schaltet alle Ausgänge aus', () => {
    const controller = new LightController({ outputCount: 3 });
    controller.process({ Command: 'AllLightsOn' });
    const output = controller.process({ Command: 'AllLightsOff' });
    assert.equal(output.Event, 'all_lights_off');
    assert.equal(output.AllLightsOverride, false);
    assert.deepEqual(output.LedOutput, [0, 0, 0]);
});

test('63 - Langdruck nach AllLightsOn schaltet alle Ausgänge aus', () => {
    const controller = new LightController({ outputCount: 2 });
    controller.process({ Command: 'AllLightsOn' });
    press(controller, 0);
    const output = press(controller, 2000);
    assert.equal(output.Event, 'lights_off');
    assert.deepEqual(output.LedOutput, [0, 0]);
});

test('64 - weiterer Langdruck nach AllLightsOn und Aus aktiviert ein Szenario', () => {
    const controller = new LightController({ outputCount: 2 });
    controller.process({ Command: 'AllLightsOn' });
    press(controller, 0);
    press(controller, 2000);
    release(controller, 2100);
    press(controller, 3000);
    const output = press(controller, 5000);
    assert.equal(output.Event, 'scenario_changed');
    assert.equal(output.ScenarioIndex, 0);
    assert.deepEqual(output.ActiveLights, [0]);
});

test('65 - AllLightsOn ohne DutyCycle behält die zuletzt gesetzte Helligkeit', () => {
    const controller = new LightController({ outputCount: 2 });
    controller.process({ ButtonPressed: false, DutyCycle: 35 });
    const output = controller.process({ Command: 'AllLightsOn' });
    assert.deepEqual(output.LedOutput, [0.35, 0.35]);
});
