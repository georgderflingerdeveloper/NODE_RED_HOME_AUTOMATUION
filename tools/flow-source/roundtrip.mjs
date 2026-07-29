#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_FLOW_FILE,
  exportFlowSource,
  importFlowSource,
  readFlowFile,
  sha256,
} from "./lib.mjs";

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "node-red-flow-roundtrip-"));
try {
  const temporaryLibrary = path.join(temporaryRoot, "function-library");
  exportFlowSource({
    flowFile: DEFAULT_FLOW_FILE,
    sourceRoot: temporaryRoot,
    libraryRoot: temporaryLibrary,
    force: true,
  });
  const rebuilt = importFlowSource({
    flowFile: DEFAULT_FLOW_FILE,
    sourceRoot: temporaryRoot,
    libraryRoot: temporaryLibrary,
  });
  const original = readFlowFile(DEFAULT_FLOW_FILE).raw;
  if (rebuilt.rendered !== original) {
    throw new Error("Round-Trip ist nicht bytegenau.");
  }
  console.log(`Bytegenauer Round-Trip erfolgreich: ${rebuilt.nodes.length} Nodes, SHA-256 ${sha256(original).slice(0, 12)}.`);
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
