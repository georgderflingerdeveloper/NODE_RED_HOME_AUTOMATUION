import assert from "node:assert/strict";
import test from "node:test";
import { runFunctionNode } from "./helpers/function-node-harness.mjs";

test("Hausgesamtleistung berücksichtigt PV und Einspeisung", async () => {
  const { result } = await runFunctionNode("GetExcessPower", {
    msg: { payload: { PvPowerWatt: 5000, GridPowerWatt: 1200 } },
    globalValues: { SolarEdgeData: { OnlineFlag: true, Source: "Test" } },
  });

  assert.equal(result.payload.PvPowerWatt, 5000);
  assert.equal(result.payload.GridImportWatt, 0);
  assert.equal(result.payload.FeedInWatt, 1200);
  assert.equal(result.payload.HouseConsumptionWatt, 3800);
});

test("Hausgesamtleistung berücksichtigt PV und Netzbezug", async () => {
  const { result } = await runFunctionNode("GetExcessPower", {
    msg: { payload: { PvPowerWatt: 1000, GridPowerWatt: -2200 } },
    globalValues: { SolarEdgeData: { OnlineFlag: true, Source: "Test" } },
  });

  assert.equal(result.payload.PvPowerWatt, 1000);
  assert.equal(result.payload.GridImportWatt, 2200);
  assert.equal(result.payload.FeedInWatt, 0);
  assert.equal(result.payload.HouseConsumptionWatt, 3200);
});
