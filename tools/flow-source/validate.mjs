#!/usr/bin/env node
import {
  DEFAULT_FLOW_FILE,
  DEFAULT_SOURCE_ROOT,
  buildFlowFromSource,
  formatFlow,
  readFlowFile,
  validateFlow,
  validateFunctionLibrary,
} from "./lib.mjs";

const file = readFlowFile(DEFAULT_FLOW_FILE);
const fileResult = validateFlow(file.nodes);
const source = buildFlowFromSource(DEFAULT_SOURCE_ROOT);
const sourceResult = validateFlow(source.nodes);
const libraryResult = validateFunctionLibrary(source.nodes);
const rebuilt = formatFlow(source.nodes, source.manifest.formatting);
const synchronized = rebuilt === file.raw;

if (!synchronized) {
  throw new Error('flow-src und flows.json sind nicht synchron. Je nach Arbeitsrichtung "npm run flow:import" oder "npm run flow:export" ausführen.');
}

console.log(
  `Flow gültig und synchron: ${fileResult.nodeCount} Nodes, ${fileResult.functionCount} Function-Nodes, keine defekten Referenzen.`,
);
console.log(`flow-src gültig: ${sourceResult.nodeCount} Nodes.`);
console.log(`Node-RED-Function-Bibliothek gültig: ${libraryResult.functionFileCount} einzelne JavaScript-Dateien.`);
