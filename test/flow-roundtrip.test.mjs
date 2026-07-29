import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_FLOW_FILE,
  DEFAULT_SOURCE_ROOT,
  buildFlowFromSource,
  formatFlow,
  readFlowFile,
  validateFlow,
} from "../tools/flow-source/lib.mjs";

test("flow-src rekonstruiert flows.json bytegenau", () => {
  const current = readFlowFile(DEFAULT_FLOW_FILE);
  const source = buildFlowFromSource(DEFAULT_SOURCE_ROOT);
  const rebuilt = formatFlow(source.nodes, source.manifest.formatting);

  assert.equal(rebuilt, current.raw);
});

test("alle Nodes, Functions, Wires und Links sind gültig", () => {
  const current = readFlowFile(DEFAULT_FLOW_FILE);
  const source = buildFlowFromSource(DEFAULT_SOURCE_ROOT);
  const sourceResult = validateFlow(source.nodes);
  const currentResult = validateFlow(current.nodes);

  assert.deepEqual(sourceResult, currentResult);
});
