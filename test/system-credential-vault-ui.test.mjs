import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture() {
  const html = readFileSync(new URL('../flow-src/flows/system--system_dashboard_flow/templates/verschlusselte-system-zugangsdaten.html', import.meta.url), 'utf8');
  const timers = new Map();
  const sent = [];
  let watch, destroy, next = 0;
  const scope = { send: msg => sent.push(msg), $watch: (_key, fn) => { watch = fn; }, $on: (_event, fn) => { destroy = fn; }, $applyAsync() {} };
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], {
    scope, angular: { extend: Object.assign, copy: structuredClone }, window: { confirm: () => true },
    setTimeout: (fn, ms) => { timers.set(++next, { fn, ms }); return next; },
    clearTimeout: id => timers.delete(id), setInterval: () => ++next, clearInterval() {},
  });
  return { scope, sent, timers, update: payload => watch({ topic: 'system/vault/state', payload }), destroy: () => destroy() };
}

test('Zugangsliste fordert Passwort an, zeigt Daten kurzzeitig und behält keine Klartextantwort', () => {
  const f = fixture();
  f.scope.showAccessList();
  assert.equal(f.scope.showListPassword, true);
  f.scope.vaultInput.listMaster = 'Mein Master 2026!';
  f.scope.loadAccessList();
  assert.equal(f.sent.at(-1).topic, 'system/vault/reveal-list');
  assert.equal(f.sent.at(-1).payload.masterPassword, 'Mein Master 2026!');
  assert.equal(f.scope.vaultInput.listMaster, '');
  const payload = { initialized: true, locked: false, entries: [{ id: 'piwest' }], revealed: { id: 'piwest', password: 'privat' } };
  f.update(payload);
  assert.equal(f.scope.revealed.password, 'privat');
  assert.equal(f.scope.vault.revealed, undefined);
  assert.equal(payload.revealed, undefined);
  [...f.timers.values()].find(t => t.ms === 15000).fn();
  assert.equal(f.scope.revealed, null);
});

test('Sperre, Fehler und Verlassen der Ansicht entfernen angezeigte Passwörter', () => {
  for (const action of ['lock', 'error', 'destroy']) {
    const f = fixture();
    f.update({ locked: false, revealed: { id: 'piwest', password: 'privat' } });
    if (action === 'destroy') f.destroy();
    else f.update(action === 'lock' ? { locked: true, entries: [] } : { locked: false, error: 'Falsches Passwort' });
    assert.equal(f.scope.revealed, null);
  }
});


test('Unsicheres HTTP außerhalb von localhost überträgt kein Master-Passwort', () => {
  // Die Browserprüfung wird zusätzlich zu den serverseitigen Sitzungsregeln geprüft.
  const html = readFileSync(new URL('../flow-src/flows/system--system_dashboard_flow/templates/verschlusselte-system-zugangsdaten.html', import.meta.url), 'utf8');
  const sent = [];
  const scope = { send: m => sent.push(m), $watch() {}, $on() {}, $applyAsync() {} };
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], {
    scope, window: { isSecureContext: false }, angular: { extend: Object.assign },
    setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {},
  });
  scope.vaultInput.listMaster = 'Mein Master 2026!';
  scope.loadAccessList();
  assert.equal(sent.length, 0);
  assert.match(scope.vault.error, /HTTPS/);
});

test('Bekannte Systeme erhalten das Passwort nur nach einer bewussten Eingabe', () => {
  const f = fixture();
  f.scope.importKnown();
  assert.equal(f.sent.length, 0);
  assert.match(f.scope.vault.error, /Standardpasswort fehlt/);
  f.scope.vaultInput.knownPassword = 'vorhandenes Passwort';
  f.scope.importKnown();
  assert.equal(f.sent.at(-1).topic, 'system/vault/import-known');
  assert.equal(f.sent.at(-1).payload.password, 'vorhandenes Passwort');
  assert.equal(f.scope.vaultInput.knownPassword, '');
});
