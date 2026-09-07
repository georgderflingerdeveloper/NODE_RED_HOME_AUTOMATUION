import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const registerVaultNode = require("../nodes/home-automation-credential-vault.js");

function runtimeFixture() {
  const userDir = mkdtempSync(join(tmpdir(), "home-automation-node-"));
  let Constructor;
  const RED = {
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
  async function input(topic, payload = {}) {
    return new Promise((resolve) => {
      const sent = [];
      node.emit("input", { topic, payload }, (value) => sent.push(value), () => resolve(sent));
    });
  }
  return { userDir, node, input, dispose: () => rmSync(userDir, { recursive: true, force: true }) };
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
