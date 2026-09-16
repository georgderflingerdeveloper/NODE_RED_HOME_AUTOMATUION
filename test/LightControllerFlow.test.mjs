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

test('Function-Wrapper persistiert eine über AddOutput hinzugefügte LED', () => {
    const flow = storage();
    const context = storage();
    const added = runWrapper({ payload: { Command: 'AddOutput' } }, { flow, context });
    assert.equal(added.result.payload.OutputCount, 7);
    assert.equal(flow.get('LightControllerKitchenConfiguration').outputCount, 7);
    const afterRestart = runWrapper({ payload: { Command: 'ListScenarios' } }, {
        flow, context: storage(),
    });
    assert.equal(afterRestart.result.payload.OutputCount, 7);
    assert.equal(afterRestart.result.payload.LedOutput.length, 7);
});

test('Function-Wrapper erreicht LED 7 aus einer persistierten alten 7-LED-Konfiguration', () => {
    const legacyScenarios = controllerModule.createScenarios(6).map((activeLights, index) => ({
        id: `scenario-${index + 1}`,
        name: `Szenario ${index + 1}`,
        activeLights,
    }));
    legacyScenarios.push({ id: 'led-7', name: 'LED 7', activeLights: [6] });
    const flow = storage(new Map([['LightControllerKitchenConfiguration', {
        instanceName: 'Kitchen', inputCount: 1, outputCount: 7, scenarios: legacyScenarios,
    }]]));
    const context = storage();
    let result;
    for (let index = 0; index < 7; index += 1) {
        const start = index * 1000;
        runWrapper({ payload: { ButtonPressed: true, NowMs: start } }, { flow, context });
        runWrapper({ payload: { ButtonPressed: false, NowMs: start + 100 } }, { flow, context });
        result = runWrapper({ payload: { Command: 'FlushPendingClick', NowMs: start + 600 } }, {
            flow, context,
        }).result;
    }
    assert.equal(result.payload.OutputCount, 7);
    assert.equal(result.payload.ScenarioIndex, 6);
    assert.deepEqual(result.payload.ActiveLights, [6]);
});

test('Function-Wrapper persistiert RemoveOutput und behält eine funktionsfähige Grundfolge', () => {
    const flow = storage();
    const context = storage();
    runWrapper({ payload: { Command: 'SetOutputCount', OutputCount: 8 } }, { flow, context });
    const removed = runWrapper({ payload: { Command: 'RemoveOutput' } }, { flow, context });
    assert.equal(removed.result.payload.OutputCount, 7);
    assert.equal(flow.get('LightControllerKitchenConfiguration').outputCount, 7);
    const restarted = runWrapper({ payload: { Command: 'ListScenarios' } }, {
        flow, context: storage(),
    });
    assert.equal(restarted.result.payload.OutputCount, 7);
    assert.equal(restarted.result.payload.ScenarioCount, 13);
});

test('Function-Wrapper kann nach ClearAllScenarios weiterhin alle sieben LEDs durchschalten', () => {
    const flow = storage();
    const context = storage();
    runWrapper({ payload: { Command: 'SetOutputCount', OutputCount: 7 } }, { flow, context });
    runWrapper({ payload: {
        Command: 'AddScenario', ScenarioName: 'Eigene Szene', ScenarioProperties: { 7: 30 },
    } }, { flow, context });
    const cleared = runWrapper({ payload: { Command: 'ClearAllScenarios' } }, { flow, context });
    assert.equal(cleared.result.payload.ScenarioCount, 13);
    let result;
    for (let index = 0; index < 7; index += 1) {
        const start = index * 1000;
        runWrapper({ payload: { ButtonPressed: true, NowMs: start } }, { flow, context });
        runWrapper({ payload: { ButtonPressed: false, NowMs: start + 100 } }, { flow, context });
        result = runWrapper({ payload: { Command: 'FlushPendingClick', NowMs: start + 600 } }, {
            flow, context,
        }).result;
    }
    assert.deepEqual(result.payload.ActiveLights, [6]);
});

test('Function-Wrapper hält eine Gruppe erst per Langdruck und setzt danach die Folge fort', () => {
    const flow = storage();
    const context = storage();
    runWrapper({ payload: { Command: 'SetOutputCount', OutputCount: 7 } }, { flow, context });

    let result;
    for (let index = 0; index < 8; index += 1) {
        const start = index * 1000;
        runWrapper({ payload: { ButtonPressed: true, NowMs: start } }, { flow, context });
        runWrapper({ payload: { ButtonPressed: false, NowMs: start + 100 } }, { flow, context });
        result = runWrapper({ payload: { Command: 'FlushPendingClick', NowMs: start + 600 } }, {
            flow, context,
        }).result;
    }
    assert.deepEqual(result.payload.ActiveLights, [0, 1]);
    assert.equal(result.payload.OperatingMode, 'normal');

    runWrapper({ payload: { ButtonPressed: true, NowMs: 9000 } }, { flow, context });
    result = runWrapper({ payload: { ButtonPressed: false, NowMs: 11100 } }, {
        flow, context,
    }).result;
    assert.equal(result.payload.Event, 'scenario_mode_entered');
    assert.equal(result.payload.OperatingMode, 'scenario');

    runWrapper({ payload: { ButtonPressed: true, NowMs: 12000 } }, { flow, context });
    runWrapper({ payload: { ButtonPressed: false, NowMs: 12100 } }, { flow, context });
    result = runWrapper({ payload: { Command: 'FlushPendingClick', NowMs: 12600 } }, {
        flow, context,
    }).result;
    assert.deepEqual(result.payload.LedOutput, [0, 0, 0, 0, 0, 0, 0]);

    runWrapper({ payload: { ButtonPressed: true, NowMs: 13000 } }, { flow, context });
    result = runWrapper({ payload: { ButtonPressed: false, NowMs: 15100 } }, {
        flow, context,
    }).result;
    assert.equal(result.payload.Event, 'scenario_mode_exited');
    assert.equal(result.payload.OperatingMode, 'normal');

    runWrapper({ payload: { ButtonPressed: true, NowMs: 16000 } }, { flow, context });
    runWrapper({ payload: { ButtonPressed: false, NowMs: 16100 } }, { flow, context });
    result = runWrapper({ payload: { Command: 'FlushPendingClick', NowMs: 16600 } }, {
        flow, context,
    }).result;
    assert.deepEqual(result.payload.ActiveLights, [0, 1, 2]);
});

test('Unbekanntes externes Szenario blockiert auch im Function-Wrapper keinen Taster', () => {
    const flow = storage();
    const context = storage();
    const rejected = runWrapper({ payload: {
        Command: 'SelectScenario', ScenarioName: 'Nicht vorhanden',
    } }, { flow, context });
    assert.equal(rejected.result.payload.Event, 'scenario_not_found');
    assert.equal(rejected.errors.length, 0);

    runWrapper({ payload: { ButtonPressed: true, NowMs: 0 } }, { flow, context });
    runWrapper({ payload: { ButtonPressed: false, NowMs: 100 } }, { flow, context });
    const result = runWrapper({ payload: { Command: 'FlushPendingClick', NowMs: 600 } }, {
        flow, context,
    }).result;
    assert.deepEqual(result.payload.ActiveLights, [0]);
    assert.equal(result.payload.OperatingMode, 'normal');
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
