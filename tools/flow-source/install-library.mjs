#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_FUNCTION_LIBRARY_ROOT,
  DEFAULT_SOURCE_ROOT,
  PROJECT_ROOT,
  dirtyFunctionLibraryFiles,
  readManifest,
  sha256,
} from "./lib.mjs";

const force = process.argv.includes("--force");
const nodeRedUserDir = process.env.NODE_RED_USER_DIR || path.resolve(PROJECT_ROOT, "../..");
const activeRoot = process.env.NODE_RED_FUNCTION_LIBRARY
  || path.join(nodeRedUserDir, "lib/functions/HOMEAUTOMATION_NG");
const installManifestFile = path.join(activeRoot, ".homeautomation-ng-manifest.json");
const sourceManifest = readManifest(DEFAULT_SOURCE_ROOT);

if (!sourceManifest) throw new Error("flow-src/manifest.json fehlt.");
const dirtySource = dirtyFunctionLibraryFiles(DEFAULT_FUNCTION_LIBRARY_ROOT, sourceManifest);
if (dirtySource.length) {
  throw new Error(`Versionierte Function-Bibliothek ist nicht synchron:\n- ${dirtySource.join("\n- ")}`);
}

let previousInstall = null;
if (fs.existsSync(installManifestFile)) {
  previousInstall = JSON.parse(fs.readFileSync(installManifestFile, "utf8"));
  if (!force) {
    const dirtyInstalled = [];
    for (const [relative, expectedHash] of Object.entries(previousInstall.files || {})) {
      const target = path.resolve(activeRoot, relative);
      if (!target.startsWith(`${path.resolve(activeRoot)}${path.sep}`)) {
        throw new Error(`Unsicherer Installationspfad: ${relative}`);
      }
      if (!fs.existsSync(target) || sha256(fs.readFileSync(target)) !== expectedHash) {
        dirtyInstalled.push(relative);
      }
    }
    if (dirtyInstalled.length) {
      throw new Error(
        `Die aktive HOMEAUTOMATION_NG-Bibliothek enthält Änderungen. Diese zuerst übernehmen oder bewusst mit --force ersetzen:\n- ${dirtyInstalled.join("\n- ")}`,
      );
    }
  }
} else if (fs.existsSync(activeRoot) && fs.readdirSync(activeRoot).length && !force) {
  throw new Error(`${activeRoot} enthält Dateien ohne Installationsmanifest.`);
}

fs.mkdirSync(activeRoot, { recursive: true });
for (const relative of Object.keys(previousInstall?.files || {})) {
  if (sourceManifest.functionLibraryFiles?.[relative]) continue;
  const stale = path.resolve(activeRoot, relative);
  if (stale.startsWith(`${path.resolve(activeRoot)}${path.sep}`) && fs.existsSync(stale)) {
    fs.unlinkSync(stale);
  }
}

for (const relative of Object.keys(sourceManifest.functionLibraryFiles || {})) {
  const source = path.resolve(DEFAULT_FUNCTION_LIBRARY_ROOT, relative);
  const target = path.resolve(activeRoot, relative);
  if (!source.startsWith(`${path.resolve(DEFAULT_FUNCTION_LIBRARY_ROOT)}${path.sep}`)) {
    throw new Error(`Unsicherer Quellpfad: ${relative}`);
  }
  if (!target.startsWith(`${path.resolve(activeRoot)}${path.sep}`)) {
    throw new Error(`Unsicherer Zielpfad: ${relative}`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

const installed = {
  project: "HOMEAUTOMATION_NG",
  sourceFlowSha256: sourceManifest.flowSha256,
  files: sourceManifest.functionLibraryFiles,
};
fs.writeFileSync(installManifestFile, `${JSON.stringify(installed, null, 2)}\n`);
console.log(
  `Node-RED-Function-Bibliothek installiert: ${Object.keys(installed.files || {}).length} Dateien in ${activeRoot}.`,
);
