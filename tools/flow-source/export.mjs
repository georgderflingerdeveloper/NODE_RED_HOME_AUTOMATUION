#!/usr/bin/env node
import { exportFlowSource } from "./lib.mjs";

const force = process.argv.includes("--force");
const result = exportFlowSource({ force });
console.log(`flow-src aktualisiert: ${result.nodeCount} Nodes in ${result.fileCount} generierten Dateien.`);
