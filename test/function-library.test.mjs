import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SOURCE_ROOT,
  buildFlowFromSource,
  validateFunctionLibrary,
} from "../tools/flow-source/lib.mjs";

test("jeder Function-Node besitzt genau eine synchronisierte Bibliotheksdatei", () => {
  const source = buildFlowFromSource(DEFAULT_SOURCE_ROOT);
  const functionNodes = source.nodes.filter((node) => node.type === "function");
  const library = validateFunctionLibrary(source.nodes);

  assert.equal(library.functionFileCount, functionNodes.length);
});
