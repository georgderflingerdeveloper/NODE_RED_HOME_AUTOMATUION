import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const templatePath = new URL(
  "../flow-src/flows/kosten--kosten_flow/templates/cost-dashboard.html",
  import.meta.url,
);
const nodesPath = new URL(
  "../flow-src/flows/kosten--kosten_flow/nodes.json",
  import.meta.url,
);

test("Kosten-Dashboard berechnet seine Größe nach Verbindung und Tab-Wechsel neu", () => {
  const template = fs.readFileSync(templatePath, "utf8");
  const nodes = JSON.parse(fs.readFileSync(nodesPath, "utf8"));
  const uiControl = nodes.find((node) => node.id === "kosten_dashboard_ui_control");

  assert.ok(uiControl);
  assert.equal(uiControl.type, "ui_ui_control");
  assert.deepEqual(uiControl.wires, [["kosten_dashboard_template"]]);
  assert.match(template, /msg\.payload === "connect"/);
  assert.match(template, /msg\.name === "KOSTEN"/);
  assert.match(template, /window\.dispatchEvent\(new Event\("resize"\)\)/);
  assert.match(template, /\[0, 100, 350, 800\]/);
});

test("Kosten-Dashboard nutzt die verfügbare Höhe und Breite", () => {
  const template = fs.readFileSync(templatePath, "utf8");

  assert.match(template, /cost-dashboard-group/);
  assert.match(template, /width:calc\(100vw - 220px\)/);
  assert.match(template, /min-height:calc\(100dvh - 165px\)/);
  assert.match(template, /closest\("\.nr-dashboard-cardcontainer"\)/);
  assert.match(template, /closest\("\.nr-dashboard-cardpanel"\)/);
});

test("Kosten-Dashboard besitzt eine mobile Einspaltenansicht", () => {
  const template = fs.readFileSync(templatePath, "utf8");

  assert.match(template, /@media\(max-width:600px\)/);
  assert.match(template, /\.cost-head \{ grid-template-columns:1fr/);
  assert.match(template, /\.cost-table thead \{ display:none/);
  assert.match(template, /\.cost-row td:nth-child\(8\)::before \{ content:"Daten"/);
  assert.match(template, /\.cost-hour-grid \{ grid-template-columns:1fr/);
});

test("Kosten-Dashboard zeigt den SolarEdge-Tagesanker und lädt ihn nach Zählerwerten neu", () => {
  const template = fs.readFileSync(templatePath, "utf8");

  assert.match(template, /SolarEdge-Tagesanker/);
  assert.match(template, /meterImportKWh/);
  assert.match(template, /meterExportKWh/);
  assert.match(template, /fallbackImportKWh/);
  assert.match(template, /importComparisonCostEur/);
  assert.match(template, /exportComparisonValueEur/);
  assert.match(template, /meterPvProductionKWh/);
  assert.match(template, /meterHouseConsumptionKWh/);
  assert.match(template, /fallbackPvProductionKWh/);
  assert.match(template, /fallbackHouseConsumptionKWh/);
  assert.match(template, /Initialisierung: Der SolarEdge-Zähler/);
  assert.match(template, /unterschiedliche Zeitfenster/);
  assert.match(template, /history\/solaredge-meter-totals\/result/);
});

test("Kosten-Dashboard zeigt die Hausleistung und trennt Verbrauchswert von Netzkosten", () => {
  const template = fs.readFileSync(templatePath, "utf8");

  assert.match(template, /Hausleistung jetzt/);
  assert.match(template, /view\.history\.live\.houseConsumptionWatt/);
  assert.match(template, /view\.history\.live\.energyValuePerHourEur/);
  assert.match(template, /view\.history\.live\.gridImportCostPerHourEur/);
});

test("Verbrauchswert zeigt den ausgewählten Zeitraum mit Von- und Bis-Datum", () => {
  const template = fs.readFileSync(templatePath, "utf8");

  assert.match(template, /scope\.costPeriodDateRange = function\(history\)/);
  assert.match(template, /history\.range\.from/);
  assert.match(template, /history\.range\.to/);
  assert.match(template, /exclusiveTo\.getTime\(\) - 1/);
  assert.match(template, /timeZone: "Europe\/Vienna"/);
  assert.match(template, /"von " \+ formatter\.format\(from\) \+ " bis "/);
  assert.match(template, /\{\{costPeriodDateRange\(view\.history\)\}\}/);
});

test("Kosten-Dashboard hält geöffnete Detailzeilen bei Aktualisierungen offen", () => {
  const template = fs.readFileSync(templatePath, "utf8");

  assert.match(template, /scope\.expandedCostRows = scope\.expandedCostRows \|\| \{\}/);
  assert.match(template, /restoreExpandedCostRows\(msg\.payload\)/);
  assert.match(template, /scope\.expandedCostRows\[String\(row\.key\)\]/);
  assert.match(template, /ng-click="toggleCostRow\(row\)"/);
});

test("Kosten-Dashboard markiert die aktuelle Stunde und Online-Zustände hellgrün", () => {
  const template = fs.readFileSync(templatePath, "utf8");

  assert.match(template, /scope\.isCurrentCostHour = function\(hour\)/);
  assert.match(template, /intervalStart <= now && now < intervalStart \+ 60 \* 60 \* 1000/);
  assert.match(template, /'cost-hour-current':isCurrentCostHour\(hour\)/);
  assert.match(template, /background:#d7f5df/);
  assert.match(template, /\.cost-online \{ color:#8df0ae; font-weight:800; \}/);
  assert.match(template, /'cost-online':hour\.energyStatus==='online'/);
  assert.match(template, /'cost-online':hour\.weatherStatus==='online'/);
  assert.match(template, /'cost-online':hour\.tariffStatus==='online'/);
});

test("Hausleistungsanzeige besitzt einen begrenzten Grün-Gelb-Rot-Verlauf bis 10 kW", () => {
  const template = fs.readFileSync(templatePath, "utf8");

  assert.match(template, /scope\.housePowerStyle = function\(powerWatt\)/);
  assert.match(template, /var maximumWatt = 10000/);
  assert.match(template, /Math\.min\(maximumWatt, Math\.max\(0,/);
  assert.match(template, /var hue = Math\.round\(120 \* \(1 - ratio\)\)/);
  assert.match(template, /linear-gradient\(135deg,hsl/);
  assert.match(template, /ng-style="housePowerStyle\(view\.history\.live\.houseConsumptionWatt\)"/);
});

test("Kosten-Dashboard zeigt den provider-neutralen Prognosevertrag", () => {
  const template = fs.readFileSync(templatePath, "utf8");
  const nodes = JSON.parse(fs.readFileSync(nodesPath, "utf8"));
  const templateNode = nodes.find((node) => node.id === "kosten_dashboard_template");
  const router = nodes.find((node) => node.id === "kosten_dashboard_request_router");

  assert.match(template, /PROGNOSE · Anbieterunabhängige Automationsdaten/);
  assert.match(template, /ProviderOnline/);
  assert.match(template, /EstimatedCostCheap/);
  assert.match(template, /EstimatedCostExpensive/);
  assert.match(template, /NotAvailable/);
  assert.match(template, /energy\/forecast\/read/);
  assert.match(template, /energy\/forecast\/result/);
  assert.deepEqual(templateNode.wires, [["kosten_dashboard_request_router"]]);
  assert.deepEqual(router.wires, [["kosten_history_query_out"], ["kosten_forecast_query_out"]]);
});
