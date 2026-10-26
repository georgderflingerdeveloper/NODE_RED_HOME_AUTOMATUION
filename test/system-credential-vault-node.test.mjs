import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const registerVaultNode = require("../nodes/home-automation-credential-vault.js");

function runtimeFixture({ server } = {}) {
  const userDir = mkdtempSync(join(tmpdir(), "home-automation-node-"));
  let Constructor;
  const RED = {
    server,
    settings: { userDir },
    nodes: {
      createNode(node) {
        const events = new EventEmitter();
        node.on = events.on.bind(events);
        node.emit = events.emit.bind(events);
        node.status = () => {};
      },
      registerType(name, implementation) {
        assert.equal(name, "home-automation-credential-vault");
        Constructor = implementation;
      },
    },
  };
  registerVaultNode(RED);
  const node = new Constructor({ vaultPath: "system-credentials.vault.json", autoLockMinutes: 10 });
  async function input(topic, payload = {}, socketid = "client-a") {
    return new Promise((resolve) => {
      const sent = [];
      node.emit("input", { topic, payload, socketid }, (value) => sent.push(value), () => resolve(sent));
    });
  }
  return { userDir, node, input, dispose: () => { node.emit("close"); rmSync(userDir, { recursive: true, force: true }); } };
}

test("Node-RED-Ausgang enthält Geheimnis nur beim ausdrücklichen Anzeigen", async (t) => {
  const fixture = runtimeFixture(); t.after(fixture.dispose);
  const masterPassword = "Mein Master 2026!";
  const recoveryAnswer = "Meine sehr lange geheime Antwort";

  const setup = await fixture.input("system/vault/setup", {
    masterPassword,
    recoveryQuestion: "Meine private Frage?",
    recoveryAnswer,
  });
  assert.equal(JSON.stringify(setup).includes(masterPassword), false);
  assert.equal(JSON.stringify(setup).includes(recoveryAnswer), false);

  const save = await fixture.input("system/vault/save", {
    record: { name: "PICENTER2", ip: "192.168.0.150", user: "pi", password: "Nur dieses Pi Passwort" },
  });
  assert.equal(JSON.stringify(save).includes("Nur dieses Pi Passwort"), false);

  const reveal = await fixture.input("system/vault/reveal", { id: "192.168.0.150" });
  assert.equal(reveal[0][0].payload.revealed.password, "Nur dieses Pi Passwort");
});

test("Tresorpfad kann nicht aus dem Node-RED-Benutzerordner ausbrechen", () => {
  assert.throws(
    () => registerVaultNode._safeVaultPath("/home/georg/.node-red", "../../etc/passwd"),
    /innerhalb des Node-RED-Benutzerordners/,
  );
});


test("Zugangsliste prüft das Master-Passwort erneut und antwortet nur dem anfragenden Client", async (t) => {
  const fixture = runtimeFixture(); t.after(fixture.dispose);
  const masterPassword = "Mein Master 2026!";
  await fixture.input("system/vault/setup", { masterPassword, recoveryQuestion: "Private Frage?", recoveryAnswer: "Meine sehr lange geheime Antwort" });
  for (const [name, ip] of [["piwest", "192.168.0.105"], ["pientry", "192.168.0.190"]]) {
    await fixture.input("system/vault/save", { record: { name, ip, user: "pi", password: "Nur dieses Pi Passwort" } });
  }
  const wrong = await fixture.input("system/vault/reveal-list", { masterPassword: "falsch" }, "client-a");
  assert.match(wrong[0][0].payload.error, /Master-Passwort ist falsch/);
  assert.equal(JSON.stringify(wrong).includes("Nur dieses Pi Passwort"), false);
  const noClient = await fixture.input("system/vault/reveal-list", { masterPassword }, null);
  assert.match(noClient[0][0].payload.error, /Dashboard-Client/);
  await fixture.input("system/vault/lock");
  const answer = (await fixture.input("system/vault/reveal-list", { masterPassword }, "client-a"))[0][0];
  assert.equal(answer.socketid, "client-a");
  assert.equal(answer.payload.entries.length, 2);
  assert.equal(answer.payload.revealedEntries, undefined);
  assert.equal(JSON.stringify(answer).includes("Nur dieses Pi Passwort"), false);
  assert.equal(JSON.stringify(answer).includes(masterPassword), false);
  const status = (await fixture.input("system/vault/status", {}, "client-b"))[0][0];
  assert.equal(status.socketid, "client-b");
  assert.equal(JSON.stringify(status).includes("Nur dieses Pi Passwort"), false);
});


test("Entsperren eines Browsers erlaubt anderen Browsern keinen Passwortzugriff", async (t) => {
  const f = runtimeFixture(); t.after(f.dispose);
  await f.input("system/vault/setup", { masterPassword: "Mein Master 2026!", recoveryQuestion: "Private Frage?", recoveryAnswer: "Meine sehr lange geheime Antwort" });
  await f.input("system/vault/save", { record: { name: "piwest", ip: "192.168.0.105", user: "pi", password: "nur-fuer-client-a" } });
  const other = (await f.input("system/vault/reveal", { id: "192.168.0.105" }, "client-b"))[0][0];
  assert.equal(other.payload.locked, true);
  assert.match(other.payload.error, /gesperrt/);
  assert.equal(JSON.stringify(other).includes("nur-fuer-client-a"), false);
  const own = (await f.input("system/vault/reveal", { id: "192.168.0.105" }))[0][0];
  assert.equal(own.payload.revealed.password, "nur-fuer-client-a");
});

test("Fehlversuche werden auch über wechselnde Browser-Sitzungen begrenzt", async (t) => {
  const f = runtimeFixture(); t.after(f.dispose);
  await f.input("system/vault/setup", { masterPassword: "Mein Master 2026!", recoveryQuestion: "Private Frage?", recoveryAnswer: "Meine sehr lange geheime Antwort" });
  for (let i = 0; i < 5; i++) await f.input("system/vault/unlock", { masterPassword: "falsch" }, "attacker-" + i);
  const blocked = (await f.input("system/vault/unlock", { masterPassword: "Mein Master 2026!" }, "new-client"))[0][0];
  assert.match(blocked.payload.error, /Zu viele Fehlversuche/);
  assert.ok(blocked.payload.retryAfterSeconds > 0);
});

test("Bekannte Systeme werden ohne erfundene Passwörter übernommen", async (t) => {
  const f = runtimeFixture(); t.after(f.dispose);
  await f.input("system/vault/setup", { masterPassword: "Mein Master 2026!", recoveryQuestion: "Private Frage?", recoveryAnswer: "Meine sehr lange geheime Antwort" });
  const answer = (await f.input("system/vault/import-known", { password: "einheitliches Passwort" }))[0][0];
  assert.deepEqual(answer.payload.entries.map((entry) => entry.ip), ["192.168.0.104", "192.168.0.105", "192.168.0.125", "192.168.0.150", "192.168.0.190"]);
  assert.equal(answer.payload.entries.every((entry) => entry.hasPassword === true), true);
});
