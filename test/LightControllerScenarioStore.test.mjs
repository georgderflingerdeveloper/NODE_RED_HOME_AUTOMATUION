import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { LightControllerScenarioStore, safeInstanceName } = require(
    '../lib/functions/generated/LightControllerScenarioStore.js',
);

function temporaryStore(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'light-controller-store-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    return new LightControllerScenarioStore({ directory });
}

test('Szenariospeicher schreibt und liest eine unabhängige Konfigurationskopie', (t) => {
    const store = temporaryStore(t);
    const configuration = { outputCount: 2, scenarios: [{ name: 'Abend', outputs: [0.5, 1] }] };
    store.save('Kitchen', configuration);
    const loaded = store.load('Kitchen');
    assert.deepEqual(loaded, configuration);
    loaded.scenarios[0].outputs[0] = 0;
    assert.equal(store.load('Kitchen').scenarios[0].outputs[0], 0.5);
});

test('Szenariospeicher schreibt atomar mit privaten Dateirechten', (t) => {
    const store = temporaryStore(t);
    const file = store.save('Kitchen', { scenarios: [] });
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(fs.readdirSync(store.directory).some((name) => name.endsWith('.tmp')), false);
});

test('Instanznamen können den Speicherordner nicht verlassen', () => {
    assert.equal(safeInstanceName('../../Kitchen Licht'), 'Kitchen-Licht');
    assert.throws(() => safeInstanceName('   '), /darf nicht leer sein/);
});

test('Fehlende persistierte Konfiguration liefert null', (t) => {
    const store = temporaryStore(t);
    assert.equal(store.load('Kitchen'), null);
});
