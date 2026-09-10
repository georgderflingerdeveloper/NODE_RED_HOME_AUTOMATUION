// name: Read energy forecast data
// nodeId: energy_forecast_read
// flow: ENERGY_FORECAST
const nowMs = Number.isFinite(Number(msg.now)) ? Number(msg.now) : Date.now();
const stored = global.get("EnergyForecastData");
const forecast = stored ? JSON.parse(JSON.stringify(stored)) : {
    SchemaVersion: 1,
    UpdatedAt: new Date(nowMs).toISOString(),
    ProviderOnline: false,
    EstimatedCostExpensive: false,
    EstimatedCostCheap: false,
    NotAvailable: true,
    Classification: "not-available",
    Provider: { Name: "unknown", Online: false, LastUpdate: null, ValidUntil: null },
    Current: null,
    Thresholds: { Method: "provider-window-tertiles", CheapCtPerKWh: null, ExpensiveCtPerKWh: null },
    Forecast: { HorizonStart: null, HorizonEnd: null, Slots: [], CheapestSlots: [], MostExpensiveSlots: [] },
    Extensions: { AI: { Enabled: false, Status: "not-configured", Prediction: null } }
};

const validUntilMs = new Date(forecast.Provider?.ValidUntil || 0).getTime();
if (!Number.isFinite(validUntilMs) || nowMs >= validUntilMs) {
    forecast.ProviderOnline = false;
    forecast.EstimatedCostExpensive = false;
    forecast.EstimatedCostCheap = false;
    forecast.NotAvailable = true;
    forecast.Classification = "not-available";
    forecast.Provider = { ...forecast.Provider, Online: false };
}

global.set("EnergyForecastData", forecast);
node.status({
    fill: forecast.NotAvailable ? "red" : "green",
    shape: forecast.NotAvailable ? "ring" : "dot",
    text: forecast.NotAvailable ? "keine gültige Prognose" : forecast.Classification
});
msg.topic = "energy/forecast/result";
msg.payload = forecast;
return msg;
