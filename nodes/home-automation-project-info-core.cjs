'use strict';

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// Gibt den konfigurierten Wert aus Node-RED-Einstellungen zurück. Wenn eine
// Einstellungsvorlage vorhanden ist, hat sie Vorrang vor einem direkten Feldzugriff.
function configured(settings, key) {
  if (settings && typeof settings.get === "function") {
    const value = settings.get(key);
    if (value !== undefined) return value;
  }
  return settings?.[key];
}

// Liest eine JSON-Datei sicher ein und gibt null zurück, wenn die Datei fehlt
// oder fehlerhaft ist. Dadurch bleiben nachgelagerte Funktionen robust.
function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch { return null; }
}

// Ermittelt den aktuell aktiven Projektnamen aus der Node-RED-Project-Konfiguration.
function activeProjectName(userDir) {
  const configuration = readJson(path.join(userDir, ".config.projects.json"));
  return configuration?.activeProject
    || configuration?.active
    || configuration?.projects?.active
    || null;
}

// Bestimmt das Projekt-Root, je nach Node-RED-Setup und aktivem Projekt.
// Priorität: absoluter Flow-Pfad, explizites Projektverzeichnis, aktives Projekt,
// sonst der Benutzerordner selbst.
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

// Führt einen Git-Befehl im gewählten Projektverzeichnis aus und liefert die
// Ausgabe zurück, falls der Befehl erfolgreich war.
function git(projectRoot, args) {
  const result = spawnSync("git", ["-C", projectRoot, ...args], { encoding: "utf8", timeout: 3000 });
  return result.status === 0 ? result.stdout.trim() : "";
}

// Liefert die beschreibende Zweckbestimmung des aktuellen Branches aus der
// Package-Konfiguration. Falls nichts definiert ist, bleibt eine generische
// Beschreibung zurück.
function branchPurpose(packageData, branch) {
  const purposes = packageData?.homeAutomation?.branchPurposes;
  if (purposes && typeof purposes[branch] === "string" && purposes[branch].trim()) {
    return purposes[branch].trim();
  }
  return "Arbeitsstand der Hausautomation; Details sind in der Branch-Dokumentation und im Git-Verlauf beschrieben.";
}

// Hauptfunktion: sammelt alle verfügbaren Projekt- und Laufzeitinformationen für
// die UI bzw. die späteren Node-RED-Node-Ausgaben.
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
