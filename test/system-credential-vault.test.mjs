import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import test from "node:test";

const require = createRequire(import.meta.url);
const { CredentialVault, privateIpv4 } = require("../nodes/home-automation-credential-vault-core.cjs");

function fixture(options = {}) {
  const directory = mkdtempSync(join(tmpdir(), "home-automation-vault-"));
  const file = join(directory, "system-credentials.vault.json");
  const vault = new CredentialVault(file, options);
  return { directory, file, vault, dispose: () => rmSync(directory, { recursive: true, force: true }) };
}

test("Tresor speichert weder Master-Passwort noch SSH-Passwort im Klartext", (t) => {
  const item = fixture(); t.after(item.dispose);
  item.vault.initialize("Mein Master 2026!", "Welcher Satz ist nur mir bekannt?", "Nur ich kenne diesen langen Satz");
  item.vault.upsert({ name: "PICENTER2", ip: "192.168.0.150", user: "pi", password: "Geheimes Pi Passwort" });

  const stored = readFileSync(item.file, "utf8");
  assert.equal(stored.includes("Mein Master 2026!"), false);
  assert.equal(stored.includes("Geheimes Pi Passwort"), false);
  assert.equal(stored.includes("Nur ich kenne diesen langen Satz"), false);
  assert.equal(statSync(item.file).mode & 0o777, 0o600);
  assert.deepEqual(item.vault.list().map((entry) => entry.ip), ["192.168.0.150"]);
});

test("Master-Passwort entsperrt den Tresor und falsches Passwort nicht", (t) => {
  const item = fixture(); t.after(item.dispose);
  item.vault.initialize("Mein Master 2026!", "Meine private Frage?", "Meine sehr lange private Antwort");
  item.vault.upsert({ name: "pieast", ip: "192.168.0.104", user: "pi", password: "alt" });
  item.vault.lock();
  assert.throws(() => item.vault.unlock("falsch"), /Master-Passwort ist falsch/);
  item.vault.unlock("Mein Master 2026!");
  assert.equal(item.vault.reveal("192.168.0.104").password, "alt");
});

test("Leeres Passwort beim Bearbeiten lässt den bestehenden Zugang unverändert", (t) => {
  const item = fixture(); t.after(item.dispose);
  item.vault.initialize("Mein Master 2026!", "Meine private Frage?", "Meine sehr lange private Antwort");
  item.vault.upsert({ name: "alt", ip: "192.168.0.104", user: "pi", password: "bestehend" });
  item.vault.upsert({ id: "192.168.0.104", name: "neu", ip: "192.168.0.104", user: "georg", password: "" });
  const updated = item.vault.reveal("192.168.0.104");
  assert.equal(updated.name, "neu");
  assert.equal(updated.user, "georg");
  assert.equal(updated.password, "bestehend");
});

test("Private Sicherheitsfrage setzt nach richtiger Antwort ein neues Master-Passwort", (t) => {
  const item = fixture(); t.after(item.dispose);
  item.vault.initialize("Altes Master 2026!", "Wie lautet mein privater Satz?", "Antwort die sonst niemand kennt");
  item.vault.upsert({ name: "pientry", ip: "192.168.0.190", user: "pi", password: "unverändert" });
  item.vault.lock();
  assert.throws(() => item.vault.recover("falsch", "Neues Master 2027!"), /Private Antwort ist falsch/);
  item.vault.recover("Antwort die sonst niemand kennt", "Neues Master 2027!");
  item.vault.lock();
  assert.throws(() => item.vault.unlock("Altes Master 2026!"), /Master-Passwort ist falsch/);
  item.vault.unlock("Neues Master 2027!");
  assert.equal(item.vault.reveal("192.168.0.190").password, "unverändert");
});

test("Tresor sperrt sich nach Ablauf der konfigurierten Zeit", (t) => {
  let now = 1_000;
  const item = fixture({ now: () => now, autoLockMs: 60_000 }); t.after(item.dispose);
  item.vault.initialize("Mein Master 2026!", "Meine private Frage?", "Meine sehr lange private Antwort");
  now += 60_001;
  assert.equal(item.vault.status().locked, true);
  assert.throws(() => item.vault.list(), /Tresor ist gesperrt/);
});

test("Nur private IPv4-Adressen werden als Systeme akzeptiert", (t) => {
  const item = fixture(); t.after(item.dispose);
  item.vault.initialize("Mein Master 2026!", "Meine private Frage?", "Meine sehr lange private Antwort");
  assert.equal(privateIpv4("192.168.2.2"), true);
  assert.equal(privateIpv4("172.16.0.2"), true);
  assert.equal(privateIpv4("8.8.8.8"), false);
  assert.throws(() => item.vault.upsert({ ip: "8.8.8.8", user: "pi", password: "x" }), /private IPv4/);
});

test("Tresordatei bleibt auch nach externer Rechteänderung beim nächsten Speichern privat", (t) => {
  const item = fixture(); t.after(item.dispose);
  item.vault.initialize("Mein Master 2026!", "Meine private Frage?", "Meine sehr lange private Antwort");
  chmodSync(item.file, 0o644);
  item.vault.upsert({ name: "piwest", ip: "192.168.0.105", user: "pi", password: "x" });
  assert.equal(statSync(item.file).mode & 0o777, 0o600);
});

test("Automatische SSH-Messung funktioniert gesperrt, ohne Passwort auszugeben", async (t) => {
  let usedPassword = null;
  const fakeSpawn = (_command, _args, options) => {
    usedPassword = options.env.SSH_PASSWORD;
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    process.nextTick(() => {
      child.stdout.emit("data", Buffer.from("HOST=PICENTER2\nTEMP=45.5\nMEM=50/100\nDISK=20/100\nUPTIME=60\nLOAD=0.2\n"));
      child.emit("close", 0);
    });
    return child;
  };
  const item = fixture({ spawn: fakeSpawn }); t.after(item.dispose);
  item.vault.initialize("Mein Master 2026!", "Meine private Frage?", "Meine sehr lange private Antwort");
  item.vault.upsert({ name: "PICENTER2", ip: "192.168.0.150", user: "pi", password: "nur-intern" });
  item.vault.lock();

  const result = await item.vault.probeAll();
  assert.equal(item.vault.status().locked, true);
  assert.equal(usedPassword, "nur-intern");
  assert.equal(result.devices[0].hostname, "PICENTER2");
  assert.equal(JSON.stringify(result).includes("nur-intern"), false);
  assert.equal(statSync(`${item.file}.key`).mode & 0o777, 0o600);
});
