import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { runFunctionSource } from "./helpers/function-node-harness.mjs";

const source = fs.readFileSync(new URL(
  "../flow-src/flows/solar-power--79160448dc533f1d/functions/parse-solaredge-inverter-energy-total.js",
  import.meta.url,
), "utf8");

test("parse-solaredge-inverter-energy-total decodes the lifetime production counter", async () => {
  const { result, global } = await runFunctionSource(source, {
    msg: { payload: { data: [0x0002, 0x49f0, 0] } },
  });
  assert.equal(result.topic, "history/source/solaredge-inverter-total");
  assert.equal(result.payload.pvProductionTotalKWh, 150);
  assert.equal(result.payload.registers.baseZeroStart, 40093);
  assert.equal(global.get("SolarEdgePvProductionTotalKWh"), 150);
});

test("parse-solaredge-inverter-energy-total rejects incomplete and invalid values", async () => {
  assert.equal((await runFunctionSource(source, { msg: { payload: [1] } })).result, null);
  assert.equal((await runFunctionSource(source, { msg: { payload: [0xffff, 0xffff, 0] } })).result, null);
  assert.equal((await runFunctionSource(source, { msg: { payload: [0, 1, 0x8000] } })).result, null);
});
