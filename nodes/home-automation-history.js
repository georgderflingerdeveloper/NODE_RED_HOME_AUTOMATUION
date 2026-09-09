const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");
const { localDay, reconcileSolarEdgeDailyEnergy } = require("./reconcile-solaredge-daily-energy.cjs");

const SENSITIVE_KEY = /password|secret|token|authorization|cookie|credential|api[_-]?key/i;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const SOURCE_FRESHNESS_MS = {
  energy: 2 * 60 * 1000,
  solaredgeMeter: 10 * 60 * 1000,
  weather: 2 * HOUR_MS,
  tariff: 70 * 60 * 1000,
};

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SENSITIVE_KEY.test(key))
        .map(([key, item]) => [key, sanitize(item)])
    );
  }
  if (typeof value === "bigint") return value.toString();
  return value;
}

function asIso(value, fallback = Date.now()) {
  const date = new Date(value ?? fallback);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(fallback).toISOString();
}

function hourStartIso(value) {
  const date = new Date(value);
  date.setUTCMinutes(0, 0, 0);
  return date.toISOString();
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

module.exports = function registerHistoryStore(RED) {
  function HistoryStoreNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    const relativePath = config.databasePath || "projects/NODE_RED_HOME_AUTOMATION_SOLAR/data/home-automation.sqlite";
    const databasePath = path.resolve(RED.settings.userDir, relativePath);
    const backupDirectory = path.join(path.dirname(databasePath), "backups");
    const retentionDays = Math.max(1, Number(config.backupRetention || 31));

    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    fs.mkdirSync(backupDirectory, { recursive: true });
    const database = new DatabaseSync(databasePath);
    database.exec(fs.readFileSync(path.join(__dirname, "home-automation-history.schema.sql"), "utf8"));

    const insertEvent = database.prepare(`
      INSERT INTO telemetry_events (observed_at, received_at, source, topic, event_type, payload_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertTariff = database.prepare(`
      INSERT OR REPLACE INTO tariff_slots
        (valid_from, valid_until, provider, market_price_eur_mwh, price_ct_kwh, fetched_at, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const queryEvents = database.prepare(`
      SELECT id, observed_at, received_at, source, topic, event_type, payload_json
      FROM telemetry_events
      WHERE observed_at >= COALESCE(?, observed_at)
        AND observed_at <= COALESCE(?, observed_at)
        AND topic = COALESCE(?, topic)
      ORDER BY observed_at DESC
      LIMIT ?
    `);
    const upsertSource = database.prepare(`
      INSERT INTO source_state (source, observed_at, received_at, status, error_text, payload_json)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(source) DO UPDATE SET
        observed_at = excluded.observed_at,
        received_at = excluded.received_at,
        status = excluded.status,
        error_text = excluded.error_text,
        payload_json = excluded.payload_json
    `);
    const selectSources = database.prepare(`
      SELECT source, observed_at, received_at, status, error_text, payload_json
      FROM source_state
      ORDER BY source
    `);
    const selectSource = database.prepare(`
      SELECT source, observed_at, received_at, status, error_text, payload_json
      FROM source_state WHERE source = ?
    `);
    const selectTariffAt = database.prepare(`
      SELECT valid_from, valid_until, provider, market_price_eur_mwh, price_ct_kwh, fetched_at, raw_json
      FROM tariff_slots
      WHERE valid_from <= ? AND valid_until > ?
      ORDER BY valid_from DESC
      LIMIT 1
    `);
    const selectSnapshot = database.prepare(`
      SELECT * FROM hourly_snapshots WHERE interval_start = ?
    `);
    const upsertSnapshot = database.prepare(`
      INSERT INTO hourly_snapshots (
        interval_start, interval_end, captured_at,
        energy_status, weather_status, tariff_status,
        pv_energy_kwh, house_consumption_kwh, grid_import_kwh, grid_export_kwh,
        energy_cost_eur, market_price_ct_kwh,
        temperature_c, cloud_cover_percent, sunshine_percent,
        precipitation_probability_percent, sample_count, data_quality
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(interval_start) DO UPDATE SET
        interval_end = excluded.interval_end,
        captured_at = excluded.captured_at,
        energy_status = excluded.energy_status,
        weather_status = excluded.weather_status,
        tariff_status = excluded.tariff_status,
        pv_energy_kwh = excluded.pv_energy_kwh,
        house_consumption_kwh = excluded.house_consumption_kwh,
        grid_import_kwh = excluded.grid_import_kwh,
        grid_export_kwh = excluded.grid_export_kwh,
        energy_cost_eur = excluded.energy_cost_eur,
        market_price_ct_kwh = excluded.market_price_ct_kwh,
        temperature_c = excluded.temperature_c,
        cloud_cover_percent = excluded.cloud_cover_percent,
        sunshine_percent = excluded.sunshine_percent,
        precipitation_probability_percent = excluded.precipitation_probability_percent,
        sample_count = excluded.sample_count,
        data_quality = excluded.data_quality
    `);
    const querySnapshots = database.prepare(`
      SELECT * FROM hourly_snapshots
      WHERE interval_start >= ? AND interval_start < ?
      ORDER BY interval_start
    `);
    const queryTariffs = database.prepare(`
      SELECT valid_from, valid_until, provider, market_price_eur_mwh, price_ct_kwh, fetched_at
      FROM tariff_slots
      WHERE valid_from >= ? AND valid_from < ?
      ORDER BY valid_from
    `);
    const insertSolarEdgeReading = database.prepare(`
      INSERT OR REPLACE INTO solaredge_meter_readings
        (observed_at, local_day, grid_import_total_kwh, grid_export_total_kwh, scale_factor, raw_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const selectSolarEdgeReadingsForDay = database.prepare(`
      SELECT * FROM solaredge_meter_readings WHERE local_day = ? ORDER BY observed_at
    `);
    const selectPreviousSolarEdgeReading = database.prepare(`
      SELECT * FROM solaredge_meter_readings
      WHERE local_day < ? ORDER BY observed_at DESC LIMIT 1
    `);
    const upsertDailyReconciliation = database.prepare(`
      INSERT INTO daily_energy_reconciliation (
        day, quality, baseline_kind, baseline_observed_at, latest_observed_at,
        meter_import_kwh, meter_export_kwh, integrated_import_kwh, integrated_export_kwh,
        import_difference_kwh, export_difference_kwh, fallback_import_kwh, fallback_export_kwh,
        average_tariff_ct_kwh, integrated_import_cost_eur,
        import_comparison_cost_eur, export_comparison_value_eur, calculated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(day) DO UPDATE SET
        quality = excluded.quality,
        baseline_kind = excluded.baseline_kind,
        baseline_observed_at = excluded.baseline_observed_at,
        latest_observed_at = excluded.latest_observed_at,
        meter_import_kwh = excluded.meter_import_kwh,
        meter_export_kwh = excluded.meter_export_kwh,
        integrated_import_kwh = excluded.integrated_import_kwh,
        integrated_export_kwh = excluded.integrated_export_kwh,
        import_difference_kwh = excluded.import_difference_kwh,
        export_difference_kwh = excluded.export_difference_kwh,
        fallback_import_kwh = excluded.fallback_import_kwh,
        fallback_export_kwh = excluded.fallback_export_kwh,
        average_tariff_ct_kwh = excluded.average_tariff_ct_kwh,
        integrated_import_cost_eur = excluded.integrated_import_cost_eur,
        import_comparison_cost_eur = excluded.import_comparison_cost_eur,
        export_comparison_value_eur = excluded.export_comparison_value_eur,
        calculated_at = excluded.calculated_at
    `);
    const selectDailyReconciliations = database.prepare(`
      SELECT * FROM daily_energy_reconciliation ORDER BY day
    `);

    let energyAccumulator = null;
    let lastEnergySourceWriteMs = 0;
    let lastEnergyOnlineState = null;

    function parsedSource(source) {
      const row = selectSource.get(source);
      if (!row) return null;
      return { ...row, payload: JSON.parse(row.payload_json) };
    }

    function sourceStatus(source, nowMs = Date.now()) {
      const row = parsedSource(source);
      const freshness = SOURCE_FRESHNESS_MS[source] || HOUR_MS;
      const ageMs = row ? Math.max(0, nowMs - new Date(row.observed_at).getTime()) : null;
      const online = Boolean(row) && row.status === "online" && Number.isFinite(ageMs) && ageMs <= freshness;
      return {
        source,
        status: online ? "online" : "offline",
        observedAt: row?.observed_at || null,
        receivedAt: row?.received_at || null,
        ageMinutes: ageMs === null ? null : Math.round(ageMs / 6000) / 10,
        error: online ? "" : (row?.error_text || (row ? "Daten veraltet" : "Noch keine Daten empfangen")),
        payload: row?.payload || null,
      };
    }

    function storeSource(source, payload, observedAt, online, errorText = "") {
      const receivedAt = new Date().toISOString();
      upsertSource.run(
        source,
        observedAt,
        receivedAt,
        online ? "online" : "offline",
        online ? "" : String(errorText || "Quelle offline"),
        JSON.stringify(payload)
      );
    }

    function accumulatorFor(timestampMs) {
      const intervalStart = hourStartIso(timestampMs);
      if (energyAccumulator?.intervalStart === intervalStart) return energyAccumulator;
      if (energyAccumulator) persistEnergyAccumulator();
      const existing = selectSnapshot.get(intervalStart);
      energyAccumulator = {
        intervalStart,
        intervalEnd: new Date(new Date(intervalStart).getTime() + HOUR_MS).toISOString(),
        pvWh: finite(existing?.pv_energy_kwh) * 1000,
        houseWh: finite(existing?.house_consumption_kwh) * 1000,
        importWh: finite(existing?.grid_import_kwh) * 1000,
        exportWh: finite(existing?.grid_export_kwh) * 1000,
        costEur: finite(existing?.energy_cost_eur),
        sampleCount: finite(existing?.sample_count),
        last: null,
      };
      return energyAccumulator;
    }

    function integrateEnergy(payload) {
      const timestampMs = new Date(payload.timestamp ?? payload.UpdatedAt ?? Date.now()).getTime();
      const sampleTimeMs = Number.isFinite(timestampMs) ? timestampMs : Date.now();
      const accumulator = accumulatorFor(sampleTimeMs);
      const online = payload.OnlineFlag !== false && !payload.OfflineFlag;
      const sample = {
        timestampMs: sampleTimeMs,
        online,
        pvW: Math.max(0, finite(payload.PvPowerWatt)),
        houseW: Math.max(0, finite(payload.HouseConsumptionWatt)),
        importW: Math.max(0, finite(payload.GridImportWatt)),
        exportW: Math.max(0, finite(payload.FeedInWatt ?? payload.ExcessPowerWatt)),
      };
      const previous = accumulator.last;
      if (previous && previous.online && sample.online) {
        const elapsedHours = (sample.timestampMs - previous.timestampMs) / HOUR_MS;
        if (elapsedHours > 0 && elapsedHours <= 5 / 60) {
          const trapezoidWh = (left, right) => ((left + right) / 2) * elapsedHours;
          accumulator.pvWh += trapezoidWh(previous.pvW, sample.pvW);
          accumulator.houseWh += trapezoidWh(previous.houseW, sample.houseW);
          const importWh = trapezoidWh(previous.importW, sample.importW);
          accumulator.importWh += importWh;
          accumulator.exportWh += trapezoidWh(previous.exportW, sample.exportW);
          const tariff = selectTariffAt.get(asIso(sample.timestampMs), asIso(sample.timestampMs));
          if (tariff) accumulator.costEur += (importWh / 1000) * (finite(tariff.price_ct_kwh) / 100);
        }
      }
      accumulator.last = sample;
      accumulator.sampleCount += 1;
      return { online, observedAt: asIso(sampleTimeMs) };
    }

    function persistEnergyAccumulator() {
      if (!energyAccumulator) return null;
      const nowMs = Date.now();
      const energy = sourceStatus("energy", nowMs);
      const weather = sourceStatus("weather", nowMs);
      const tariff = selectTariffAt.get(energyAccumulator.intervalStart, energyAccumulator.intervalStart)
        || selectTariffAt.get(new Date().toISOString(), new Date().toISOString());
      const tariffOnline = Boolean(tariff) && nowMs - new Date(tariff.fetched_at).getTime() <= SOURCE_FRESHNESS_MS.tariff;
      const weatherPayload = weather.payload || {};
      const quality = energy.status === "online" && tariffOnline
        ? (weather.status === "online" ? "complete" : "weather_offline")
        : "offline";
      upsertSnapshot.run(
        energyAccumulator.intervalStart,
        energyAccumulator.intervalEnd,
        new Date().toISOString(),
        energy.status,
        weather.status,
        tariffOnline ? "online" : "offline",
        energyAccumulator.pvWh / 1000,
        energyAccumulator.houseWh / 1000,
        energyAccumulator.importWh / 1000,
        energyAccumulator.exportWh / 1000,
        energyAccumulator.costEur,
        tariff?.price_ct_kwh ?? null,
        weatherPayload.Current?.TemperatureC ?? null,
        weatherPayload.Current?.CloudCoverPercent ?? null,
        weatherPayload.ActualSunshineLastHourPercent ?? weatherPayload.ActualSunshineLastHour ?? null,
        weatherPayload.ForecastNext6Hours?.[0]?.PrecipitationProbabilityPercent ?? null,
        energyAccumulator.sampleCount,
        quality
      );
      return selectSnapshot.get(energyAccumulator.intervalStart);
    }

    function roughDayRange(day) {
      const center = new Date(`${day}T12:00:00Z`).getTime();
      return {
        from: new Date(center - 36 * HOUR_MS).toISOString(),
        to: new Date(center + 36 * HOUR_MS).toISOString(),
      };
    }

    function calculateDailyReconciliation(day) {
      persistEnergyAccumulator();
      const readings = selectSolarEdgeReadingsForDay.all(day);
      if (!readings.length) return null;
      const roughRange = roughDayRange(day);
      const snapshots = querySnapshots.all(roughRange.from, roughRange.to)
        .filter((row) => localDay(row.interval_start) === day);
      const tariffs = queryTariffs.all(roughRange.from, roughRange.to)
        .filter((row) => localDay(row.valid_from) === day);
      const integrated = snapshots.reduce((totals, row) => ({
        gridImportKWh: totals.gridImportKWh + finite(row.grid_import_kwh),
        gridExportKWh: totals.gridExportKWh + finite(row.grid_export_kwh),
        gridImportCostEur: totals.gridImportCostEur + finite(row.energy_cost_eur),
      }), { gridImportKWh: 0, gridExportKWh: 0, gridImportCostEur: 0 });
      const tariffValues = tariffs.map((row) => Number(row.price_ct_kwh)).filter(Number.isFinite);
      const averageTariffCtPerKWh = integrated.gridImportKWh > 0
        ? integrated.gridImportCostEur / integrated.gridImportKWh * 100
        : tariffValues.length
          ? tariffValues.reduce((sum, value) => sum + value, 0) / tariffValues.length
          : null;
      const result = reconcileSolarEdgeDailyEnergy({
        day,
        firstReading: readings[0],
        previousReading: selectPreviousSolarEdgeReading.get(day),
        lastReading: readings.at(-1),
        integrated,
        averageTariffCtPerKWh,
      });
      upsertDailyReconciliation.run(
        result.day,
        result.quality,
        result.baselineKind,
        result.baselineObservedAt,
        result.latestObservedAt,
        result.meterImportKWh,
        result.meterExportKWh,
        result.integratedImportKWh,
        result.integratedExportKWh,
        result.importDifferenceKWh,
        result.exportDifferenceKWh,
        result.fallbackImportKWh,
        result.fallbackExportKWh,
        result.averageTariffCtPerKWh,
        result.integratedImportCostEur,
        result.importComparisonCostEur,
        result.exportComparisonValueEur,
        new Date().toISOString()
      );
      return result;
    }

    function reconciliationFromRow(row) {
      if (!row) return null;
      return {
        day: row.day,
        quality: row.quality,
        baselineKind: row.baseline_kind,
        baselineObservedAt: row.baseline_observed_at,
        latestObservedAt: row.latest_observed_at,
        meterImportKWh: row.meter_import_kwh,
        meterExportKWh: row.meter_export_kwh,
        integratedImportKWh: row.integrated_import_kwh,
        integratedExportKWh: row.integrated_export_kwh,
        importDifferenceKWh: row.import_difference_kwh,
        exportDifferenceKWh: row.export_difference_kwh,
        fallbackImportKWh: row.fallback_import_kwh,
        fallbackExportKWh: row.fallback_export_kwh,
        averageTariffCtPerKWh: row.average_tariff_ct_kwh,
        integratedImportCostEur: row.integrated_import_cost_eur,
        importComparisonCostEur: row.import_comparison_cost_eur,
        exportComparisonValueEur: row.export_comparison_value_eur,
        calculatedAt: row.calculated_at,
      };
    }

    function periodRange(period, anchorValue) {
      const anchor = new Date(anchorValue || Date.now());
      const year = anchor.getFullYear();
      const month = anchor.getMonth();
      const day = anchor.getDate();
      let from;
      let to;
      if (period === "day") {
        from = new Date(year, month, day);
        to = new Date(year, month, day + 1);
      } else if (period === "year") {
        from = new Date(year, 0, 1);
        to = new Date(year + 1, 0, 1);
      } else {
        from = new Date(year, month, 1);
        to = new Date(year, month + 1, 1);
      }
      return { from: from.toISOString(), to: to.toISOString() };
    }

    function buildDashboard(request = {}) {
      persistEnergyAccumulator();
      const period = ["day", "month", "year"].includes(request.period) ? request.period : "month";
      const range = periodRange(period, request.anchor);
      const snapshots = querySnapshots.all(range.from, range.to);
      const tariffRows = queryTariffs.all(range.from, range.to);
      const keyFormatter = period === "day"
        ? new Intl.DateTimeFormat("de-AT", { timeZone: "Europe/Vienna", hour: "2-digit", minute: "2-digit" })
        : period === "year"
          ? new Intl.DateTimeFormat("de-AT", { timeZone: "Europe/Vienna", month: "long" })
          : new Intl.DateTimeFormat("de-AT", { timeZone: "Europe/Vienna", weekday: "short", day: "2-digit", month: "2-digit" });
      const groups = new Map();
      const groupKey = (intervalStart) => period === "day"
        ? intervalStart
        : period === "year"
          ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna", year: "numeric", month: "2-digit" }).format(new Date(intervalStart))
          : new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(intervalStart));
      const getGroup = (intervalStart) => {
        const key = groupKey(intervalStart);
        const group = groups.get(key) || {
          key,
          label: keyFormatter.format(new Date(intervalStart)),
          pvEnergyKWh: 0,
          houseConsumptionKWh: 0,
          gridImportKWh: 0,
          gridExportKWh: 0,
          energyCostEur: 0,
          gridImportCostEur: 0,
          temperatures: [],
          sunshine: [],
          offlineCount: 0,
          weatherOfflineCount: 0,
          energyOfflineCount: 0,
          tariffOfflineCount: 0,
          recordedHourCount: 0,
          hours: [],
        };
        groups.set(key, group);
        return group;
      };
      for (const row of snapshots) {
        const group = getGroup(row.interval_start);
        const tariffCtPerKWh = Number(row.market_price_ct_kwh);
        const houseConsumptionKWh = finite(row.house_consumption_kwh);
        const consumptionCostEur = Number.isFinite(tariffCtPerKWh)
          ? houseConsumptionKWh * (tariffCtPerKWh / 100)
          : null;
        group.pvEnergyKWh += finite(row.pv_energy_kwh);
        group.houseConsumptionKWh += houseConsumptionKWh;
        group.gridImportKWh += finite(row.grid_import_kwh);
        group.gridExportKWh += finite(row.grid_export_kwh);
        group.energyCostEur += finite(consumptionCostEur);
        group.gridImportCostEur += finite(row.energy_cost_eur);
        group.recordedHourCount += 1;
        if (Number.isFinite(Number(row.temperature_c))) group.temperatures.push(Number(row.temperature_c));
        if (Number.isFinite(Number(row.sunshine_percent))) group.sunshine.push(Number(row.sunshine_percent));
        if (row.data_quality !== "complete") group.offlineCount += 1;
        if (row.weather_status !== "online") group.weatherOfflineCount += 1;
        if (row.energy_status !== "online") group.energyOfflineCount += 1;
        if (row.tariff_status !== "online") group.tariffOfflineCount += 1;
        group.hours.push({
          intervalStart: row.interval_start,
          time: new Intl.DateTimeFormat("de-AT", { timeZone: "Europe/Vienna", hour: "2-digit", minute: "2-digit" }).format(new Date(row.interval_start)),
          gridImportKWh: finite(row.grid_import_kwh),
          houseConsumptionKWh,
          energyCostEur: consumptionCostEur,
          gridImportCostEur: finite(row.energy_cost_eur),
          tariffCtPerKWh,
          temperatureC: row.temperature_c,
          status: row.data_quality,
          weatherStatus: row.weather_status,
          energyStatus: row.energy_status,
          tariffStatus: row.tariff_status,
          recorded: true,
        });
      }
      for (const tariffRow of tariffRows) {
        const group = getGroup(tariffRow.valid_from);
        const existingHour = group.hours.find((hour) => hour.intervalStart === tariffRow.valid_from);
        if (existingHour) {
          if (!Number.isFinite(Number(existingHour.tariffCtPerKWh))) {
            existingHour.tariffCtPerKWh = Number(tariffRow.price_ct_kwh);
          }
          continue;
        }
        group.hours.push({
          intervalStart: tariffRow.valid_from,
          time: new Intl.DateTimeFormat("de-AT", { timeZone: "Europe/Vienna", hour: "2-digit", minute: "2-digit" }).format(new Date(tariffRow.valid_from)),
          gridImportKWh: null,
          houseConsumptionKWh: null,
          energyCostEur: null,
          gridImportCostEur: null,
          tariffCtPerKWh: Number(tariffRow.price_ct_kwh),
          temperatureC: null,
          status: new Date(tariffRow.valid_from).getTime() > Date.now() ? "geplant" : "keine Messdaten",
          weatherStatus: "ausstehend",
          energyStatus: "ausstehend",
          tariffStatus: "online",
          recorded: false,
        });
      }
      const reconciliations = selectDailyReconciliations.all()
        .filter((row) => {
          const instant = new Date(`${row.day}T12:00:00Z`).getTime();
          return instant >= new Date(range.from).getTime() - DAY_MS && instant < new Date(range.to).getTime() + DAY_MS;
        })
        .map(reconciliationFromRow);
      const reconciliationByDay = new Map(reconciliations.map((item) => [item.day, item]));
      const rows = [...groups.values()].map((group) => ({
        ...group,
        reconciliation: period === "month" ? reconciliationByDay.get(group.key) || null : null,
        hours: group.hours.sort((left, right) => left.intervalStart.localeCompare(right.intervalStart)),
        averageTemperatureC: group.temperatures.length
          ? group.temperatures.reduce((sum, value) => sum + value, 0) / group.temperatures.length
          : null,
        averageSunshinePercent: group.sunshine.length
          ? group.sunshine.reduce((sum, value) => sum + value, 0) / group.sunshine.length
          : null,
        temperatures: undefined,
        sunshine: undefined,
      }));
      const diagnostics = ["energy", "solaredgeMeter", "weather", "tariff"].map((source) => sourceStatus(source));
      const tariff = diagnostics.find((item) => item.source === "tariff");
      const energy = diagnostics.find((item) => item.source === "energy");
      const priceCtPerKWh = tariff?.payload?.priceCtPerKWh ?? null;
      const gridImportWatt = finite(energy?.payload?.GridImportWatt);
      return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        period,
        range,
        totals: {
          pvEnergyKWh: rows.reduce((sum, row) => sum + row.pvEnergyKWh, 0),
          houseConsumptionKWh: rows.reduce((sum, row) => sum + row.houseConsumptionKWh, 0),
          gridImportKWh: rows.reduce((sum, row) => sum + row.gridImportKWh, 0),
          gridExportKWh: rows.reduce((sum, row) => sum + row.gridExportKWh, 0),
          energyCostEur: rows.reduce((sum, row) => sum + row.energyCostEur, 0),
          gridImportCostEur: rows.reduce((sum, row) => sum + row.gridImportCostEur, 0),
          meterImportKWh: reconciliations.reduce((sum, row) => sum + finite(row.meterImportKWh), 0),
          meterExportKWh: reconciliations.reduce((sum, row) => sum + finite(row.meterExportKWh), 0),
          fallbackImportKWh: reconciliations.reduce((sum, row) => sum + finite(row.fallbackImportKWh), 0),
          fallbackExportKWh: reconciliations.reduce((sum, row) => sum + finite(row.fallbackExportKWh), 0),
          importComparisonCostEur: reconciliations.reduce((sum, row) => sum + finite(row.importComparisonCostEur), 0),
          exportComparisonValueEur: reconciliations.reduce((sum, row) => sum + finite(row.exportComparisonValueEur), 0),
        },
        live: {
          priceCtPerKWh,
          gridImportWatt,
          houseConsumptionWatt: finite(energy?.payload?.HouseConsumptionWatt),
          pvPowerWatt: finite(energy?.payload?.PvPowerWatt),
          costPerHourEur: priceCtPerKWh === null ? null : (gridImportWatt / 1000) * (priceCtPerKWh / 100),
        },
        rows,
        reconciliations,
        latestReconciliation: reconciliations.at(-1) || null,
        diagnostics: diagnostics.map(({ payload, ...item }) => item),
        databasePath,
      };
    }

    function createBackup() {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const target = path.join(backupDirectory, `home-automation-${stamp}.sqlite`);
      database.prepare("VACUUM INTO ?").run(target);
      const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      for (const entry of fs.readdirSync(backupDirectory)) {
        const candidate = path.join(backupDirectory, entry);
        if (entry.endsWith(".sqlite") && fs.statSync(candidate).mtimeMs < cutoff) fs.rmSync(candidate);
      }
      return target;
    }

    node.status({ fill: "green", shape: "dot", text: "SQLite bereit" });
    node.on("input", (msg, send, done) => {
      try {
        if (msg.topic === "history/backup") {
          const backupPath = createBackup();
          msg.history = { action: "backup", databasePath, backupPath };
          node.status({ fill: "green", shape: "dot", text: "Backup erstellt" });
          send(msg);
          done();
          return;
        }

        if (msg.topic === "history/query") {
          const request = msg.payload || {};
          const rows = queryEvents.all(request.from || null, request.to || null, request.topic || null, Math.min(Number(request.limit) || 500, 5000));
          msg.payload = rows.map((row) => ({ ...row, payload: JSON.parse(row.payload_json) }));
          msg.history = { action: "query", rowCount: msg.payload.length, databasePath };
          send(msg);
          done();
          return;
        }

        if (msg.topic === "history/dashboard") {
          msg.payload = buildDashboard(msg.payload || {});
          msg.topic = "history/dashboard/result";
          msg.history = { action: "dashboard", rowCount: msg.payload.rows.length, databasePath };
          node.status({ fill: "green", shape: "dot", text: "Dashboard aktualisiert" });
          send(msg);
          done();
          return;
        }

        if (msg.topic === "history/hourly-snapshot") {
          const snapshot = persistEnergyAccumulator();
          msg.payload = snapshot;
          msg.history = { action: "hourly-snapshot", intervalStart: snapshot?.interval_start || null, databasePath };
          node.status({ fill: snapshot ? "green" : "yellow", shape: snapshot ? "dot" : "ring", text: snapshot ? "Stundendaten aktualisiert" : "Noch keine Energiedaten" });
          send(msg);
          done();
          return;
        }

        const payload = sanitize(msg.payload);
        const observedAt = payload?.timestamp || payload?.fetchedAt || payload?.validFrom || new Date().toISOString();
        const receivedAt = new Date().toISOString();

        if (msg.topic === "history/source/energy") {
          const energyState = integrateEnergy(payload || {});
          const errorText = payload?.OfflineReason || payload?.ErrorReason || "";
          const stateChanged = lastEnergyOnlineState !== energyState.online;
          if (stateChanged || Date.now() - lastEnergySourceWriteMs >= 60_000) {
            storeSource("energy", payload, energyState.observedAt, energyState.online, errorText);
            lastEnergySourceWriteMs = Date.now();
          }
          lastEnergyOnlineState = energyState.online;
          msg.history = { action: "source", source: "energy", status: energyState.online ? "online" : "offline", databasePath };
          node.status({ fill: energyState.online ? "green" : "red", shape: energyState.online ? "dot" : "ring", text: `Energie ${energyState.online ? "online" : "offline"}` });
          send(msg);
          done();
          return;
        }

        if (msg.topic === "history/source/solaredge-meter-totals") {
          const observedAt = asIso(payload?.observedAt || payload?.timestamp);
          const importTotal = Number(payload?.gridImportTotalKWh);
          const exportTotal = Number(payload?.gridExportTotalKWh);
          const scaleFactor = Number(payload?.scaleFactor);
          if (!Number.isFinite(importTotal) || !Number.isFinite(exportTotal) || importTotal < 0 || exportTotal < 0) {
            throw new Error("Ungültige SolarEdge-Gesamtenergie");
          }
          const day = localDay(observedAt);
          insertSolarEdgeReading.run(observedAt, day, importTotal, exportTotal, scaleFactor, JSON.stringify(payload));
          storeSource("solaredgeMeter", payload, observedAt, true);
          const reconciliation = calculateDailyReconciliation(day);
          const previousDay = localDay(new Date(observedAt).getTime() - DAY_MS);
          if (previousDay !== day && selectSolarEdgeReadingsForDay.all(previousDay).length) calculateDailyReconciliation(previousDay);
          msg.topic = "history/solaredge-meter-totals/result";
          msg.payload = reconciliation;
          msg.history = { action: "daily-energy-reconciliation", day, databasePath };
          node.status({ fill: "green", shape: "dot", text: `SolarEdge-Tagesanker ${day}` });
          send(msg);
          done();
          return;
        }

        if (msg.topic === "history/source/weather") {
          const online = payload?.ActiveFlag === true && payload?.WeatherServiceStatusText !== "NICHT AKTIV";
          storeSource("weather", payload, asIso(payload?.UpdatedAt), online, payload?.ErrorReason);
          msg.history = { action: "source", source: "weather", status: online ? "online" : "offline", databasePath };
          node.status({ fill: online ? "green" : "red", shape: online ? "dot" : "ring", text: `Wetter ${online ? "online" : "offline"}` });
          send(msg);
          done();
          return;
        }

        const result = insertEvent.run(
          asIso(observedAt),
          receivedAt,
          String(msg.source || "node-red"),
          String(msg.topic || "telemetry/unknown"),
          String(msg.eventType || "telemetry"),
          JSON.stringify(payload)
        );

        if (msg.topic === "aWATTar/tariff/current" && payload?.validFrom && payload?.validUntil) {
          const slots = Array.isArray(payload.slots) && payload.slots.length ? payload.slots : [payload];
          for (const slot of slots) {
            if (!slot?.validFrom || !slot?.validUntil || !Number.isFinite(Number(slot.priceCtPerKWh))) continue;
            insertTariff.run(
              slot.validFrom,
              slot.validUntil,
              payload.provider || "aWATTar",
              slot.marketPriceEurPerMWh,
              slot.priceCtPerKWh,
              payload.fetchedAt || receivedAt,
              JSON.stringify(slot)
            );
          }
          storeSource("tariff", payload, asIso(payload.fetchedAt || payload.validFrom), true);
        }

        msg.history = { action: "stored", eventId: Number(result.lastInsertRowid), databasePath };
        node.status({ fill: "green", shape: "dot", text: "Ereignis gespeichert" });
        send(msg);
        done();
      } catch (error) {
        node.status({ fill: "red", shape: "ring", text: "SQLite-Fehler" });
        done(error);
      }
    });
    node.on("close", () => {
      persistEnergyAccumulator();
      database.close();
    });
  }

  RED.nodes.registerType("home-automation-history", HistoryStoreNode);
};
