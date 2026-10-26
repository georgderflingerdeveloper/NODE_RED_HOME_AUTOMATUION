"use strict";

const path = require("node:path");
const { CredentialVault, defaultVaultPath } = require("./home-automation-credential-vault-core.cjs");
let dashboardUi;
try { dashboardUi = require("node-red-dashboard/ui"); } catch { dashboardUi = null; }

const rateStates = new Map();
const knownSystems = [
  { name: "pieast", ip: "192.168.0.104", user: "pi" },
  { name: "piwest", ip: "192.168.0.105", user: "pi" },
  { name: "PIANTE_", ip: "192.168.0.125", user: "pi" },
  { name: "PICENTER2", ip: "192.168.0.150", user: "pi" },
  { name: "pientry", ip: "192.168.0.190", user: "pi" },
];

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
    entries: status.locked ? [] : store.list({ touch: false }),
    ...extra,
  };
}

module.exports = function registerCredentialVault(RED) {
  function CredentialVaultNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    const filePath = safeVaultPath(RED.settings.userDir, config.vaultPath || "system-credentials.vault.json");
    const autoLockMs = Math.min(5, Math.max(1, Number(config.autoLockMinutes || 5))) * 60_000;
    const probeStore = new CredentialVault(filePath, { autoLockMs });
    const sessions = new Map();
    const dashboardClients = new Map();
    const dashboard = RED.server && typeof RED.server.listen === "function" ? dashboardUi?.(RED) : null;
    function rememberDashboardClient(socketid, ip) {
      if (dashboardClients.size >= 1024 && !dashboardClients.has(socketid)) return;
      dashboardClients.set(socketid, { ip, seen: Date.now() });
    }
    function forgetDashboardClient(socketid) { dashboardClients.delete(socketid); }
    dashboard?.ev.on("newsocket", rememberDashboardClient);
    dashboard?.ev.on("endsocket", forgetDashboardClient);
    function safeDashboardTransport(socketid) {
      const ip = dashboardClients.get(socketid)?.ip;
      return Boolean(RED.settings.https) || ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
    }
    if (!rateStates.has(filePath)) rateStates.set(filePath, { failures: 0, blockedUntil: 0 });
    const rate = rateStates.get(filePath);
    const authCommands = new Set(["system/vault/unlock", "system/vault/reveal-list", "system/vault/recover"]);
    const writeCommands = new Set(["system/vault/save", "system/vault/delete", "system/vault/import-known", "system/vault/change-master", "system/vault/change-recovery", "system/vault/recover"]);
    const cleanup = setInterval(() => {
      for (const [id, client] of dashboardClients) if (Date.now() - client.seen > 10 * 60_000) dashboardClients.delete(id);
      for (const [id, session] of sessions) {
        if (Date.now() >= session.absoluteUntil) session.store.lock();
        if (session.store.status().locked) sessions.delete(id);
      }
    }, 15000);
    cleanup.unref?.();

    function setNodeStatus(store = probeStore) {
      const state = store.status();
      node.status(state.locked
        ? { fill: "grey", shape: "ring", text: state.initialized ? "Tresor gesperrt" : "Tresor einrichten" }
        : { fill: "green", shape: "dot", text: `${state.entryCount} Zugangsdaten · entsperrt` });
    }

    setNodeStatus();
    node.on("input", async (msg, send, done) => {
      const command = String(msg.topic || "system/vault/status");
      const payload = msg.payload && typeof msg.payload === "object" ? msg.payload : {};
      let store = probeStore;
      try {
        if (command !== "system/vault/probe") {
          if (typeof msg.socketid !== "string" || !msg.socketid.trim()) throw new Error("Tresor benötigt einen anfragenden Dashboard-Client");
          if (dashboard && !["system/vault/status", "system/vault/lock"].includes(command) && !safeDashboardTransport(msg.socketid)) throw new Error("Zugangsdaten nur über HTTPS oder lokal über localhost öffnen");
          let session = sessions.get(msg.socketid);
          if (!session) {
            if (sessions.size >= 128) throw new Error("Zu viele Tresorsitzungen; bitte später erneut versuchen");
            session = { store: new CredentialVault(filePath, { autoLockMs }), absoluteUntil: Date.now() + 10 * 60_000 };
            sessions.set(msg.socketid, session);
          }
          store = session.store;
          if (Date.now() >= session.absoluteUntil) store.lock();
          if (authCommands.has(command) && Date.now() < rate.blockedUntil) throw new Error("Zu viele Fehlversuche; bitte später erneut versuchen");
        }
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
            case "system/vault/import-known":
              for (const record of knownSystems) store.upsert({ ...record, password: payload.password });
              break;
            case "system/vault/reveal": extra.revealed = store.reveal(payload.id); break;
            case "system/vault/reveal-list":
              if (!msg.socketid) throw new Error("Zugangsliste benötigt einen anfragenden Dashboard-Client");
              store.unlock(payload.masterPassword);
              // Liste enthält nur Metadaten; Klartext erst pro einzelnem Zugang.
              break;
            case "system/vault/change-master": store.changeMaster(payload.newMasterPassword); break;
            case "system/vault/change-recovery":
              store.changeRecovery(payload.recoveryQuestion, payload.recoveryAnswer);
              break;
            default: throw new Error("Unbekannter Tresorbefehl");
          }
          if (authCommands.has(command)) {
            rate.failures = 0; rate.blockedUntil = 0;
            sessions.get(msg.socketid).absoluteUntil = Date.now() + 10 * 60_000;
          }
          if (writeCommands.has(command)) {
            for (const [id, session] of sessions) if (id !== msg.socketid) { session.store.lock(); sessions.delete(id); }
          }
          send([{ socketid: msg.socketid, topic: "system/vault/state", payload: publicState(store, { ...extra, retryAfterSeconds: Math.max(store.status().retryAfterSeconds, Math.ceil((rate.blockedUntil - Date.now()) / 1000), 0) }) }, null]);
          if (authCommands.has(command) || command === "system/vault/reveal") node.log?.("Tresor: " + command + " erfolgreich");
        }
        setNodeStatus(store);
        done?.();
      } catch (error) {
        if (authCommands.has(command) && /Master-Passwort ist falsch|Private Antwort ist falsch/.test(String(error.message))) {
          rate.failures += 1;
          if (rate.failures >= 5) { rate.blockedUntil = Date.now() + 30000; rate.failures = 0; }
          node.log?.("Tresor: Anmeldung fehlgeschlagen");
        }
        setNodeStatus(store);
        const message = error instanceof Error ? error.message : String(error);
        if (command === "system/vault/probe") {
          send([null, { topic: "system/live/metrics", payload: { source: "encrypted-vault", devices: [], error: message } }]);
        } else {
          send([{ socketid: msg.socketid, topic: "system/vault/state", payload: { ...publicState(store), retryAfterSeconds: Math.max(store.status().retryAfterSeconds, Math.ceil((rate.blockedUntil - Date.now()) / 1000), 0), error: message } }, null]);
        }
        done?.();
      }
    });

    node.on("close", () => {
      clearInterval(cleanup);
      dashboard?.ev.removeListener("newsocket", rememberDashboardClient);
      dashboard?.ev.removeListener("endsocket", forgetDashboardClient);
      dashboardClients.clear();
      probeStore.lock();
      for (const session of sessions.values()) session.store.lock();
      sessions.clear();
      setNodeStatus();
    });
  }

  RED.nodes.registerType("home-automation-credential-vault", CredentialVaultNode);
};

module.exports._safeVaultPath = safeVaultPath;
