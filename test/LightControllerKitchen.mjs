/**
 * LightControllerKitchen.mjs
 *
 * 50 verständliche Unit-Tests für LightControllerKitchen.js
 *
 * Testframework:
 *   - Node.js eingebautes Modul "node:test"
 *   - keine zusätzliche npm-Abhängigkeit nötig
 *
 * Standardpfad der zu testenden Datei:
 *   ~/Dokumente/HomeAutomation/lib/functions/generated/LightControllerKitchen.js
 *
 * Optional kann ein anderer Pfad verwendet werden:
 *   LIGHT_CONTROLLER_FILE=/anderer/pfad/LightControllerKitchen.js node --test LightControllerKitchen.mjs
 *
 * Start:
 *   node --test LightControllerKitchen.mjs
 *
 * Warum die Hilfsfunktionen?
 *   Die Tests sollen auch später für Menschen leicht erweiterbar bleiben.
 *   Darum kapseln shortPress(), pressButton(), releaseButton() und
 *   holdButton() die immer gleichen Tastensequenzen.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

const controllerFile =
    process.env.LIGHT_CONTROLLER_FILE ||
    join(
        homedir(),
        'Dokumente',
        'HomeAutomation',
        'lib',
        'functions',
        'generated',
        'LightControllerKitchen.js'
    );

const {
    LightControllerKitchen,
    createScenarios,
    normalizeDutyCyclePercent,
    LIGHT_COUNT,
    DEFAULT_HOLD_TIME_MS
} = require(controllerFile);

/* -------------------------------------------------------------------------- */
/* Hilfsfunktionen                                                            */
/* -------------------------------------------------------------------------- */

function newController(options = {}) {
    return new LightControllerKitchen(options);
}

function pressButton(controller, timeMs, dutyCycle = 100) {
    return controller.process(
        {
            ButtonPressed: true,
            DutyCycle: dutyCycle
        },
        timeMs
    );
}

function releaseButton(controller, timeMs, dutyCycle = 100) {
    return controller.process(
        {
            ButtonPressed: false,
            DutyCycle: dutyCycle
        },
        timeMs
    );
}

function shortPress(
    controller,
    startTimeMs = 0,
    dutyCycle = 100,
    durationMs = 100
) {
    pressButton(controller, startTimeMs, dutyCycle);

    return releaseButton(
        controller,
        startTimeMs + durationMs,
        dutyCycle
    );
}

function holdButton(
    controller,
    startTimeMs = 0,
    dutyCycle = 100,
    durationMs = DEFAULT_HOLD_TIME_MS
) {
    pressButton(controller, startTimeMs, dutyCycle);

    return pressButton(
        controller,
        startTimeMs + durationMs,
        dutyCycle
    );
}

function performShortPresses(
    controller,
    count,
    dutyCycle = 100,
    startTimeMs = 0
) {
    let result = controller.getOutput();

    for (let i = 0; i < count; i += 1) {
        const pressStart = startTimeMs + i * 500;
        result = shortPress(
            controller,
            pressStart,
            dutyCycle,
            100
        );
    }

    return result;
}

function expectedLedOutput(activeLights, dutyPercent, lightCount = 6) {
    const result = Array(lightCount).fill(0);
    const normalized = dutyPercent / 100;

    for (const index of activeLights) {
        result[index] = normalized;
    }

    return result;
}

/* -------------------------------------------------------------------------- */
/* 01-08: Konstanten, Normalisierung und Szenario-Erzeugung                   */
/* -------------------------------------------------------------------------- */

test('01 - LIGHT_COUNT ist standardmäßig 6', () => {
    assert.equal(LIGHT_COUNT, 6);
});

test('02 - DEFAULT_HOLD_TIME_MS ist 2000 ms', () => {
    assert.equal(DEFAULT_HOLD_TIME_MS, 2000);
});

test('03 - createScenarios() erzeugt 11 Standardszenarien', () => {
    const scenarios = createScenarios();

    assert.equal(scenarios.length, 11);
});

test('04 - die ersten 6 Szenarien enthalten jeweils genau ein Licht', () => {
    const scenarios = createScenarios();

    assert.deepEqual(
        scenarios.slice(0, 6),
        [[0], [1], [2], [3], [4], [5]]
    );
});

test('05 - nach den Einzellampen werden Lichter schrittweise addiert', () => {
    const scenarios = createScenarios();

    assert.deepEqual(
        scenarios.slice(6),
        [
            [0, 1],
            [0, 1, 2],
            [0, 1, 2, 3],
            [0, 1, 2, 3, 4],
            [0, 1, 2, 3, 4, 5]
        ]
    );
});

test('06 - createScenarios(3) funktioniert auch mit anderer Lichtanzahl', () => {
    assert.deepEqual(
        createScenarios(3),
        [
            [0],
            [1],
            [2],
            [0, 1],
            [0, 1, 2]
        ]
    );
});

test('07 - ungültiger DutyCycle wird auf 100 Prozent gesetzt', () => {
    assert.equal(normalizeDutyCyclePercent(undefined), 100);
    assert.equal(normalizeDutyCyclePercent('abc'), 100);
    assert.equal(normalizeDutyCyclePercent(NaN), 100);
});

test('08 - DutyCycle wird auf den Bereich 0 bis 100 begrenzt', () => {
    assert.equal(normalizeDutyCyclePercent(-20), 0);
    assert.equal(normalizeDutyCyclePercent(0), 0);
    assert.equal(normalizeDutyCyclePercent('25'), 25);
    assert.equal(normalizeDutyCyclePercent(100), 100);
    assert.equal(normalizeDutyCyclePercent(180), 100);
});

/* -------------------------------------------------------------------------- */
/* 09-15: Konstruktor und Startzustand                                        */
/* -------------------------------------------------------------------------- */

test('09 - neuer Controller startet mit SzenarioIndex -1', () => {
    const controller = newController();

    assert.equal(controller.scenarioIndex, -1);
});

test('10 - neuer Controller hat keine aktiven Lichter', () => {
    const controller = newController();

    assert.deepEqual(controller.getActiveLights(), []);
});

test('11 - neuer Controller gibt sechs ausgeschaltete Ausgänge aus', () => {
    const controller = newController();

    assert.deepEqual(
        controller.getLedOutput(),
        [0, 0, 0, 0, 0, 0]
    );
});

test('12 - lightCount kann auf 4 geändert werden', () => {
    const controller = newController({ lightCount: 4 });

    assert.equal(controller.lightCount, 4);
    assert.equal(controller.getLedOutput().length, 4);
    assert.equal(controller.scenarios.length, 7);
});

test('13 - lightCount kleiner als 1 wird auf 1 begrenzt', () => {
    const controller = newController({ lightCount: 0 });

    assert.equal(controller.lightCount, 1);
    assert.deepEqual(controller.scenarios, [[0]]);
});

test('14 - holdTimeMs kann konfiguriert werden', () => {
    const controller = newController({ holdTimeMs: 3500 });

    assert.equal(controller.holdTimeMs, 3500);
});

test('15 - holdTimeMs kleiner als 1 wird auf 1 ms begrenzt', () => {
    const controller = newController({ holdTimeMs: 0 });

    assert.equal(controller.holdTimeMs, 1);
});

/* -------------------------------------------------------------------------- */
/* 16-21: Tasterflanken und Ereignisse                                        */
/* -------------------------------------------------------------------------- */

test('16 - steigende Flanke liefert Event button_pressed', () => {
    const controller = newController();
    const result = pressButton(controller, 1000, 60);

    assert.equal(result.Event, 'button_pressed');
    assert.equal(result.ButtonPressed, true);
    assert.equal(result.ScenarioIndex, -1);
});

test('17 - gehaltene Taste unter 2 Sekunden schaltet noch nicht weiter', () => {
    const controller = newController();

    pressButton(controller, 1000, 60);
    const result = pressButton(controller, 2999, 60);

    assert.equal(result.Event, 'none');
    assert.equal(result.ScenarioIndex, -1);
    assert.equal(result.ScenarioSaved, false);
});

test('18 - kurze fallende Flanke wechselt zum nächsten Szenario', () => {
    const controller = newController();

    pressButton(controller, 1000, 70);
    const result = releaseButton(controller, 1100, 70);

    assert.equal(result.Event, 'scenario_changed');
    assert.equal(result.ScenarioIndex, 0);
    assert.deepEqual(result.ActiveLights, [0]);
});

test('19 - nur der boolesche Wert true gilt als gedrückte Taste', () => {
    const controller = newController();

    const result = controller.process(
        {
            ButtonPressed: 1,
            DutyCycle: 100
        },
        1000
    );

    assert.equal(result.ButtonPressed, false);
    assert.equal(result.Event, 'none');
});

test('20 - wiederholtes false erzeugt keinen Szenariowechsel', () => {
    const controller = newController();

    const first = releaseButton(controller, 1000, 100);
    const second = releaseButton(controller, 1100, 100);

    assert.equal(first.ScenarioIndex, -1);
    assert.equal(second.ScenarioIndex, -1);
    assert.equal(second.Event, 'none');
});

test('21 - Loslassen nach 1999 ms ist noch ein kurzer Tastendruck', () => {
    const controller = newController();

    pressButton(controller, 1000, 100);
    const result = releaseButton(controller, 2999, 100);

    assert.equal(result.Event, 'scenario_changed');
    assert.equal(result.ScenarioIndex, 0);
    assert.equal(result.ScenarioSaved, false);
});

/* -------------------------------------------------------------------------- */
/* 22-32: Die komplette Schaltfolge                                           */
/* -------------------------------------------------------------------------- */

const scenarioSequence = [
    [0],
    [1],
    [2],
    [3],
    [4],
    [5],
    [0, 1],
    [0, 1, 2],
    [0, 1, 2, 3],
    [0, 1, 2, 3, 4],
    [0, 1, 2, 3, 4, 5]
];

scenarioSequence.forEach((expectedLights, index) => {
    const testNumber = 22 + index;
    const pressCount = index + 1;

    test(
        `${testNumber} - nach ${pressCount} kurzem Tastendruck/Tastendrücken ist Szenario ${index} aktiv`,
        () => {
            const controller = newController();
            const result = performShortPresses(
                controller,
                pressCount,
                100
            );

            assert.equal(result.ScenarioIndex, index);
            assert.deepEqual(
                result.ActiveLights,
                expectedLights
            );
            assert.deepEqual(
                result.LedOutput,
                expectedLedOutput(
                    expectedLights,
                    100
                )
            );
        }
    );
});

/* -------------------------------------------------------------------------- */
/* 33-42: Wrap-around und DutyCycle                                           */
/* -------------------------------------------------------------------------- */

test('33 - nach dem letzten Szenario beginnt die Sequenz wieder bei Licht 0', () => {
    const controller = newController();

    const result = performShortPresses(controller, 12, 100);

    assert.equal(result.ScenarioIndex, 0);
    assert.deepEqual(result.ActiveLights, [0]);
});

test('34 - beim Wechsel von Licht 0 auf Licht 1 wird Licht 0 ausgeschaltet', () => {
    const controller = newController();

    const first = performShortPresses(controller, 1, 100);
    const second = performShortPresses(controller, 1, 100, 1000);

    assert.deepEqual(first.LedOutput, [1, 0, 0, 0, 0, 0]);
    assert.deepEqual(second.LedOutput, [0, 1, 0, 0, 0, 0]);
});

test('35 - erst nach allen sechs Einzellampen beginnt das Zuschalten', () => {
    const controller = newController();

    const sixth = performShortPresses(controller, 6, 100);
    const seventh = performShortPresses(controller, 1, 100, 4000);

    assert.deepEqual(sixth.ActiveLights, [5]);
    assert.deepEqual(seventh.ActiveLights, [0, 1]);
});

test('36 - im letzten Szenario sind alle sechs Lichter aktiv', () => {
    const controller = newController();

    const result = performShortPresses(controller, 11, 100);

    assert.deepEqual(result.ActiveLights, [0, 1, 2, 3, 4, 5]);
    assert.deepEqual(result.LedOutput, [1, 1, 1, 1, 1, 1]);
});

test('37 - DutyCycle 50 Prozent wird als 0.5 am aktiven Ausgang ausgegeben', () => {
    const controller = newController();

    const result = shortPress(controller, 0, 50);

    assert.deepEqual(result.LedOutput, [0.5, 0, 0, 0, 0, 0]);
});

test('38 - DutyCycle kann ohne Szenariowechsel aktualisiert werden', () => {
    const controller = newController();

    shortPress(controller, 0, 100);

    const result = controller.process(
        {
            ButtonPressed: false,
            DutyCycle: 25
        },
        1000
    );

    assert.equal(result.ScenarioIndex, 0);
    assert.equal(result.Event, 'none');
    assert.deepEqual(result.LedOutput, [0.25, 0, 0, 0, 0, 0]);
});

test('39 - DutyCycle 0 lässt ein aktives Szenario elektrisch aus', () => {
    const controller = newController();

    const result = shortPress(controller, 0, 0);

    assert.deepEqual(result.ActiveLights, [0]);
    assert.deepEqual(result.LedOutput, [0, 0, 0, 0, 0, 0]);
});

test('40 - DutyCycle über 100 wird auf 100 Prozent begrenzt', () => {
    const controller = newController();

    const result = shortPress(controller, 0, 150);

    assert.equal(result.DutyCycle, 100);
    assert.deepEqual(result.LedOutput, [1, 0, 0, 0, 0, 0]);
});

test('41 - negativer DutyCycle wird auf 0 Prozent begrenzt', () => {
    const controller = newController();

    const result = shortPress(controller, 0, -10);

    assert.equal(result.DutyCycle, 0);
    assert.deepEqual(result.LedOutput, [0, 0, 0, 0, 0, 0]);
});

test('42 - nicht numerischer DutyCycle fällt sicher auf 100 Prozent zurück', () => {
    const controller = newController();

    const result = shortPress(controller, 0, 'ungueltig');

    assert.equal(result.DutyCycle, 100);
    assert.deepEqual(result.LedOutput, [1, 0, 0, 0, 0, 0]);
});

/* -------------------------------------------------------------------------- */
/* 43-47: Langer Tastendruck und Speichern                                    */
/* -------------------------------------------------------------------------- */

test('43 - nach 2 Sekunden Halten wird das aktuelle Szenario gespeichert', () => {
    const controller = newController();

    shortPress(controller, 0, 60);

    const result = holdButton(
        controller,
        1000,
        60,
        2000
    );

    assert.equal(result.Event, 'scenario_saved');
    assert.equal(result.ScenarioSaved, true);
    assert.equal(result.SavedScenario.scenarioIndex, 0);
    assert.deepEqual(result.SavedScenario.activeLights, [0]);
    assert.deepEqual(result.SavedScenario.ledOutput, [0.6, 0, 0, 0, 0, 0]);
});

test('44 - langer Tastendruck verändert den ScenarioIndex nicht', () => {
    const controller = newController();

    performShortPresses(controller, 4, 75);

    const before = controller.scenarioIndex;

    holdButton(controller, 5000, 75, 2000);

    assert.equal(controller.scenarioIndex, before);
});

test('45 - Loslassen nach bereits erkanntem Langdruck speichert nicht doppelt', () => {
    const controller = newController();

    shortPress(controller, 0, 80);

    holdButton(controller, 1000, 80, 2000);

    const savedAtBefore =
        controller.savedScenario.savedAt;

    const result = releaseButton(controller, 3100, 80);

    assert.equal(result.Event, 'button_released_after_save');
    assert.equal(result.ScenarioSaved, false);
    assert.equal(
        result.SavedScenario.savedAt,
        savedAtBefore
    );
});

test('46 - ausgegebene SavedScenario-Arrays sind Kopien und schützen den internen Zustand', () => {
    const controller = newController();

    shortPress(controller, 0, 50);
    holdButton(controller, 1000, 50, 2000);

    const output = controller.getOutput();

    output.SavedScenario.activeLights.push(5);
    output.SavedScenario.ledOutput[0] = 999;

    const freshOutput = controller.getOutput();

    assert.deepEqual(
        freshOutput.SavedScenario.activeLights,
        [0]
    );

    assert.deepEqual(
        freshOutput.SavedScenario.ledOutput,
        [0.5, 0, 0, 0, 0, 0]
    );
});

test('47 - genau 2000 ms und direktes Loslassen speichert das Szenario', () => {
    const controller = newController();

    shortPress(controller, 0, 100);

    pressButton(controller, 1000, 100);
    const result = releaseButton(controller, 3000, 100);

    assert.equal(result.Event, 'scenario_saved');
    assert.equal(result.ScenarioSaved, true);
    assert.equal(result.ScenarioIndex, 0);
});

/* -------------------------------------------------------------------------- */
/* 48-50: Wiederherstellen, Fehlerfälle und Reset                             */
/* -------------------------------------------------------------------------- */

test('48 - restoreScenario stellt Szenario und DutyCycle wieder her', () => {
    const controller = newController();

    const result = controller.restoreScenario({
        scenarioIndex: 7,
        dutyCyclePercent: 40,
        savedAt: '2026-09-11T19:00:00.000Z'
    });

    assert.equal(result.Event, 'scenario_restored');
    assert.equal(result.ScenarioIndex, 7);
    assert.equal(result.DutyCycle, 40);
    assert.deepEqual(result.ActiveLights, [0, 1, 2]);
    assert.deepEqual(
        result.LedOutput,
        [0.4, 0.4, 0.4, 0, 0, 0]
    );
    assert.equal(
        result.SavedScenario.savedAt,
        '2026-09-11T19:00:00.000Z'
    );
});

test('49 - restoreScenario weist ungültige Szenarioindizes sauber zurück', () => {
    const controller = newController();

    assert.throws(
        () => controller.restoreScenario(null),
        TypeError
    );

    assert.throws(
        () => controller.restoreScenario({
            scenarioIndex: '1'
        }),
        TypeError
    );

    assert.throws(
        () => controller.restoreScenario({
            scenarioIndex: -2
        }),
        RangeError
    );

    assert.throws(
        () => controller.restoreScenario({
            scenarioIndex: 11
        }),
        RangeError
    );
});

test('50 - reset stellt den vollständigen Startzustand wieder her', () => {
    const controller = newController();

    performShortPresses(controller, 5, 35);
    holdButton(controller, 5000, 35, 2000);

    const result = controller.reset();

    assert.equal(result.Event, 'reset');
    assert.equal(result.ScenarioIndex, -1);
    assert.equal(result.ButtonPressed, false);
    assert.equal(result.DutyCycle, 100);
    assert.equal(result.ScenarioSaved, false);
    assert.equal(result.SavedScenario, null);
    assert.deepEqual(result.ActiveLights, []);
    assert.deepEqual(result.LedOutput, [0, 0, 0, 0, 0, 0]);
});
