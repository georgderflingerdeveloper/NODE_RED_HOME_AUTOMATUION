#!/usr/bin/env node
import { importFlowSource, sha256 } from "./lib.mjs";

const write = process.argv.includes("--write");
const result = importFlowSource({ write });
if (write) {
  console.log(`flows.json sicher aktualisiert: ${result.nodes.length} Nodes, SHA-256 ${sha256(result.rendered).slice(0, 12)}.`);
} else {
  console.log(`Import-Vorschau gültig: ${result.nodes.length} Nodes. Mit --write wird flows.json aktualisiert.`);
}
