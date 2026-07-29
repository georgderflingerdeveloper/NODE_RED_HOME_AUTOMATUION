import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  DEFAULT_SOURCE_ROOT,
  buildFlowFromSource,
  createFunctionLibraryPlan,
  validateFunctionLibrary,
} from "../tools/flow-source/lib.mjs";

test("jeder Function-Node besitzt genau eine synchronisierte Bibliotheksdatei", () => {
  const source = buildFlowFromSource(DEFAULT_SOURCE_ROOT);
  const functionNodes = source.nodes.filter((node) => node.type === "function");
  const library = validateFunctionLibrary(source.nodes);

  assert.equal(library.functionFileCount, functionNodes.length);
});

test("Bibliotheksordner und Dateinamen enthalten keine technischen IDs oder Hash-Suffixe", () => {
  const source = buildFlowFromSource(DEFAULT_SOURCE_ROOT);
  const files = [...createFunctionLibraryPlan(source.nodes).keys()];

  for (const file of files) {
    assert.doesNotMatch(file, /--/);
    assert.doesNotMatch(path.basename(file), /[a-f0-9]{8,}\.js$/);
  }
  assert.ok(files.includes("wetter/wetterdaten-prufen-und-payload-aufbauen.js"));
  assert.ok(files.includes("solar-power/set-scaling-factor.js"));
  assert.ok(files.includes("solar-power/set-scaling-factor-2.js"));
});
