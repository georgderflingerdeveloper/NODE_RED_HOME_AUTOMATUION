"use strict";

const path = require("node:path");
const { CredentialVault, defaultVaultPath } = require("./home-automation-credential-vault-core.cjs");

const stores = new Map();

function safeVaultPath(userDir, configuredPath) {
  const root = path.resolve(userDir);
  const resolved = configuredPath
    ? path.resolve(root, configuredPath)
    : defaultVaultPath(root);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Tresordatei muss innerhalb des Node-RED-Benutzerordners liegen");
  }
  return resolved;
}

function publicState(store, extra = {}) {
  const status = store.status();
  return {
    ...status,
    entries: status.locked ? [] : store.list(),
    ...extra,
  };
}

module.exports = function registerCredentialVault(RED) {
  function CredentialVaultNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    const filePath = safeVaultPath(RED.settings.userDir, config.vaultPath || "system-credentials.vault.json");
    const autoLockMs = Math.max(1, Number(config.autoLockMinutes || 10)) * 60_000;
    const storeKey = `${filePath}:${autoLockMs}`;
    if (!stores.has(storeKey)) stores.set(storeKey, new CredentialVault(filePath, { autoLockMs }));
    const store = stores.get(storeKey);

    function setNodeStatus() {
      const state = store.status();
      node.status(state.locked
        ? { fill: "grey", shape: "ring", text: state.initialized ? "Tresor gesperrt" : "Tresor einrichten" }
        : { fill: "green", shape: "dot", text: `${state.entryCount} Zugangsdaten · entsperrt` });
    }

    setNodeStatus();
    node.on("input", async (msg, send, done) => {
      const command = String(msg.topic || "system/vault/status");
      const payload = msg.payload && typeof msg.payload === "object" ? msg.payload : {};
      try {
        if (command === "system/vault/probe") {
          const metrics = await store.probeAll();
          send([null, { topic: "system/live/metrics", payload: metrics }]);
        } else {
          let extra = {};
          switch (command) {
            case "system/vault/status": break;
            case "system/vault/setup":
              store.initialize(payload.masterPassword, payload.recoveryQuestion, payload.recoveryAnswer);
              break;
            case "system/vault/unlock": store.unlock(payload.masterPassword); break;
            case "system/vault/lock": store.lock(); break;
            case "system/vault/recover":
              store.recover(payload.recoveryAnswer, payload.newMasterPassword);
              break;
            case "system/vault/save": store.upsert(payload.record); break;
            case "system/vault/delete": store.remove(payload.id); break;
            case "system/vault/reveal": extra.revealed = store.reveal(payload.id); break;
            case "system/vault/change-master": store.changeMaster(payload.newMasterPassword); break;
            case "system/vault/change-recovery":
              store.changeRecovery(payload.recoveryQuestion, payload.recoveryAnswer);
              break;
            default: throw new Error("Unbekannter Tresorbefehl");
          }
          send([{ topic: "system/vault/state", payload: publicState(store, extra) }, null]);
        }
        setNodeStatus();
        done?.();
      } catch (error) {
        setNodeStatus();
        const message = error instanceof Error ? error.message : String(error);
        if (command === "system/vault/probe") {
          send([null, { topic: "system/live/metrics", payload: { source: "encrypted-vault", devices: [], error: message } }]);
        } else {
          send([{ topic: "system/vault/state", payload: { ...publicState(store), error: message } }, null]);
        }
        done?.();
      }
    });

    node.on("close", () => {
      store.lock();
      setNodeStatus();
    });
  }

  RED.nodes.registerType("home-automation-credential-vault", CredentialVaultNode);
};

module.exports._safeVaultPath = safeVaultPath;
