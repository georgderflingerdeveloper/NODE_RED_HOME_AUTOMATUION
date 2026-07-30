// name: GetExcessPower
// nodeId: d22dd481e7e81932
// flow: SOLAR_DASHBOARD
// === Konfiguration ===
// Am installierten SolarEdge-Meter: Export positiv, Import negativ
const IMPORT_POS_EXPORT_NEG = false;

// Eingänge prüfen
const PvPowerWatt = Number(msg.payload?.PvPowerWatt);
const GridPowerWatt = Number(msg.payload?.GridPowerWatt);
if (!Number.isFinite(PvPowerWatt) || !Number.isFinite(GridPowerWatt)) { return null; }

// Hauslast berücksichtigt beide Netzrichtungen:
// PV + Netzbezug - Einspeisung = aktuelle Gesamtleistungsaufnahme des Hauses.
const GridImportWatt = Math.max(0, -GridPowerWatt);
const FeedInWatt = Math.max(0, GridPowerWatt);
const HouseConsumptionWatt = Math.max(0, PvPowerWatt + GridImportWatt - FeedInWatt);
const solarEdgeStatus = global.get("SolarEdgeData") || {};

let ExcessPowerWatt;
if (IMPORT_POS_EXPORT_NEG) {
    // Export ist negativ → Überschuss ist der negative Anteil
    ExcessPowerWatt = Math.max(0, -GridPowerWatt);
} else {
    // Export ist positiv → Überschuss ist der positive Anteil
    ExcessPowerWatt = Math.max(0, GridPowerWatt);
}

// Energieintegration (Wh)
const nowMs = Date.now();
const lastMs = context.get('lastMs') || nowMs;
const dt_h = (nowMs - lastMs) / 3600000; // Stunden

const lastExcessPowerWatt = context.get('lastExcessPowerWatt');
let ExcessEnergyWhTotal = context.get('ExcessEnergyWhTotal') || 0;

// Tagesreset
const lastDay = context.get('lastDay') || new Date(nowMs).toDateString();
const today = new Date(nowMs).toDateString();
let ExcessEnergyWhToday = context.get('ExcessEnergyWhToday') || 0;
if (today !== lastDay) {
    ExcessEnergyWhToday = 0;
}

// Integration per Trapezregel
if (Number.isFinite(lastExcessPowerWatt)) {
    const dWh = ((lastExcessPowerWatt + ExcessPowerWatt) / 2) * dt_h;
    ExcessEnergyWhTotal += dWh;
    ExcessEnergyWhToday += dWh;
}

// Zustände speichern
context.set('lastMs', nowMs);
context.set('lastExcessPowerWatt', ExcessPowerWatt);
context.set('ExcessEnergyWhTotal', ExcessEnergyWhTotal);
context.set('ExcessEnergyWhToday', ExcessEnergyWhToday);
context.set('lastDay', today);

// Ausgabe
msg.payload = {
    PvPowerWatt,
    GridPowerWatt,
    HouseConsumptionWatt,
    GridImportWatt,
    FeedInWatt,
    ExcessPowerWatt,
    ExcessEnergyWhTotal,
    ExcessEnergyKWhTotal: ExcessEnergyWhTotal / 1000,
    ExcessEnergyWhToday,
    ExcessEnergyKWhToday: ExcessEnergyWhToday / 1000,
    timestamp: nowMs,
    OnlineFlag: solarEdgeStatus.OnlineFlag === true,
    OfflineFlag: solarEdgeStatus.OnlineFlag !== true,
    OfflineReason: solarEdgeStatus.OfflineReason || "",
    Source: solarEdgeStatus.Source || "SolarEdge Modbus/TCP"
};
return msg;
