'use strict';

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function configured(settings, key) {
  if (settings && typeof settings.get === "function") {
    const value = settings.get(key);
    if (value !== undefined) return value;
  }
  return settings?.[key];
}

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch { return null; }
}

function activeProjectName(userDir) {
  const configuration = readJson(path.join(userDir, ".config.projects.json"));
  return configuration?.activeProject
    || configuration?.active
    || configuration?.projects?.active
    || null;
}

function resolveProjectRoot(settings) {
  const userDir = path.resolve(configured(settings, "userDir") || process.cwd());
  const flowFile = configured(settings, "flowFile");
  if (typeof flowFile === "string" && path.isAbsolute(flowFile)) return path.dirname(flowFile);

  const explicitProject = configured(settings, "projectDir") || configured(settings, "projectsDir");
  if (typeof explicitProject === "string" && explicitProject) {
    const candidate = path.resolve(userDir, explicitProject);
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
  }

  const active = activeProjectName(userDir);
  if (active) return path.join(userDir, "projects", active);
  return userDir;
}

function git(projectRoot, args) {
  const result = spawnSync("git", ["-C", projectRoot, ...args], { encoding: "utf8", timeout: 3000 });
  return result.status === 0 ? result.stdout.trim() : "";
}

function branchPurpose(packageData, branch) {
  const purposes = packageData?.homeAutomation?.branchPurposes;
  if (purposes && typeof purposes[branch] === "string" && purposes[branch].trim()) {
    return purposes[branch].trim();
  }
  return "Arbeitsstand der Hausautomation; Details sind in der Branch-Dokumentation und im Git-Verlauf beschrieben.";
}

function projectInfo(settings, options = {}) {
  const projectRoot = resolveProjectRoot(settings);
  const packageData = readJson(path.join(projectRoot, "package.json")) || {};
  const topLevel = git(projectRoot, ["rev-parse", "--show-toplevel"]);
  const branch = topLevel ? git(projectRoot, ["branch", "--show-current"]) : "";
  const commit = topLevel ? git(projectRoot, ["rev-parse", "--short=8", "HEAD"]) : "";
  const statusLines = topLevel ? git(projectRoot, ["status", "--porcelain"]).split("\n").filter(Boolean) : [];

  return {
    application: {
      name: packageData.description || packageData.name || "Node-RED Home Automation",
      version: packageData.version || "unbekannt",
    },
    runtime: {
      nodeRedVersion: options.nodeRedVersion || "unbekannt",
      nodeVersion: process.version,
      platform: `${process.platform} ${process.arch}`,
    },
    source: {
      project: path.basename(projectRoot),
      branch: branch || (commit ? "detached HEAD" : "kein Git-Repository"),
      commit: commit || "unbekannt",
      dirty: statusLines.length > 0,
      changedFiles: statusLines.length,
      flowFile: typeof configured(settings, "flowFile") === "string" ? configured(settings, "flowFile") : "flows.json",
      branchPurpose: branchPurpose(packageData, branch),
    },
    overview: [
      "Hausautomation und technische Zustände in Node-RED",
      "SolarEdge-, Wetter-, Kosten- und SYSTEM-Auswertung",
      "Dynamischer Netzwerk-Scan und verschlüsselte SSH-Zugangsdaten",
      "Flow-Quellen, Unit-Tests und dokumentierter Deployment-Ablauf",
    ],
    observedAt: new Date().toISOString(),
  };
}

module.exports = { activeProjectName, branchPurpose, projectInfo, resolveProjectRoot };
