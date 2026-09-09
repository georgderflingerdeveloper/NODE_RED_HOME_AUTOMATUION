const DAY_MS = 24 * 60 * 60 * 1000;

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 6) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function localDay(value, timeZone = "Europe/Vienna") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function nextDay(day) {
  const date = new Date(`${day}T12:00:00Z`);
  return localDay(date.getTime() + DAY_MS, "UTC");
}

function previousDay(day) {
  const date = new Date(`${day}T12:00:00Z`);
  return localDay(date.getTime() - DAY_MS, "UTC");
}

function localHour(value, timeZone = "Europe/Vienna") {
  return Number(new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value)));
}

function reconcileSolarEdgeDailyEnergy({
  day,
  firstReading,
  previousReading,
  lastReading,
  integrated = {},
  averageTariffCtPerKWh = null,
}) {
  const baseline = previousReading || firstReading || null;
  const latest = lastReading || null;
  const baselineKind = previousReading ? "previous-day-reading" : firstReading ? "first-reading-of-day" : "missing";
  const importStart = finiteOrNull(baseline?.grid_import_total_kwh);
  const importEnd = finiteOrNull(latest?.grid_import_total_kwh);
  const exportStart = finiteOrNull(baseline?.grid_export_total_kwh);
  const exportEnd = finiteOrNull(latest?.grid_export_total_kwh);
  const meterImportKWh = importStart === null || importEnd === null ? null : importEnd - importStart;
  const meterExportKWh = exportStart === null || exportEnd === null ? null : exportEnd - exportStart;
  const countersValid = meterImportKWh !== null && meterExportKWh !== null
    && meterImportKWh >= 0 && meterExportKWh >= 0;
  const integratedImportKWh = Math.max(0, finiteOrNull(integrated.gridImportKWh) || 0);
  const integratedExportKWh = Math.max(0, finiteOrNull(integrated.gridExportKWh) || 0);
  const integratedImportCostEur = Math.max(0, finiteOrNull(integrated.gridImportCostEur) || 0);
  const tariff = finiteOrNull(averageTariffCtPerKWh);
  const importDifferenceKWh = countersValid ? meterImportKWh - integratedImportKWh : null;
  const exportDifferenceKWh = countersValid ? meterExportKWh - integratedExportKWh : null;
  const importComparisonCostEur = countersValid && tariff !== null
    ? integratedImportCostEur + (importDifferenceKWh * tariff / 100)
    : null;
  const exportComparisonValueEur = countersValid && tariff !== null
    ? meterExportKWh * tariff / 100
    : null;
  const boundaryAgeMinutes = baseline && latest
    ? Math.max(0, (new Date(latest.observed_at).getTime() - new Date(baseline.observed_at).getTime()) / 60000)
    : null;

  const previousReadingAtBoundary = previousReading
    && localDay(previousReading.observed_at) === previousDay(day)
    && localHour(previousReading.observed_at) === 23;
  let quality = "missing";
  if (countersValid) {
    quality = previousReadingAtBoundary ? "anchored" : previousReading ? "estimated-boundary" : "partial-day";
  }
  if ((meterImportKWh !== null && meterImportKWh < 0) || (meterExportKWh !== null && meterExportKWh < 0)) {
    quality = "counter-reset";
  }

  return {
    schemaVersion: 1,
    day,
    quality,
    baselineKind,
    baselineObservedAt: baseline?.observed_at || null,
    latestObservedAt: latest?.observed_at || null,
    boundaryAgeMinutes: round(boundaryAgeMinutes, 1),
    meterImportKWh: countersValid ? round(meterImportKWh) : null,
    meterExportKWh: countersValid ? round(meterExportKWh) : null,
    integratedImportKWh: round(integratedImportKWh),
    integratedExportKWh: round(integratedExportKWh),
    importDifferenceKWh: round(importDifferenceKWh),
    exportDifferenceKWh: round(exportDifferenceKWh),
    fallbackImportKWh: round(importDifferenceKWh === null ? null : Math.max(0, importDifferenceKWh)),
    fallbackExportKWh: round(exportDifferenceKWh === null ? null : Math.max(0, exportDifferenceKWh)),
    averageTariffCtPerKWh: round(tariff),
    integratedImportCostEur: round(integratedImportCostEur),
    importComparisonCostEur: round(importComparisonCostEur),
    exportComparisonValueEur: round(exportComparisonValueEur),
  };
}

module.exports = { localDay, nextDay, previousDay, reconcileSolarEdgeDailyEnergy };
