// Ein Tag in Millisekunden; wird für die Berechnung von Vor- und Folge-Tagen
// verwendet, wenn Zeiträume über Tage hinweg verglichen werden.
const DAY_MS = 24 * 60 * 60 * 1000;

// Konvertiert einen Wert nur dann in eine Number, wenn er tatsächlich finite ist.
// Andernfalls wird null zurückgegeben, damit nachgelagerte Berechnungen sauber
// mit fehlenden Werten umgehen können.
function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// Rundet Zahlen auf eine feste Anzahl Nachkommastellen und liefert null für
// ungültige Werte. Dadurch bleiben die Ergebnisse konsistent und gut lesbar.
function round(value, digits = 6) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

// Wandelt einen Zeitstempel in das lokale Tagesdatum im gewünschten Zeitbereich
// um, z. B. für Vergleiche zwischen Tagesgrenzen.
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

// Berechnet den nächsten Tag eines Datums, basierend auf einem UTC-Tag-Mittelpunkt.
function nextDay(day) {
  const date = new Date(`${day}T12:00:00Z`);
  return localDay(date.getTime() + DAY_MS, "UTC");
}

// Berechnet den vorherigen Tag eines Datums analog zum nächstliegenden Tag.
function previousDay(day) {
  const date = new Date(`${day}T12:00:00Z`);
  return localDay(date.getTime() - DAY_MS, "UTC");
}

// Extrahiert die UTC-Stunde eines Zeitstempels in der gewünschten Zeitzone.
function localHour(value, timeZone = "Europe/Vienna") {
  return Number(new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value)));
}

// Hauptlogik zur Konsistenzbildung von SolarEdge-Tageswerten. Diese Funktion
// vergleicht Zählerstände, Integrationswerte und Produktionsdaten und bildet
// daraus einen sauberen Tageswert mit Qualitätsmerkmalen.
function reconcileSolarEdgeDailyEnergy({
  day,
  firstReading,
  previousReading,
  lastReading,
  firstProductionReading,
  previousProductionReading,
  lastProductionReading,
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
  const productionBaseline = previousProductionReading || firstProductionReading || null;
  const productionStart = finiteOrNull(productionBaseline?.pv_production_total_kwh);
  const productionEnd = finiteOrNull(lastProductionReading?.pv_production_total_kwh);
  const meterPvProductionKWh = productionStart === null || productionEnd === null
    ? null
    : productionEnd - productionStart;
  const productionCounterValid = meterPvProductionKWh !== null && meterPvProductionKWh >= 0;
  const integratedImportKWh = Math.max(0, finiteOrNull(integrated.gridImportKWh) || 0);
  const integratedExportKWh = Math.max(0, finiteOrNull(integrated.gridExportKWh) || 0);
  const integratedPvProductionKWh = Math.max(0, finiteOrNull(integrated.pvProductionKWh) || 0);
  const integratedHouseConsumptionKWh = Math.max(0, finiteOrNull(integrated.houseConsumptionKWh) || 0);
  const integratedImportCostEur = Math.max(0, finiteOrNull(integrated.gridImportCostEur) || 0);
  const tariff = finiteOrNull(averageTariffCtPerKWh);
  // On installation day the same-day meter delta and the integration since
  // midnight cover different time windows. Compare only with a prior boundary.
  const comparisonAvailable = countersValid && Boolean(previousReading);
  const energyBalanceAvailable = comparisonAvailable
    && productionCounterValid
    && Boolean(previousProductionReading);
  const meterHouseConsumptionKWh = energyBalanceAvailable
    ? Math.max(0, meterPvProductionKWh + meterImportKWh - meterExportKWh)
    : null;
  const importDifferenceKWh = comparisonAvailable ? meterImportKWh - integratedImportKWh : null;
  const exportDifferenceKWh = comparisonAvailable ? meterExportKWh - integratedExportKWh : null;
  const importComparisonCostEur = comparisonAvailable && tariff !== null
    ? integratedImportCostEur + (importDifferenceKWh * tariff / 100)
    : null;
  const exportComparisonValueEur = comparisonAvailable && tariff !== null
    ? meterExportKWh * tariff / 100
    : null;
  const pvDifferenceKWh = energyBalanceAvailable
    ? meterPvProductionKWh - integratedPvProductionKWh
    : null;
  const houseDifferenceKWh = energyBalanceAvailable
    ? meterHouseConsumptionKWh - integratedHouseConsumptionKWh
    : null;
  const boundaryAgeMinutes = baseline && latest
    ? Math.max(0, (new Date(latest.observed_at).getTime() - new Date(baseline.observed_at).getTime()) / 60000)
    : null;

  const previousReadingAtBoundary = previousReading
    && localDay(previousReading.observed_at) === previousDay(day)
    && localHour(previousReading.observed_at) === 23;
  const previousProductionAtBoundary = previousProductionReading
    && localDay(previousProductionReading.observed_at) === previousDay(day)
    && localHour(previousProductionReading.observed_at) === 23;
  let quality = "missing";
  if (countersValid) {
    quality = energyBalanceAvailable
      ? previousReadingAtBoundary && previousProductionAtBoundary ? "anchored" : "estimated-boundary"
      : comparisonAvailable ? "grid-only" : "partial-day";
  }
  if ((meterImportKWh !== null && meterImportKWh < 0) || (meterExportKWh !== null && meterExportKWh < 0)) {
    quality = "counter-reset";
  }

  return {
    schemaVersion: 1,
    day,
    quality,
    comparisonAvailable,
    energyBalanceAvailable,
    baselineKind,
    baselineObservedAt: baseline?.observed_at || null,
    latestObservedAt: latest?.observed_at || null,
    productionBaselineObservedAt: productionBaseline?.observed_at || null,
    productionLatestObservedAt: lastProductionReading?.observed_at || null,
    boundaryAgeMinutes: round(boundaryAgeMinutes, 1),
    meterImportKWh: countersValid ? round(meterImportKWh) : null,
    meterExportKWh: countersValid ? round(meterExportKWh) : null,
    meterPvProductionKWh: productionCounterValid ? round(meterPvProductionKWh) : null,
    meterHouseConsumptionKWh: round(meterHouseConsumptionKWh),
    integratedImportKWh: round(integratedImportKWh),
    integratedExportKWh: round(integratedExportKWh),
    integratedPvProductionKWh: round(integratedPvProductionKWh),
    integratedHouseConsumptionKWh: round(integratedHouseConsumptionKWh),
    importDifferenceKWh: round(importDifferenceKWh),
    exportDifferenceKWh: round(exportDifferenceKWh),
    fallbackImportKWh: round(importDifferenceKWh === null ? null : Math.max(0, importDifferenceKWh)),
    fallbackExportKWh: round(exportDifferenceKWh === null ? null : Math.max(0, exportDifferenceKWh)),
    pvDifferenceKWh: round(pvDifferenceKWh),
    houseDifferenceKWh: round(houseDifferenceKWh),
    fallbackPvProductionKWh: round(pvDifferenceKWh === null ? null : Math.max(0, pvDifferenceKWh)),
    fallbackHouseConsumptionKWh: round(houseDifferenceKWh === null ? null : Math.max(0, houseDifferenceKWh)),
    averageTariffCtPerKWh: round(tariff),
    integratedImportCostEur: round(integratedImportCostEur),
    importComparisonCostEur: round(importComparisonCostEur),
    exportComparisonValueEur: round(exportComparisonValueEur),
  };
}

module.exports = { localDay, nextDay, previousDay, reconcileSolarEdgeDailyEnergy };
