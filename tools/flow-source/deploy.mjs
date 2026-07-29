#!/usr/bin/env node
import { DEFAULT_FLOW_FILE, readFlowFile, validateFlow } from "./lib.mjs";

const endpoint = new URL("/flows", process.env.NODE_RED_URL || "http://127.0.0.1:1880");
const { raw, nodes } = readFlowFile(DEFAULT_FLOW_FILE);
validateFlow(nodes);

const response = await fetch(endpoint, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: raw,
  signal: AbortSignal.timeout(15_000),
});

if (!response.ok) {
  throw new Error(`Node-RED-Deployment fehlgeschlagen: HTTP ${response.status} ${await response.text()}`);
}
console.log(`Node-RED-Deployment erfolgreich: HTTP ${response.status}, ${nodes.length} Nodes.`);
