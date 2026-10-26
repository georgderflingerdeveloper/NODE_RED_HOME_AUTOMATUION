import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const require = createRequire(import.meta.url);
const registerHistoryStore = require("../nodes/home-automation-history.js");

test("Datenbank-Dashboard sortiert Tageszeilen chronologisch nach Zeitstempel", () => {
  const rows = registerHistoryStore.sortDashboardRows([
    { key: "2026-09-09T18:00:00.000Z", label: "20:00" },
    { key: "2026-09-08T22:00:00.000Z", label: "00:00" },
    { key: "2026-09-09T08:00:00.000Z", label: "10:00" },
  ]);
  assert.deepEqual(rows.map((row) => row.label), ["00:00", "10:00", "20:00"]);
});

test("Datenbank-Service integriert Netzbezug und liefert Dashboard-Diagnose", () => {
  const userDir = mkdtempSync(join(tmpdir(), "home-automation-history-"));
  let HistoryStore;
  const RED = {
    settings: { userDir },
    nodes: {
      createNode(node) {
        const emitter = new EventEmitter();
        node.on = emitter.on.bind(emitter);
        node.emit = emitter.emit.bind(emitter);
        node.status = () => {};
      },
      registerType(name, constructor) {
        assert.equal(name, "home-automation-history");
        HistoryStore = constructor;
      },
    },
  };
  registerHistoryStore(RED);
  const node = new HistoryStore({
    databasePath: "data/test.sqlite",
    backupRetention: 2,
  });

  const sent = [];
  const deliver = (msg) => {
    let failure;
    node.emit("input", msg, (output) => sent.push(output), (error) => { failure = error; });
    if (failure) throw failure;
  };

  const now = new Date();
  const tariffStart = new Date(now.getTime() - 60 * 60 * 1000);
  const tariffEnd = new Date(now.getTime() + 60 * 60 * 1000);
  deliver({
    topic: "aWATTar/tariff/current",
    payload: {
      provider: "aWATTar",
      priceCtPerKWh: 10,
      marketPriceEurPerMWh: 100,
      validFrom: tariffStart.toISOString(),
      validUntil: tariffEnd.toISOString(),
      fetchedAt: new Date().toISOString(),
    },
  });
  const energy = (milliseconds) => ({
    topic: "history/source/energy",
    payload: {
      timestamp: now.getTime() + milliseconds,
      OnlineFlag: true,
      PvPowerWatt: 2000,
      HouseConsumptionWatt: 1500,
      GridImportWatt: 1000,
      FeedInWatt: 0,
    },
  });
  deliver(energy(0));
  deliver(energy(1000));
  deliver({
    topic: "history/source/solaredge-meter-totals",
    payload: {
      observedAt: new Date(now.getTime() - 1000).toISOString(),
      gridImportTotalKWh: 120,
      gridExportTotalKWh: 230,
      scaleFactor: 0,
    },
  });
  deliver({
    topic: "history/source/solaredge-meter-totals",
    payload: {
      observedAt: new Date(now.getTime() + 2000).toISOString(),
      gridImportTotalKWh: 120.25,
      gridExportTotalKWh: 230.5,
      scaleFactor: 0,
    },
  });
  deliver({
    topic: "history/source/solaredge-inverter-total",
    payload: {
      observedAt: new Date(now.getTime() - 1000).toISOString(),
      pvProductionTotalKWh: 500,
      scaleFactor: 0,
    },
  });
  deliver({
    topic: "history/source/solaredge-inverter-total",
    payload: {
      observedAt: new Date(now.getTime() + 2000).toISOString(),
      pvProductionTotalKWh: 500.1,
      scaleFactor: 0,
    },
  });
  deliver({ topic: "history/dashboard", payload: { period: "day", anchor: now.toISOString() } });

  const dashboard = sent.at(-1);
  assert.equal(dashboard.topic, "history/dashboard/result");
  assert.equal(dashboard.payload.diagnostics.find((item) => item.source === "energy").status, "online");
  assert.ok(dashboard.payload.totals.gridImportKWh > 0.0002);
  assert.ok(dashboard.payload.totals.gridImportKWh < 0.0003);
  assert.ok(dashboard.payload.totals.energyCostEur > 0.00002);
  assert.ok(dashboard.payload.totals.energyCostEur > dashboard.payload.totals.gridImportCostEur);
  assert.ok(dashboard.payload.rows.some((row) => row.hours.some((hour) => hour.recorded)));
  assert.equal(dashboard.payload.live.priceCtPerKWh, 10);
  assert.equal(dashboard.payload.live.houseConsumptionWatt, 1500);
  assert.equal(dashboard.payload.live.gridImportWatt, 1000);
  assert.ok(Math.abs(dashboard.payload.live.energyValuePerHourEur - 0.15) < 1e-12);
  assert.ok(Math.abs(dashboard.payload.live.gridImportCostPerHourEur - 0.1) < 1e-12);
  assert.equal(dashboard.payload.latestReconciliation.quality, "partial-day");
  assert.equal(dashboard.payload.latestReconciliation.meterImportKWh, 0.25);
  assert.equal(dashboard.payload.latestReconciliation.meterExportKWh, 0.5);
  assert.ok(Math.abs(dashboard.payload.latestReconciliation.meterPvProductionKWh - 0.1) < 1e-9);
  assert.equal(dashboard.payload.latestReconciliation.meterHouseConsumptionKWh, null);
  assert.equal(dashboard.payload.diagnostics.find((item) => item.source === "solaredgeMeter").status, "online");
  assert.equal(dashboard.payload.diagnostics.find((item) => item.source === "solaredgeInverterEnergy").status, "online");

  node.emit("close");
  rmSync(userDir, { recursive: true, force: true });
});

test("Kosten-Dashboard markiert jede fehlende oder offline Stunde des Tages als unvollständig", () => {
  const userDir = mkdtempSync(join(tmpdir(), "home-automation-history-gaps-"));
  let HistoryStore;
  const RED = {
    settings: { userDir },
    nodes: {
      createNode(node) {
        const emitter = new EventEmitter();
        node.on = emitter.on.bind(emitter);
        node.emit = emitter.emit.bind(emitter);
        node.status = () => {};
      },
      registerType(name, constructor) {
        assert.equal(name, "home-automation-history");
        HistoryStore = constructor;
      },
    },
  };
  registerHistoryStore(RED);
  const node = new HistoryStore({ databasePath: "data/test.sqlite", backupRetention: 2, cloudAuto: false });
  const database = new DatabaseSync(join(userDir, "data", "test.sqlite"));
  const insert = database.prepare(`
    INSERT INTO hourly_snapshots (
      interval_start, interval_end, captured_at, energy_status, weather_status, tariff_status,
      pv_energy_kwh, house_consumption_kwh, grid_import_kwh, grid_export_kwh,
      energy_cost_eur, market_price_ct_kwh, temperature_c, cloud_cover_percent,
      sunshine_percent, precipitation_probability_percent, sample_count, data_quality
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const dayStart = Date.parse("2026-10-19T22:00:00.000Z");
  const hourMs = 60 * 60 * 1000;
  for (let hour = 0; hour < 24; hour += 1) {
    if (hour === 7) continue;
    const start = new Date(dayStart + hour * hourMs).toISOString();
    const end = new Date(dayStart + (hour + 1) * hourMs).toISOString();
    const offline = hour === 13;
    insert.run(
      start, end, end, offline ? "offline" : "online", "online", "online",
      0, 1, 0.5, 0, 0.1, 10, 20, 50, 0, 0, 60, offline ? "offline" : "complete",
    );
  }
  database.close();

  const sent = [];
  const deliver = (period) => {
    node.emit("input", {
      topic: "history/dashboard",
      payload: { period, anchor: "2026-10-20T12:00:00+02:00" },
    }, (output) => sent.push(output), (error) => { if (error) throw error; });
    return sent.at(-1).payload;
  };

  const month = deliver("month");
  const day = month.rows.find((row) => row.key === "2026-10-20");
  assert.equal(day.recordedHourCount, 23);
  assert.equal(day.offlineCount, 2);
  assert.equal(day.hours.length, 24);
  assert.equal(day.hours.find((hour) => hour.time === "07:00").incomplete, true);

  const hours = deliver("day");
  assert.equal(hours.rows.length, 24);
  const missingHour = hours.rows.find((row) => row.label === "07:00");
  assert.equal(missingHour.recordedHourCount, 0);
  assert.equal(missingHour.offlineCount, 1);

  node.emit("close");
  rmSync(userDir, { recursive: true, force: true });
});
