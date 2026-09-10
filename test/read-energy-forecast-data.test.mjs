import assert from "node:assert/strict";
import test from "node:test";
import { runFunctionNode } from "./helpers/function-node-harness.mjs";

test("Read energy forecast data returns the valid global structure", async () => {
  const now = Date.parse("2026-09-10T12:30:00.000Z");
  const stored = {
    SchemaVersion: 1,
    ProviderOnline: true,
    EstimatedCostExpensive: false,
    EstimatedCostCheap: true,
    NotAvailable: false,
    Classification: "cheap",
    Provider: { Name: "Any Provider", Online: true, ValidUntil: new Date(now + 3600000).toISOString() },
    Current: { PriceCtPerKWh: 5 },
    Thresholds: {},
    Forecast: {},
    Extensions: { AI: { Status: "not-configured" } },
  };
  const { result } = await runFunctionNode("energy_forecast_read", {
    msg: { now },
    globalValues: { EnergyForecastData: stored },
  });
  assert.equal(result.topic, "energy/forecast/result");
  assert.equal(result.payload.ProviderOnline, true);
  assert.equal(result.payload.EstimatedCostCheap, true);
});

test("Read energy forecast data uses a safe unavailable state after expiry", async () => {
  const now = Date.parse("2026-09-10T12:30:00.000Z");
  const { result } = await runFunctionNode("energy_forecast_read", {
    msg: { now },
    globalValues: {
      EnergyForecastData: {
        ProviderOnline: true,
        EstimatedCostExpensive: true,
        EstimatedCostCheap: false,
        NotAvailable: false,
        Classification: "expensive",
        Provider: { Name: "Expired", Online: true, ValidUntil: new Date(now - 1).toISOString() },
      },
    },
  });
  assert.equal(result.payload.ProviderOnline, false);
  assert.equal(result.payload.EstimatedCostExpensive, false);
  assert.equal(result.payload.EstimatedCostCheap, false);
  assert.equal(result.payload.NotAvailable, true);
});
