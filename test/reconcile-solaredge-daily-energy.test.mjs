import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { reconcileSolarEdgeDailyEnergy } = require("../nodes/reconcile-solaredge-daily-energy.cjs");

test("reconcile-solaredge-daily-energy keeps measured gaps separate and calculates comparison values", () => {
  const result = reconcileSolarEdgeDailyEnergy({
    day: "2026-09-09",
    previousReading: {
      observed_at: "2026-09-08T21:59:00.000Z",
      grid_import_total_kwh: 100,
      grid_export_total_kwh: 250,
    },
    lastReading: {
      observed_at: "2026-09-09T21:58:00.000Z",
      grid_import_total_kwh: 106,
      grid_export_total_kwh: 259,
    },
    integrated: { gridImportKWh: 5.5, gridExportKWh: 8, gridImportCostEur: 0.55 },
    averageTariffCtPerKWh: 10,
  });

  assert.equal(result.quality, "anchored");
  assert.equal(result.meterImportKWh, 6);
  assert.equal(result.meterExportKWh, 9);
  assert.equal(result.fallbackImportKWh, 0.5);
  assert.equal(result.fallbackExportKWh, 1);
  assert.equal(result.importComparisonCostEur, 0.6);
  assert.equal(result.exportComparisonValueEur, 0.9);
});

test("reconcile-solaredge-daily-energy marks a first same-day reading as partial", () => {
  const reading = {
    observed_at: "2026-09-09T10:00:00.000Z",
    grid_import_total_kwh: 100,
    grid_export_total_kwh: 250,
  };
  const result = reconcileSolarEdgeDailyEnergy({
    day: "2026-09-09",
    firstReading: reading,
    lastReading: reading,
  });
  assert.equal(result.quality, "partial-day");
  assert.equal(result.meterImportKWh, 0);
});
