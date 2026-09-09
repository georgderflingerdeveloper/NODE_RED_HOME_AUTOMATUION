import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { runFunctionSource } from "./helpers/function-node-harness.mjs";

const sourcePath = new URL(
  "../flow-src/flows/se-grid-power--tab_read_feedin/functions/parse-solaredge-meter-energy-totals.js",
  import.meta.url,
);
const source = fs.readFileSync(sourcePath, "utf8");

test("parse-solaredge-meter-energy-totals decodes unsigned counters and the shared scale factor", async () => {
  const registers = Array(17).fill(0);
  registers[0] = 0x0001;
  registers[1] = 0x86a0; // 100000 Wh exported
  registers[8] = 0x0003;
  registers[9] = 0x0d40; // 200000 Wh imported
  registers[16] = 0;
  const { result } = await runFunctionSource(source, { msg: { payload: { data: registers } } });

  assert.equal(result.topic, "history/source/solaredge-meter-totals");
  assert.equal(result.payload.gridExportTotalKWh, 100);
  assert.equal(result.payload.gridImportTotalKWh, 200);
  assert.equal(result.payload.registers.baseZeroStart, 226);
});

test("parse-solaredge-meter-energy-totals rejects incomplete and invalid values", async () => {
  assert.equal((await runFunctionSource(source, { msg: { payload: [1, 2] } })).result, null);
  const registers = Array(17).fill(0);
  registers[16] = 0x8000;
  assert.equal((await runFunctionSource(source, { msg: { payload: registers } })).result, null);
});
