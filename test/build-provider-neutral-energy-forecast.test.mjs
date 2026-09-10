import assert from "node:assert/strict";
import test from "node:test";
import { runFunctionNode } from "./helpers/function-node-harness.mjs";

const hour = 60 * 60 * 1000;
const now = Date.parse("2026-09-10T12:30:00.000Z");
const slot = (offset, price) => ({
  validFrom: new Date(now - 30 * 60 * 1000 + offset * hour).toISOString(),
  validUntil: new Date(now + 30 * 60 * 1000 + offset * hour).toISOString(),
  priceCtPerKWh: price,
});

test("Build provider-neutral energy forecast publishes a cheap global automation state", async () => {
  const { result, global } = await runFunctionNode("energy_forecast_build", {
    msg: {
      now,
      payload: {
        provider: "Test Provider",
        online: true,
        slots: [slot(0, 5), slot(1, 15), slot(2, 25)],
      },
    },
    globalValues: {
      EnergyForecastData: { Extensions: { AI: { Enabled: true, Status: "ready", Prediction: "keep" } } },
    },
  });

  assert.equal(result.topic, "energy/forecast/result");
  assert.equal(result.payload.Provider.Name, "Test Provider");
  assert.equal(result.payload.ProviderOnline, true);
  assert.equal(result.payload.EstimatedCostCheap, true);
  assert.equal(result.payload.EstimatedCostExpensive, false);
  assert.equal(result.payload.NotAvailable, false);
  assert.equal(result.payload.Classification, "cheap");
  assert.equal(result.payload.Extensions.AI.Prediction, "keep");
  assert.deepEqual(global.get("EnergyForecastData"), result.payload);
});

test("Build provider-neutral energy forecast marks expensive and unavailable states exclusively", async () => {
  const expensive = await runFunctionNode("energy_forecast_build", {
    msg: { now, payload: { provider: "Other Provider", slots: [slot(0, 30), slot(1, 10), slot(2, 20)] } },
  });
  assert.equal(expensive.result.payload.EstimatedCostExpensive, true);
  assert.equal(expensive.result.payload.EstimatedCostCheap, false);
  assert.equal(expensive.result.payload.NotAvailable, false);

  const unavailable = await runFunctionNode("energy_forecast_build", {
    msg: { now, payload: { provider: "Offline Provider", online: false, slots: [] } },
  });
  assert.equal(unavailable.result.payload.ProviderOnline, false);
  assert.equal(unavailable.result.payload.EstimatedCostExpensive, false);
  assert.equal(unavailable.result.payload.EstimatedCostCheap, false);
  assert.equal(unavailable.result.payload.NotAvailable, true);
});

test("Build provider-neutral energy forecast ignores malformed provider slots", async () => {
  const { result } = await runFunctionNode("energy_forecast_build", {
    msg: { now, payload: { provider: "Broken Provider", slots: [{ validFrom: "bad", priceCtPerKWh: "bad" }] } },
  });
  assert.equal(result.payload.NotAvailable, true);
  assert.deepEqual(result.payload.Forecast.Slots, []);
});
