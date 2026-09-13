import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const controllerModule = require('../lib/functions/generated/LightController.js');
const functionSource = fs.readFileSync('examples/light-controller-function.js', 'utf8').trimEnd();
const exampleNodes = JSON.parse(fs.readFileSync('examples/LightController.node-red.json', 'utf8'));

function storage(values = new Map()) {
    return {
        values,
        get(key) { return values.get(key); },
        set(key, value) { values.set(key, value); },
    };
}

function runWrapper(msg, { flow = storage(), context = storage() } = {}) {
    const statuses = [];
    const errors = [];
    const node = {
        status(value) { statuses.push(value); },
        error(value) { errors.push(value); },
        send() {},
    };
    const nodeGlobal = { get: () => controllerModule };
    const execute = new vm.Script(`(function (msg, node, context, flow, global) {\n${functionSource}\n})`)
        .runInNewContext({ setTimeout: () => ({ scheduled: true }), clearTimeout: () => {} });
    const result = execute(msg, node, context, flow, nodeGlobal);
    return { result, flow, context, statuses, errors };
}

test('LightController-Beispiel enthält getrennte Test-Injects für Drücken und Loslassen', () => {
    const pressed = exampleNodes.find((node) => node.id === 'lightcontroller_test_button_on');
    const released = exampleNodes.find((node) => node.id === 'lightcontroller_test_button_off');
    assert.deepEqual(JSON.parse(pressed.payload), { ButtonPressed: true, DutyCycle: 70 });
    assert.deepEqual(JSON.parse(released.payload), { ButtonPressed: false, DutyCycle: 70 });
    assert.deepEqual(pressed.wires, [['lightcontrollerkitchen']]);
    assert.deepEqual(released.wires, [['lightcontrollerkitchen']]);
});

test('LED-Debugnode zeigt den wartbaren LedStatusText an', () => {
    const debugNode = exampleNodes.find((node) => node.id === 'lightcontroller_led_status');
    assert.equal(debugNode.type, 'debug');
    assert.equal(debugNode.complete, 'payload.LedStatusText');
    assert.equal(debugNode.active, true);
});

test('SelectScenario-Test-Inject aktiviert Testlicht eindeutig nach Namen', () => {
    const selectNode = exampleNodes.find((node) => node.id === 'lightcontroller_test_select_scenario');
    assert.deepEqual(JSON.parse(selectNode.payload), {
        Command: 'SelectScenario',
        ScenarioName: 'Testlicht',
    });
    assert.deepEqual(selectNode.wires, [['lightcontrollerkitchen']]);
});

test('Function-Node und wartbare Wrapperdatei sind synchron', () => {
    const functionNode = exampleNodes.find((node) => node.id === 'lightcontrollerkitchen');
    assert.equal(functionNode.func, functionSource);
    assert.match(functionSource, /flow\.set\(CONFIGURATION_KEY, configuration\)/);
});

test('Function-Wrapper persistiert ein benanntes Szenario im Flow-Kontext', () => {
    const flow = storage();
    const execution = runWrapper({ payload: {
        Command: 'SaveScenario',
        ScenarioName: 'Dinner',
        ScenarioProperties: { 1: 50, 2: 100, 6: 70 },
    } }, { flow });
    const persisted = execution.flow.get('LightControllerKitchenConfiguration').scenarios
        .find((scenario) => scenario.name === 'Dinner');
    assert.deepEqual(persisted.outputs, [0.5, 1, 0, 0, 0, 0.7]);
    assert.equal(execution.result.payload.LedStatusText, '1=On[50%], 2=On[100%], 3=Off, 4=Off, 5=Off, 6=On[70%]');
});

test('Neue Function-Instanz liest persistierte Szenarien wieder ein', () => {
    const flow = storage();
    runWrapper({ payload: {
        Command: 'SaveScenario',
        ScenarioName: 'Nacht',
        ScenarioProperties: { 6: 20 },
    } }, { flow });
    const execution = runWrapper({ payload: { Command: 'ListScenarios' } }, { flow });
    assert.ok(execution.result.payload.ScenarioList.some(
        (scenario) => scenario.ScenarioName === 'Nacht' && scenario.ScenarioProperties['6'] === 20,
    ));
});

test('Function-Wrapper persistiert den Ein-Aus-Zustand eines ausgewählten Szenarios', () => {
    const flow = storage();
    const context = storage();
    runWrapper({ payload: {
        Command: 'SaveScenario', ScenarioName: 'Dinner', ScenarioProperties: { 1: 50, 2: 100 },
    } }, { flow, context });
    runWrapper({ payload: { Command: 'SelectScenario', ScenarioName: 'Dinner' } }, { flow, context });
    runWrapper({ payload: { ButtonPressed: true, NowMs: 0 } }, { flow, context });
    runWrapper({ payload: { ButtonPressed: false, NowMs: 100 } }, { flow, context });
    const switchedOff = runWrapper({ payload: {
        Command: 'FlushPendingClick', NowMs: 600,
    } }, { flow, context });
    assert.equal(switchedOff.result.payload.Event, 'scenario_toggled_off');
    assert.equal(flow.get('LightControllerKitchenConfiguration').runtimeState.modeOutputEnabled, false);
    const afterRestart = runWrapper({ payload: {} }, { flow, context: storage() });
    assert.equal(afterRestart.result.payload.OperatingMode, 'scenario');
    assert.equal(afterRestart.result.payload.ScenarioName, 'Dinner');
    assert.deepEqual(afterRestart.result.payload.LedOutput, [0, 0, 0, 0, 0, 0]);
});

test('Function-Wrapper enthält Timer und 500-ms-Doppelklickaktion', () => {
    assert.match(functionSource, /doubleClickTimeMs: 500/);
    assert.match(functionSource, /doubleAction: "next-scenario"/);
    assert.match(functionSource, /Command: "FlushPendingClick"/);
});

test('Function-Wrapper plant den 4-s-Ultralangdruck und den Commander-Befehl', () => {
    assert.match(functionSource, /ultraHoldTimeMs: 4000/);
    assert.match(functionSource, /ultraLongAction: "all-off-command"/);
    assert.match(functionSource, /Command: "FlushUltraLongPress"/);
    const controller = new controllerModule.LightController();
    controller.process({ ButtonPressed: true }, 0);
    const output = controller.process({ Command: 'FlushUltraLongPress' }, 4000);
    assert.equal(output.SendCommand, 'CommandAllLightsOff');
});
