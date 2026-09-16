import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const { LightController } = createRequire(import.meta.url)('../lib/functions/generated/LightController.js');

function dashboardHarness() {
    let watcher;
    const sent = [], handlers = {};
    const scope = { $watch(_, cb) { watcher = cb; }, $on() {}, $applyAsync(cb) { cb(); },
        send(msg) { sent.push(JSON.parse(JSON.stringify(msg.payload))); } };
    const button = { addEventListener(name, cb) { handlers[name] = cb; } };
    vm.runInNewContext(template.match(/<script>([\s\S]*?)<\/script>/)[1], {
        scope, document: { getElementById() { return button; } },
        window: { setTimeout(cb) { cb(); }, setInterval() { return 1; }, clearInterval() {}, confirm() { return true; } },
    });
    sent.length = 0;
    return { scope, sent, update(payload) { watcher({ payload }); },
        press() { handlers.pointerdown({ preventDefault() {}, currentTarget: {} }); },
        release() { handlers.pointerup({ preventDefault() {} }); } };
}

test('Echter Dashboard-Taster erhält Szenarioprozentwerte bei 100, 40 und 0 Prozent Gesamthelligkeit', () => {
    for (const duty of [100, 40, 0]) {
        const controller = new LightController();
        controller.process({ Command: 'AddScenario', ScenarioName: 'Arbeit', ScenarioProperties: { 1: 50, 2: 100, 6: 70 } });
        controller.process({ Command: 'SelectScenario', ScenarioName: 'Arbeit' });
        const ui = dashboardHarness();
        ui.scope.dutyCycleDraft = duty;
        ui.scope.applyDutyCycle();
        const dimmed = controller.process(ui.sent.pop());
        assert.equal(dimmed.PersistentStateChanged, true);
        dimmed.LedOutput.forEach((value, index) => assert.ok(Math.abs(value - [0.5, 1, 0, 0, 0, 0.7][index] * duty / 100) < 1e-12));
        const restored = new LightController(controller.getConfiguration());
        assert.equal(restored.getOutput().DutyCycle, duty);
        for (let click = 0; click < 2; click++) {
            ui.press(); ui.release();
            assert.deepEqual(ui.sent.slice(-2), [{ ButtonPressed: true }, { ButtonPressed: false }]);
            restored.process(ui.sent.at(-2), 1000 + click * 1000);
            restored.process(ui.sent.at(-1), 1100 + click * 1000);
            restored.process({ Command: 'FlushPendingClick' }, 1700 + click * 1000);
        }
        assert.equal(restored.getOutput().DutyCycle, duty);
        assert.deepEqual(restored.getOutput().LedOutput, dimmed.LedOutput);
    }
});

test('Anwenden und Löschen verwenden Dropdown, Speichern den Entwurfsnamen; Status erhält Entwurf', () => {
    const ui = dashboardHarness();
    ui.scope.selectedScenarioName = 'Arbeit';
    ui.scope.scenarioName = 'Entwurf';
    ui.scope.scenarioLevels[0] = 55;
    ui.scope.dutyCycleDraft = 33; ui.scope.dutyCycleDirty = true;
    ui.update({ Event: 'scenario_selected', ScenarioName: 'Extern', DutyCycle: 70 });
    assert.equal(ui.scope.selectedScenarioName, 'Arbeit');
    assert.equal(ui.scope.scenarioName, 'Entwurf');
    assert.equal(ui.scope.dutyCycleDraft, 33);
    ui.scope.sendScenarioCommand('ScenarioApply');
    ui.scope.deleteScenario();
    ui.scope.sendScenarioCommand('SaveScenario', true);
    assert.deepEqual(ui.sent.map(x => x.ScenarioName), ['Arbeit', 'Arbeit', 'Entwurf']);
    assert.equal(ui.sent[0].Command, 'ScenarioApply');
    assert.equal(ui.sent[2].ScenarioProperties[1], 55);
});

test('Dropdown-Wechsel lädt das Szenario und wendet es sofort an', () => {
    const ui = dashboardHarness();
    ui.update({ ScenarioList: [{
        ScenarioName: 'Szenario 11', ScenarioId: 'scenario-11', ScenarioType: 'system',
        ScenarioProperties: { 1: 20, 4: 65, 7: 100 },
    }], OutputCount: 7 });
    ui.scope.selectedScenarioName = 'Szenario 11';
    ui.scope.selectAndApplyScenario();
    assert.equal(ui.scope.scenarioName, 'Szenario 11');
    assert.deepEqual(Array.from(ui.scope.scenarioLevels), [20, 0, 0, 65, 0, 0, 100]);
    assert.deepEqual(ui.sent, [{ Command: 'ScenarioApply', ScenarioName: 'Szenario 11' }]);
});

test('Grundszenarien sind speicherbar, Löschen bleibt geschützt und Dimmerwerte werden geprüft', () => {
    const ui = dashboardHarness();
    ui.update({ DutyCycle: 70, ScenarioList: [{ ScenarioName: 'System', ScenarioType: 'system' }] });
    assert.equal(ui.scope.dutyCycleDraft, 70);
    ui.scope.scenarioName = 'System';
    ui.scope.scenarioLevels[0] = 35;
    ui.scope.sendScenarioCommand('SaveScenario', true);
    assert.equal(ui.sent.length, 1);
    assert.equal(ui.sent[0].Command, 'SaveScenario');
    assert.equal(ui.sent[0].ScenarioProperties[1], 35);
    ui.scope.selectedScenarioName = 'System';
    ui.scope.deleteScenario();
    for (const value of [null, undefined, -1, 101, NaN]) {
        ui.scope.dutyCycleDraft = value; ui.scope.applyDutyCycle();
        const controller = new LightController();
        controller.process({ Command: 'SetDutyCycle', DutyCycle: 45 });
        assert.equal(controller.process({ Command: 'SetDutyCycle', DutyCycle: value }).DutyCycle, 45);
    }
    assert.equal(ui.sent.length, 1);
});

const nodes = JSON.parse(fs.readFileSync(
    'flow-src/flows/light-controller--light_controller_flow/nodes.json',
    'utf8',
));
const template = fs.readFileSync(
    'flow-src/flows/light-controller--light_controller_flow/templates/kitchen-light-controller-dashboard.html',
    'utf8',
);
const exampleNodes = JSON.parse(fs.readFileSync('examples/LightController.node-red.json', 'utf8'));

function withoutHtmlComments(value) {
    return value.replace(/<!--[\s\S]*?-->/g, '').trim();
}

test('Kitchen-Dashboard ist bidirektional mit dem echten LightController verbunden', () => {
    const controller = nodes.find((node) => node.id === 'lightcontrollerkitchen');
    const dashboard = nodes.find((node) => node.id === 'lightcontroller_kitchen_dashboard');
    assert.equal(dashboard.type, 'ui_template');
    assert.equal(dashboard.group, '3dbc8c98.083aa4');
    assert.equal(dashboard.fwdInMessages, false);
    assert.ok(controller.wires[0].includes(dashboard.id));
    assert.deepEqual(dashboard.wires, [[controller.id]]);
});

test('Importierbares Beispiel enthält denselben ausführbaren Dashboard-Inhalt', () => {
    const dashboard = exampleNodes.find((node) => node.id === 'lightcontroller_kitchen_dashboard');
    const controller = exampleNodes.find((node) => node.id === 'lightcontrollerkitchen');
    assert.equal(withoutHtmlComments(dashboard.format), withoutHtmlComments(template));
    assert.deepEqual(dashboard.wires, [[controller.id]]);
    assert.ok(controller.wires[0].includes(dashboard.id));
});

test('Dashboard-Taster sendet getrennte Drücken- und Loslassen-Nachrichten', () => {
    assert.match(template, /addEventListener\("pointerdown", buttonDown\)/);
    assert.match(template, /addEventListener\("pointerup", buttonUp\)/);
    assert.match(template, /ButtonPressed:pressed/);
    assert.match(template, /ButtonTiming\.DurationMs/);
    assert.match(template, /PressedAt/);
    assert.match(template, /ReleasedAt/);
});

test('Dashboard zeigt dynamische LED-Ausgänge mit Prozentwerten', () => {
    assert.match(template, /scope\.ledIndexes = \[0,1,2,3,4,5\]/);
    assert.match(template, /Array\.from\(\{length:outputCount\}/);
    assert.match(template, /state\.LedOutput/);
    assert.match(template, /LED \{\{index \+ 1\}\}/);
});

test('Dashboard kann LEDs persistent bis zum Maximum 16 hinzufügen', () => {
    assert.match(template, /ng-click="addLed\(\)"/);
    assert.match(template, /Command:"AddOutput"/);
    assert.match(template, /maxOutputCount/);
    assert.match(template, /Maximal 16 LEDs/);
});

test('Dashboard kann die LED-Anzahl persistent bis zum Minimum eins verkleinern', () => {
    assert.match(template, /ng-click="removeLed\(\)"/);
    assert.match(template, /Command:"RemoveOutput"/);
    assert.match(template, /ledIndexes\.length <= 1/);
});

test('Live-Aktualisierung erhält Auswahl und Eingabefelder der Visualisierung', () => {
    assert.match(template, /scenarioListFingerprint/);
    assert.match(template, /incomingFingerprint !== scenarioListFingerprint/);
    assert.match(template, /if \(outputCount !== previousOutputCount\)/);
    assert.match(template, /key !== "ScenarioList" && key !== "ButtonTiming"/);
    assert.doesNotMatch(template, /scope\.state = \{ \.\.\.scope\.state, \.\.\.payload/);
});

test('Live-Status verändert im ausgeführten Dashboard weder Formular noch Listenreferenz', () => {
    const script = template.match(/<script>\s*([\s\S]*?)\s*<\/script>/)?.[1];
    let messageWatcher;
    const scope = {
        $watch(name, callback) { if (name === 'msg') messageWatcher = callback; },
        $on() {},
        send() {},
        $applyAsync(callback) { callback(); },
    };
    const window = {
        setTimeout() { return 1; },
        setInterval() { return 1; },
        clearInterval() {},
        confirm() { return false; },
    };
    vm.runInNewContext(script, { scope, window, document: {} });
    messageWatcher({ payload: {
        OutputCount: 7,
        ScenarioList: [{ ScenarioId: 'work', ScenarioName: 'Arbeit', ScenarioProperties: { 7: 80 } }],
        ButtonTiming: {},
    } });
    scope.selectedScenarioName = 'Arbeit';
    scope.scenarioName = 'Ungespeicherte Änderung';
    scope.scenarioLevels[6] = 55;
    const stableScenarioList = scope.state.ScenarioList;

    messageWatcher({ payload: {
        OutputCount: 7,
        ScenarioList: [{ ScenarioId: 'work', ScenarioName: 'Arbeit', ScenarioProperties: { 7: 80 } }],
        LedOutput: [0, 0, 0, 0, 0, 0, 0.8],
        Event: 'button_pressed',
        ButtonTiming: { Pressed: true },
    } });

    assert.equal(scope.selectedScenarioName, 'Arbeit');
    assert.equal(scope.scenarioName, 'Ungespeicherte Änderung');
    assert.equal(scope.scenarioLevels[6], 55);
    assert.equal(scope.state.ScenarioList, stableScenarioList);
    assert.equal(scope.state.LedOutput[6], 0.8);
});

test('Taster- und Statusaktualisierungen verändern die Dashboard-Geometrie nicht', () => {
    assert.match(template, /\.lc-kitchen\{[^}]*overflow-anchor:none/);
    assert.match(template, /\.lc-test-button\{[^}]*height:58px/);
    assert.match(template, /\.lc-status-card\{min-height:158px\}/);
    assert.match(template, /\.lc-event\{height:38px/);
    assert.match(template, /\.lc-command\{min-height:18px/);
    assert.match(template, /ng-class="\{hidden:!state\.SendCommand\}"/);
    assert.doesNotMatch(template, /ng-if="state\.SendCommand"/);
});

test('Szenariomenü unterstützt alle persistenten Verwaltungsbefehle', () => {
    for (const command of [
        'SaveScenario', 'AddScenario', 'SelectScenario', 'ScenarioApply', 'ListScenarios',
        'DeleteScenario', 'ClearAllScenarios',
    ]) {
        assert.match(template, new RegExp(command));
    }
    assert.match(template, /ScenarioProperties/);
    assert.match(template, /Eindeutiger Szenarioname/);
});

test('Szenariomenü wendet beim Wechsel an und schützt interne Schaltszenarien nur beim Löschen', () => {
    assert.match(template, /ng-change="selectAndApplyScenario\(\)"/);
    assert.match(template, /sendScenarioCommand\('ScenarioApply'\)/);
    assert.match(template, />Anwenden<\/button>/);
    assert.match(template, /selected\?\.ScenarioType === "system"/);
    assert.match(template, /Interne Schaltszenarien können nicht gelöscht werden/);
    assert.doesNotMatch(template, /Grundszenario geschützt/);
    assert.match(template, />Eigene löschen</);
});

test('Push-Anzeige kennt Kurz-, Doppel-, Lang- und Ultralangdruck', () => {
    assert.match(template, /short_press_pending/);
    assert.match(template, /scenario_double_selected/);
    assert.match(template, /scenario_mode_entered/);
    assert.match(template, /scenario_not_found/);
    assert.match(template, /input_action_recovered/);
    assert.match(template, /all_lights_off_command/);
    assert.match(template, /payload\.SendCommand/);
});
