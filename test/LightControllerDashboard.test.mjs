import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const nodes = JSON.parse(fs.readFileSync(
    'flow-src/flows/light-controller--light_controller_flow/nodes.json',
    'utf8',
));
const template = fs.readFileSync(
    'flow-src/flows/light-controller--light_controller_flow/templates/kitchen-light-controller-dashboard.html',
    'utf8',
);
const exampleNodes = JSON.parse(fs.readFileSync('examples/LightController.node-red.json', 'utf8'));

test('Kitchen-Dashboard ist bidirektional mit dem echten LightController verbunden', () => {
    const controller = nodes.find((node) => node.id === 'lightcontrollerkitchen');
    const dashboard = nodes.find((node) => node.id === 'lightcontroller_kitchen_dashboard');
    assert.equal(dashboard.type, 'ui_template');
    assert.equal(dashboard.group, '3dbc8c98.083aa4');
    assert.equal(dashboard.fwdInMessages, false);
    assert.ok(controller.wires[0].includes(dashboard.id));
    assert.deepEqual(dashboard.wires, [[controller.id]]);
});

test('Importierbares Beispiel enthält Dashboard und dieselbe wartbare Vorlage', () => {
    const dashboard = exampleNodes.find((node) => node.id === 'lightcontroller_kitchen_dashboard');
    const controller = exampleNodes.find((node) => node.id === 'lightcontrollerkitchen');
    assert.equal(dashboard.format, template.trimEnd());
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

test('Szenariomenü unterstützt alle persistenten Verwaltungsbefehle', () => {
    for (const command of [
        'SaveScenario', 'AddScenario', 'SelectScenario', 'ListScenarios',
        'DeleteScenario', 'ClearAllScenarios',
    ]) {
        assert.match(template, new RegExp(command));
    }
    assert.match(template, /ScenarioProperties/);
    assert.match(template, /Eindeutiger Szenarioname/);
});

test('Push-Anzeige kennt Kurz-, Doppel-, Lang- und Ultralangdruck', () => {
    assert.match(template, /short_press_pending/);
    assert.match(template, /scenario_double_selected/);
    assert.match(template, /manual_light_mode_entered/);
    assert.match(template, /all_lights_off_command/);
    assert.match(template, /payload\.SendCommand/);
});
