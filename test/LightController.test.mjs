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
    DEFAULT_DOUBLE_CLICK_TIME_MS,
    DEFAULT_ULTRA_HOLD_TIME_MS,
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
    release(
        controller,
        at + 100,
        dutyCycle,
        inputs && Array(controller.inputCount).fill(false),
    );
    return controller.process(
        { Command: 'FlushPendingClick' },
        at + 100 + controller.doubleClickTimeMs,
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

test('03 - Standardwerte enthalten 500 ms Doppel-, 2000 ms Lang- und 4000 ms Ultralangdruck', () => {
    assert.equal(LIGHT_COUNT, 6);
    assert.equal(DEFAULT_OUTPUT_COUNT, 6);
    assert.equal(DEFAULT_INPUT_COUNT, 1);
    assert.equal(DEFAULT_HOLD_TIME_MS, 2000);
    assert.equal(DEFAULT_DOUBLE_CLICK_TIME_MS, 500);
    assert.equal(DEFAULT_ULTRA_HOLD_TIME_MS, 4000);
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
    const output = release(controller, 3000, 60);
    assert.equal(output.Event, 'scenario_saved');
    assert.equal(output.ScenarioSaved, true);
    assert.deepEqual(output.SavedScenario.ledOutput, [0.6, 0, 0, 0, 0, 0]);
});

test('28 - Halten bei zwei Sekunden führt vor dem Loslassen keine Aktion aus', () => {
    const controller = new LightController({ inputBindings: [{ longAction: 'save' }] });
    shortPress(controller);
    press(controller, 1000);
    const held = press(controller, 3000);
    assert.equal(held.Event, 'none');
    const output = release(controller, 3100);
    assert.equal(output.Event, 'scenario_saved');
    assert.equal(output.ScenarioSaved, true);
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

test('37 - leere Szenarioliste ist für ClearAllScenarios zulässig', () => {
    const controller = new LightController({ scenarios: [] });
    assert.equal(controller.getOutput().ScenarioCount, 0);
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
    release(controller);
    assert.throws(() => controller.process({ Command: 'FlushPendingClick' }, 600), RangeError);
});

test('48 - mehrere Eingänge werden getrennt ausgewertet', () => {
    const controller = new LightController({ inputCount: 2 });
    press(controller, 0, 100, [true, true]);
    release(controller, 100, 100, [false, false]);
    const output = controller.process({ Command: 'FlushPendingClick' }, 600);
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
    const controller = new LightController({ inputBindings: [{ longAction: 'toggle-next' }] });
    shortPress(controller);
    press(controller, 1000);
    const output = release(controller, 3000);
    assert.equal(output.Event, 'lights_off');
    assert.equal(output.ScenarioIndex, -1);
    assert.deepEqual(output.LedOutput, [0, 0, 0, 0, 0, 0]);
});

test('57 - nächster Langdruck aktiviert das folgende Szenario', () => {
    const controller = new LightController({ inputBindings: [{ longAction: 'toggle-next' }] });
    shortPress(controller);
    press(controller, 1000);
    release(controller, 3000);
    press(controller, 4000);
    const output = release(controller, 6000);
    assert.equal(output.Event, 'scenario_changed');
    assert.equal(output.ScenarioIndex, 1);
    assert.deepEqual(output.ActiveLights, [1]);
});

test('58 - Langdruck aus dem Startzustand aktiviert das erste Szenario', () => {
    const controller = new LightController({ inputBindings: [{ longAction: 'toggle-next' }] });
    press(controller, 0);
    const output = release(controller, 2000);
    assert.equal(output.ScenarioIndex, 0);
    assert.deepEqual(output.ActiveLights, [0]);
});

test('59 - Halten ab zwei Sekunden löst die Langdruckaktion noch nicht vorzeitig aus', () => {
    const controller = new LightController({ inputBindings: [{ longAction: 'toggle-next' }] });
    shortPress(controller);
    press(controller, 1000);
    const output = press(controller, 3000);
    assert.equal(output.Event, 'none');
    assert.equal(output.ScenarioIndex, 0);
});

test('60 - Loslassen zwischen zwei und vier Sekunden löst toggle-next genau einmal aus', () => {
    const controller = new LightController({ inputBindings: [{ longAction: 'toggle-next' }] });
    shortPress(controller);
    press(controller, 1000);
    const output = release(controller, 3100);
    assert.equal(output.Event, 'lights_off');
    assert.equal(output.ScenarioIndex, -1);
    assert.equal(release(controller, 3200).Event, 'none');
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
    const controller = new LightController({
        outputCount: 2,
        inputBindings: [{ longAction: 'toggle-next' }],
    });
    controller.process({ Command: 'AllLightsOn' });
    press(controller, 0);
    const output = release(controller, 2000);
    assert.equal(output.Event, 'lights_off');
    assert.deepEqual(output.LedOutput, [0, 0]);
});

test('64 - weiterer Langdruck nach AllLightsOn und Aus aktiviert ein Szenario', () => {
    const controller = new LightController({
        outputCount: 2,
        inputBindings: [{ longAction: 'toggle-next' }],
    });
    controller.process({ Command: 'AllLightsOn' });
    press(controller, 0);
    release(controller, 2000);
    press(controller, 3000);
    const output = release(controller, 5000);
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

test('66 - LED-Status benennt jeden Ausgang verständlich', () => {
    const output = new LightController({ outputCount: 3 }).getOutput();
    assert.deepEqual(output.LedStatus, ['1=Off', '2=Off', '3=Off']);
    assert.equal(output.LedStatusText, '1=Off, 2=Off, 3=Off');
});

test('67 - SaveScenario übernimmt benannte Prozentwerte und zeigt den tatsächlichen LED-Status', () => {
    const controller = new LightController({ outputCount: 6, scenarios: [] });
    const output = controller.process({
        Command: 'SaveScenario',
        ScenarioName: 'Dinner',
        ScenarioProperties: { 1: 50, 2: 100, 6: 70 },
        DutyCycle: 70,
    }, 1000);
    assert.equal(output.Event, 'scenario_saved');
    assert.equal(output.ScenarioName, 'Dinner');
    assert.deepEqual(output.ScenarioProperties, { 1: 50, 2: 100, 6: 70 });
    assert.equal(output.LedStatusText, '1=On[35%], 2=On[70%], 3=Off, 4=Off, 5=Off, 6=On[49%]');
    assert.equal(output.ScenariosChanged, true);
});

test('68 - ListScenarios liefert Namen und Eigenschaften', () => {
    const controller = new LightController({ outputCount: 2, scenarios: [] });
    controller.process({ Command: 'AddScenario', ScenarioName: 'Lesen', ScenarioProperties: { 2: 40 } });
    const output = controller.process({ Command: 'ListScenarios' });
    assert.equal(output.Event, 'scenarios_listed');
    assert.deepEqual(output.ScenarioList, [{
        ScenarioName: 'Lesen',
        ScenarioId: 'lesen',
        ScenarioProperties: { 2: 40 },
    }]);
    assert.equal(output.ScenariosChanged, false);
});

test('69 - SaveScenario aktualisiert immer passend zum eindeutigen Namen', () => {
    const controller = new LightController({ outputCount: 2, scenarios: [] });
    controller.process({ Command: 'SaveScenario', ScenarioName: 'Abend', ScenarioProperties: { 1: 30 } });
    const output = controller.process({ Command: 'SaveScenario', ScenarioName: 'abend', ScenarioProperties: { 2: 80 } });
    assert.equal(output.ScenarioCount, 1);
    assert.equal(output.ScenarioName, 'abend');
    assert.deepEqual(output.ScenarioProperties, { 2: 80 });
});

test('70 - AddScenario verweigert doppelte Namen unabhängig von Großschreibung', () => {
    const controller = new LightController({ scenarios: [] });
    controller.process({ Command: 'AddScenario', ScenarioName: 'Arbeit', ScenarioProperties: { 1: 100 } });
    assert.throws(() => controller.process({
        Command: 'AddScenario',
        ScenarioName: 'arbeit',
        ScenarioProperties: { 2: 100 },
    }), /existiert bereits/);
});

test('71 - DeleteScenario löscht ausschließlich das benannte Szenario', () => {
    const controller = new LightController({ outputCount: 2, scenarios: [] });
    controller.process({ Command: 'AddScenario', ScenarioName: 'A', ScenarioProperties: { 1: 100 } });
    controller.process({ Command: 'AddScenario', ScenarioName: 'B', ScenarioProperties: { 2: 100 } });
    const output = controller.process({ Command: 'DeleteScenario', ScenarioName: 'a' });
    assert.equal(output.Event, 'scenario_deleted');
    assert.deepEqual(output.ScenarioList.map((scenario) => scenario.ScenarioName), ['B']);
});

test('72 - DeleteScenario meldet einen unbekannten Namen sichtbar', () => {
    const controller = new LightController({ scenarios: [] });
    assert.throws(
        () => controller.process({ Command: 'DeleteScenario', ScenarioName: 'Fehlt' }),
        /nicht gefunden/,
    );
});

test('73 - ClearAllScenarios leert die persistierbare Liste und schaltet aus', () => {
    const controller = new LightController();
    shortPress(controller);
    const output = controller.process({ Command: 'ClearAllScenarios' });
    assert.equal(output.Event, 'scenarios_cleared');
    assert.equal(output.ScenarioCount, 0);
    assert.equal(output.ScenarioIndex, -1);
    assert.deepEqual(output.LedOutput, [0, 0, 0, 0, 0, 0]);
});

test('74 - Schalten ohne gespeicherte Szenarien bleibt sicher ausgeschaltet', () => {
    const controller = new LightController({ scenarios: [] });
    const output = shortPress(controller);
    assert.equal(output.ScenarioIndex, -1);
    assert.deepEqual(output.LedOutput, [0, 0, 0, 0, 0, 0]);
});

test('75 - ScenarioProperties prüft die einsbasierten Ausgangsnummern', () => {
    const controller = new LightController({ outputCount: 2, scenarios: [] });
    assert.throws(() => controller.process({
        Command: 'SaveScenario', ScenarioName: 'Falsch', ScenarioProperties: { 3: 50 },
    }), /ungültigen Ausgang/);
});

test('76 - ScenarioProperties prüft Prozentwerte von 0 bis 100', () => {
    const controller = new LightController({ scenarios: [] });
    assert.throws(() => controller.process({
        Command: 'SaveScenario', ScenarioName: 'Falsch', ScenarioProperties: { 1: 101 },
    }), /zwischen 0 und 100/);
});

test('77 - Szenario-Commands benötigen einen nichtleeren Namen', () => {
    const controller = new LightController({ scenarios: [] });
    assert.throws(() => controller.process({
        Command: 'AddScenario', ScenarioName: ' ', ScenarioProperties: { 1: 50 },
    }), /darf nicht leer sein/);
});

test('78 - AddScenario benötigt explizite ScenarioProperties', () => {
    const controller = new LightController({ scenarios: [] });
    assert.throws(
        () => controller.process({ Command: 'AddScenario', ScenarioName: 'Leer' }),
        /benötigt ScenarioProperties/,
    );
});

test('79 - SaveScenario kann das aktive Szenario unter neuem Namen kopieren', () => {
    const controller = new LightController({ scenarios: [{ id: 'work', name: 'Arbeit', outputs: [0.5] }] });
    shortPress(controller);
    const output = controller.process({ Command: 'SaveScenario', ScenarioName: 'Kopie' });
    assert.equal(output.ScenarioCount, 2);
    assert.deepEqual(output.ScenarioProperties, { 1: 50 });
});

test('80 - getConfiguration enthält die per Command gespeicherten Szenarien', () => {
    const controller = new LightController({ outputCount: 2, scenarios: [] });
    controller.process({ Command: 'SaveScenario', ScenarioName: 'Persistiert', ScenarioProperties: { 2: 75 } });
    const restored = new LightController(controller.getConfiguration());
    assert.deepEqual(restored.process({ Command: 'ListScenarios' }).ScenarioList, [{
        ScenarioName: 'Persistiert',
        ScenarioId: 'persistiert',
        ScenarioProperties: { 2: 75 },
    }]);
});

test('81 - konfigurierte Szenario-Namen müssen eindeutig sein', () => {
    assert.throws(() => new LightController({ scenarios: [
        { id: 'a', name: 'Abend', outputs: [1] },
        { id: 'b', name: 'abend', outputs: [0] },
    ] }), /Namen müssen eindeutig/);
});

test('82 - SelectScenario aktiviert ein gespeichertes Szenario ausschließlich über seinen Namen', () => {
    const controller = new LightController({ outputCount: 3, scenarios: [
        { id: 'work', name: 'Arbeit', outputs: [1, 0, 0] },
        { id: 'dinner', name: 'Dinner', outputs: [0.5, 1, 0.7] },
    ] });
    const versionBefore = controller.configurationVersion;
    const output = controller.process({ Command: 'SelectScenario', ScenarioName: 'dinner' });
    assert.equal(output.Event, 'scenario_selected');
    assert.equal(output.ScenarioName, 'Dinner');
    assert.deepEqual(output.ScenarioProperties, { 1: 50, 2: 100, 3: 70 });
    assert.equal(output.ScenariosChanged, false);
    assert.equal(output.ConfigurationVersion, versionBefore);
});

test('83 - SelectScenario meldet einen unbekannten Namen sichtbar', () => {
    const controller = new LightController({ scenarios: [] });
    assert.throws(
        () => controller.process({ Command: 'SelectScenario', ScenarioName: 'Fehlt' }),
        /nicht gefunden/,
    );
});

test('84 - SelectScenario öffnet den persistenten Szenariomodus', () => {
    const controller = new LightController({ scenarios: [
        { id: 'normal', name: 'Normal', outputs: [1, 0] },
        { id: 'dinner', name: 'Dinner', outputs: [0.5, 1] },
    ] });
    shortPress(controller);
    const output = controller.process({ Command: 'SelectScenario', ScenarioName: 'Dinner' });
    assert.equal(output.OperatingMode, 'scenario');
    assert.equal(output.PersistentStateChanged, true);
    assert.deepEqual(output.LedOutput.slice(0, 2), [0.5, 1]);
});

test('85 - erster kurzer Klick wartet ohne unerwünschte Schaltaktion', () => {
    const controller = new LightController({ scenarios: [
        { id: 'dinner', name: 'Dinner', outputs: [1] },
    ] });
    controller.process({ Command: 'SelectScenario', ScenarioName: 'Dinner' });
    press(controller, 0);
    const output = release(controller, 100);
    assert.equal(output.Event, 'short_press_pending');
    assert.equal(output.ClickFlushAt, 600);
    assert.equal(output.ModeOutputEnabled, true);
    assert.deepEqual(output.ActiveLights, [0]);
});

test('86 - einzelner Klick schaltet das ausgewählte Szenario nach 500 ms persistent aus', () => {
    const controller = new LightController({ scenarios: [
        { id: 'dinner', name: 'Dinner', outputs: [1] },
    ] });
    controller.process({ Command: 'SelectScenario', ScenarioName: 'Dinner' });
    press(controller, 0);
    release(controller, 100);
    const output = controller.process({ Command: 'FlushPendingClick' }, 600);
    assert.equal(output.Event, 'scenario_toggled_off');
    assert.equal(output.ModeOutputEnabled, false);
    assert.equal(output.PersistentStateChanged, true);
});

test('87 - Doppelklick wählt das nächste Szenario ohne vorherige Einzelklickwirkung', () => {
    const controller = new LightController({ scenarios: [
        { id: 'one', name: 'Eins', outputs: [1, 0] },
        { id: 'two', name: 'Zwei', outputs: [0, 1] },
    ] });
    controller.process({ Command: 'SelectScenario', ScenarioName: 'Eins' });
    press(controller, 0);
    const firstRelease = release(controller, 100);
    press(controller, 300);
    const secondRelease = release(controller, 400);
    assert.equal(firstRelease.ModeOutputEnabled, true);
    assert.equal(secondRelease.Event, 'scenario_double_selected');
    assert.equal(secondRelease.ScenarioName, 'Zwei');
    assert.deepEqual(secondRelease.ActiveLights, [1]);
    assert.equal(secondRelease.ClickFlushAt, null);
});

test('88 - wiederholte Doppelklicks durchlaufen die Szenarien zyklisch', () => {
    const controller = new LightController({ scenarios: [
        { id: 'one', name: 'Eins', outputs: [1, 0] },
        { id: 'two', name: 'Zwei', outputs: [0, 1] },
    ] });
    controller.process({ Command: 'SelectScenario', ScenarioName: 'Eins' });
    press(controller, 0); release(controller, 50); press(controller, 200); release(controller, 250);
    press(controller, 1000); release(controller, 1050); press(controller, 1200);
    const output = release(controller, 1250);
    assert.equal(output.ScenarioName, 'Eins');
});

test('89 - Langdruck verlässt den Szenariomodus und stellt den Normalbetrieb wieder her', () => {
    const controller = new LightController({ scenarios: [
        { id: 'normal', name: 'Normal', outputs: [1, 0] },
        { id: 'dinner', name: 'Dinner', outputs: [0, 1] },
    ] });
    shortPress(controller);
    controller.process({ Command: 'SelectScenario', ScenarioName: 'Dinner' });
    press(controller, 1000);
    const output = release(controller, 3000);
    assert.equal(output.Event, 'scenario_mode_exited');
    assert.equal(output.OperatingMode, 'normal');
    assert.equal(output.ScenarioName, 'Normal');
});

test('90 - Langdruck im Normalbetrieb übernimmt das aktuell gewählte Einzellicht', () => {
    const controller = new LightController();
    shortPress(controller);
    press(controller, 1000);
    const output = release(controller, 3000);
    assert.equal(output.Event, 'manual_light_mode_entered');
    assert.equal(output.OperatingMode, 'manual-light');
    assert.equal(output.ManualLightNumber, 1);
});

test('91 - manueller Ein-Aus-Zustand und Modus überleben eine neue Instanz', () => {
    const controller = new LightController();
    shortPress(controller);
    press(controller, 1000); press(controller, 3000); release(controller, 3100);
    shortPress(controller, 4000);
    const restored = new LightController(controller.getConfiguration()).getOutput();
    assert.equal(restored.OperatingMode, 'manual-light');
    assert.equal(restored.ManualLightNumber, 1);
    assert.equal(restored.ModeOutputEnabled, false);
});

test('92 - ausgeschalteter Szenariomodus überlebt eine neue Instanz', () => {
    const controller = new LightController({ scenarios: [
        { id: 'dinner', name: 'Dinner', outputs: [0.5, 1] },
    ] });
    controller.process({ Command: 'SelectScenario', ScenarioName: 'Dinner' });
    shortPress(controller);
    const restored = new LightController(controller.getConfiguration()).getOutput();
    assert.equal(restored.OperatingMode, 'scenario');
    assert.equal(restored.ScenarioName, 'Dinner');
    assert.equal(restored.ModeOutputEnabled, false);
});

test('93 - Doppelklickzeit ist konfigurierbar', () => {
    const controller = new LightController({ doubleClickTimeMs: 350 });
    press(controller, 0);
    assert.equal(release(controller, 100).ClickFlushAt, 450);
    assert.equal(controller.getConfiguration().doubleClickTimeMs, 350);
});

test('94 - gedrückter Taster kündigt den Ultralang-Termin an', () => {
    const controller = new LightController();
    const output = press(controller, 1000);
    assert.equal(output.UltraLongFlushAt, 5000);
});

test('95 - Ultralang-Flush vor vier Sekunden bleibt wirkungslos', () => {
    const controller = new LightController();
    press(controller, 0);
    const output = controller.process({ Command: 'FlushUltraLongPress' }, 3999);
    assert.equal(output.Event, 'none');
    assert.equal(output.SendCommand, null);
});

test('96 - Ultralangdruck schaltet sofort alles aus und sendet den Commander-Befehl', () => {
    const controller = new LightController({ outputCount: 3 });
    controller.process({ Command: 'AllLightsOn' });
    press(controller, 0);
    const output = controller.process({ Command: 'FlushUltraLongPress' }, 4000);
    assert.equal(output.Event, 'all_lights_off_command');
    assert.equal(output.SendCommand, 'CommandAllLightsOff');
    assert.equal(output.PersistentStateChanged, true);
    assert.deepEqual(output.LedOutput, [0, 0, 0]);
});

test('97 - Ultralangdruck verlässt einen ausgewählten Szenariomodus', () => {
    const controller = new LightController({ outputCount: 2, scenarios: [
        { id: 'dinner', name: 'Dinner', outputs: [0.5, 1] },
    ] });
    controller.process({ Command: 'SelectScenario', ScenarioName: 'Dinner' });
    press(controller, 0);
    const output = controller.process({ Command: 'FlushUltraLongPress' }, 4000);
    assert.equal(output.OperatingMode, 'normal');
    assert.equal(output.ScenarioName, null);
    assert.deepEqual(output.LedOutput, [0, 0]);
});

test('98 - Loslassen nach Ultralangdruck sendet den Commander-Befehl nicht doppelt', () => {
    const controller = new LightController();
    press(controller, 0);
    controller.process({ Command: 'FlushUltraLongPress' }, 4000);
    const output = release(controller, 4100);
    assert.equal(output.Event, 'button_released_after_ultra_long_action');
    assert.equal(output.SendCommand, null);
});

test('99 - Loslassen nach mehr als vier Sekunden ist ein sicherer Timer-Fallback', () => {
    const controller = new LightController();
    press(controller, 0);
    const output = release(controller, 4100);
    assert.equal(output.Event, 'all_lights_off_command');
    assert.equal(output.SendCommand, 'CommandAllLightsOff');
});

test('100 - Ultralangzeit ist konfigurierbar und bleibt größer als die Langdruckzeit', () => {
    const controller = new LightController({ holdTimeMs: 3000, ultraHoldTimeMs: 2500 });
    assert.equal(controller.ultraHoldTimeMs, 3001);
});

test('101 - getConfiguration enthält Ultralangzeit und Aktion als sichere Kopien', () => {
    const controller = new LightController({
        ultraHoldTimeMs: 4500,
        inputBindings: [{ ultraLongAction: { type: 'all-off-command' } }],
    });
    const configuration = controller.getConfiguration();
    configuration.inputBindings[0].ultraLongAction.type = 'none';
    assert.equal(configuration.ultraHoldTimeMs, 4500);
    assert.equal(controller.getConfiguration().inputBindings[0].ultraLongAction.type, 'all-off-command');
});
