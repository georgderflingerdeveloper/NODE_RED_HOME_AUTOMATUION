"use strict";

const { projectInfo } = require("./home-automation-project-info-core.cjs");

let projectInfoRouteRegistered = false;

module.exports = function registerProjectInfo(RED) {
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
  RED.nodes.registerType("home-automation-project-info", ProjectInfoNode);
};
