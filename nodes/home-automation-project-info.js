"use strict";

const { projectInfo } = require("./home-automation-project-info-core.cjs");

let projectInfoRouteRegistered = false;

// Registriert die HTTP-Route und den Node-RED-Node für Projektinformationen.
// Die Route ist nur einmalig erforderlich, damit die API nicht mehrfach doppelt
// gebunden wird, wenn Node-RED dieselbe Datei mehrfach initialisiert.
module.exports = function registerProjectInfo(RED) {
  // HTTP-Endpunkt für die Projektinformation: liefert eine JSON-Ausgabe mit
  // Versions-, Git- und Statusdaten für das aktuelle Projekt.
  if (!projectInfoRouteRegistered && RED.httpNode && typeof RED.httpNode.get === "function") {
    RED.httpNode.get("/home-automation/project-info", (_request, response) => {
      try {
        const nodeRedVersion = typeof RED.version === "function" ? RED.version() : RED.version;
        response.set("Cache-Control", "no-store");
        response.json(projectInfo(RED.settings, { nodeRedVersion }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        response.status(500).json({ error: `Projektinformation konnte nicht gelesen werden: ${message}` });
      }
    });
    projectInfoRouteRegistered = true;
  }

  // Node-RED-Node-Implementierung: liest die Projektinformationen beim Empfang
  // eines Trigger-Inputs und veröffentlicht das Ergebnis auf der Flow-Ausgabe.
  function ProjectInfoNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    node.on("input", (_msg, send, done) => {
      try {
        const nodeRedVersion = typeof RED.version === "function" ? RED.version() : RED.version;
        const payload = projectInfo(RED.settings, { nodeRedVersion });
        node.status({ fill: payload.source.dirty ? "yellow" : "green", shape: "dot", text: `${payload.source.branch} · ${payload.source.commit}` });
        send({ topic: "system/project/info", payload });
        done?.();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        node.status({ fill: "red", shape: "ring", text: "Projektinfo nicht lesbar" });
        done?.(new Error(`Projektinformation konnte nicht gelesen werden: ${message}`));
      }
    });
  }

  // Node-Typ für die Palette registrieren.
  RED.nodes.registerType("home-automation-project-info", ProjectInfoNode);
};
