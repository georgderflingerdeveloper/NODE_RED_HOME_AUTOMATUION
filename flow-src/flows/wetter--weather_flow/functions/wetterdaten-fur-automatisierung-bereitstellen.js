// Stabile globale Wetterstruktur für Heizungs-, Licht- und Solarautomationen.
//
// Globale Schnittstellen:
//   WeatherAutomationData     -> aufbereitete Werte für Automationen
//   WeatherAutomationSelector -> optionale Quellenwahl je Feld: internet, sensor, auto
//   WeatherSensorData         -> zuletzt empfangene Sensorwerte
//
// Sensordaten können über den Link-In "WETTER SENSORIK IN" eingespeist werden:
//   msg.topic = "weather/sensor"
//   msg.payload = { ActualTemperature: 21.4, UpdatedAt: "..." }

const FIELD_NAMES = [
    "SunPercentageNextHour",
    "Sunset",
    "SunDawn",
    "EstimatedTemperaturNextMorning",
    "ActualTemperature"
];

const DEFAULT_SELECTOR = {
    SunPercentageNextHour: "internet",
    Sunset: "internet",
    SunDawn: "internet",
    EstimatedTemperaturNextMorning: "internet",
    ActualTemperature: "auto"
};

const isSensorMessage = msg.topic === "weather/sensor" || msg.source === "sensor";
if (isSensorMessage && msg.payload && typeof msg.payload === "object") {
    global.set("WeatherSensorData", {
        ...(global.get("WeatherSensorData") || {}),
        ...msg.payload,
        UpdatedAt: msg.payload.UpdatedAt || new Date().toISOString()
    });
}

const internet = isSensorMessage
    ? (global.get("WeatherData") || {})
    : (msg.payload || global.get("WeatherData") || {});
const sensor = global.get("WeatherSensorData") || {};
const configuredSelector = global.get("WeatherAutomationSelector") || {};
const selector = {};

for (const field of FIELD_NAMES) {
    const requested = String(configuredSelector[field] || DEFAULT_SELECTOR[field]).toLowerCase();
    selector[field] = ["internet", "sensor", "auto"].includes(requested)
        ? requested
        : DEFAULT_SELECTOR[field];
}

// Sensorwerte gelten standardmäßig 15 Minuten als frisch. Der Wert ist konfigurierbar.
const sensorMaxAgeMs = Math.max(1000, Number(configuredSelector.SensorMaxAgeMs) || 15 * 60 * 1000);
const sensorUpdatedMs = Date.parse(sensor.UpdatedAt || "");
const sensorFresh = Number.isFinite(sensorUpdatedMs) && Date.now() - sensorUpdatedMs <= sensorMaxAgeMs;

const internetValues = {
    SunPercentageNextHour: internet.ExpectedPercentSunshineNextHour,
    Sunset: internet.SunsetToday,
    SunDawn: internet.SunriseToday,
    EstimatedTemperaturNextMorning: internet.EstimatedTemperatureNextMorning,
    ActualTemperature: internet.Current?.TemperatureC
};

const isNumberField = field => [
    "SunPercentageNextHour",
    "EstimatedTemperaturNextMorning",
    "ActualTemperature"
].includes(field);
const normalize = (field, value) => {
    if (isNumberField(field)) return Number.isFinite(Number(value)) ? Number(value) : null;
    return typeof value === "string" && value.trim() ? value : null;
};

const values = {};
const sources = {};
const quality = {};

for (const field of FIELD_NAMES) {
    const internetValue = normalize(field, internetValues[field]);
    const sensorValue = normalize(field, sensor[field]);
    const mode = selector[field];
    let selectedValue = null;
    let selectedSource = "unavailable";

    if (mode === "sensor") {
        if (sensorFresh && sensorValue !== null) {
            selectedValue = sensorValue;
            selectedSource = "sensor";
        }
    } else if (mode === "auto" && sensorFresh && sensorValue !== null) {
        selectedValue = sensorValue;
        selectedSource = "sensor";
    } else if (internetValue !== null) {
        selectedValue = internetValue;
        selectedSource = "internet";
    }

    values[field] = selectedValue;
    sources[field] = selectedSource;
    quality[field] = selectedSource === "unavailable"
        ? "unavailable"
        : (selectedSource === "internet" && internet.DataStaleFlag ? "stale" : "valid");
}

const automationData = {
    SchemaVersion: 1,
    UpdatedAt: new Date().toISOString(),
    ...values,
    Ready: FIELD_NAMES.every(field => values[field] !== null),
    DataStaleFlag: FIELD_NAMES.some(field => quality[field] !== "valid"),
    Sources: sources,
    Quality: quality,
    Selector: selector
};

global.set("WeatherAutomationSelector", {
    ...selector,
    SensorMaxAgeMs: sensorMaxAgeMs
});
global.set("WeatherAutomationData", automationData);

node.status({
    fill: automationData.Ready && !automationData.DataStaleFlag ? "green" : "yellow",
    shape: automationData.Ready ? "dot" : "ring",
    text: automationData.Ready ? "Automationsdaten bereit" : "Automationsdaten unvollständig"
});

return {
    ...msg,
    topic: "weather/automation",
    payload: automationData
};
