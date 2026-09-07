"use strict";

const { projectInfo } = require("./home-automation-project-info-core.cjs");

module.exports = function registerProjectInfo(RED) {
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
