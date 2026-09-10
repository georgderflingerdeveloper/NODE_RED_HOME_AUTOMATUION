// name: Wetterdaten für Automatisierung bereitstellen
// nodeId: weather_automation_data
// flow: WETTER
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

// -----------------------------------------------------------------------------
// Abschnitt 1: Datenmodell und feste Felddefinitionen
// -----------------------------------------------------------------------------
// Diese Funktion stellt für nachgelagerte Automationen einen konsistenten,
// globalen Wetterdaten-Kontext bereit. Die einzelnen Felder sind bewusst hart
// fest definiert, damit alle Verbraucher dieselben Schlüssel erwarten und
// Entscheidungen nicht an der Laufzeit zwischen verschiedenen Typen scheitern.
//
// Warum diese Struktur?
// - Automationslogiken in Heizungs-, Licht- und Solarflows brauchen ein
//   einheitliches Interface mit stabilen Attributnamen.
// - Ein zentrales Datenobjekt vereinfacht spätere Erweiterungen, weil neue
//   Werte an einem Ort hinzugefügt und im selben Schema verarbeitet werden.
// - Der feste Feldsatz verhindert Laufzeitfehler, die durch typspezifische
//   Namensänderungen oder optionale Werte entstehen würden.
const FIELD_NAMES = [
    "SunPercentageNextHour",
    "Sunset",
    "SunDawn",
    "EstimatedTemperaturNextMorning",
    "ActualTemperature"
];

// -----------------------------------------------------------------------------
// Abschnitt 2: Standard-Quellenwahl pro Feld
// -----------------------------------------------------------------------------
// Die Funktion kann Werte aus zwei Quellen beziehen: aus Internetdaten oder aus
// Sensorwerten. Für jedes Feld kann die bevorzugte Quelle explizit konfiguriert
// werden. Wenn keine Anpassung vorliegt, fallen wir auf sichere Standardwerte
// zurück, damit die Automationslogik immer ein nachvollziehbares Verhalten hat.
const DEFAULT_SELECTOR = {
    SunPercentageNextHour: "internet",
    Sunset: "internet",
    SunDawn: "internet",
    EstimatedTemperaturNextMorning: "internet",
    ActualTemperature: "auto"
};

// -----------------------------------------------------------------------------
// Abschnitt 3: Empfang sensorgeladener Nachrichten
// -----------------------------------------------------------------------------
// Sensorwerte können über den Link "WETTER SENSORIK IN" geliefert werden. Das
// kann für lokale Messwerte wie Außentemperatur oder aktuelle Helligkeit
// sinnvoll sein, wenn die Online-Daten verzögert oder ungenau sind.
//
// Die Nachricht wird nur dann als Sensor-Input behandelt, wenn das Topic oder
// der Source-Tag eindeutig darauf hinweist. Dadurch bleiben normale Internet-
// Daten und andere Flow-Nachrichten nicht versehentlich im globalen Sensor-Store
// landen.
const isSensorMessage = msg.topic === "weather/sensor" || msg.source === "sensor";
if (isSensorMessage && msg.payload && typeof msg.payload === "object") {
    // Der vorhandene Sensor-Status wird ergänzt, damit ältere Werte nicht
    // vollständig überschrieben werden, falls nur ein Teil der Messdaten neu ist.
    global.set("WeatherSensorData", {
        ...(global.get("WeatherSensorData") || {}),
        ...msg.payload,
        UpdatedAt: msg.payload.UpdatedAt || new Date().toISOString()
    });
}

// -----------------------------------------------------------------------------
// Abschnitt 4: Ermittlung der aktuellen Datenquellen
// -----------------------------------------------------------------------------
// Bei einer Sensornachricht priorisieren wir die zuletzt gespeicherten
// Wetterdaten aus dem globalen Cache, weil diese die aktuelle Internetquelle
// bereits abgedeckt haben. Bei normalen Nachrichten verwenden wir den Payload
// des aktuellen Flows, sofern vorhanden; andernfalls greifen wir auf die
// zuletzt gespeicherten Wetterdaten zurück.
const internet = isSensorMessage
    ? (global.get("WeatherData") || {})
    : (msg.payload || global.get("WeatherData") || {});
const sensor = global.get("WeatherSensorData") || {};
const configuredSelector = global.get("WeatherAutomationSelector") || {};
const selector = {};

// -----------------------------------------------------------------------------
// Abschnitt 5: Auflösen der konfigurierten Selektor-Regeln
// -----------------------------------------------------------------------------
// Der Selektor entscheidet, ob ein Feld aus dem Internet, aus Sensorwerten oder
// im Auto-Modus bevorzugt aus Sensoren stammt, sofern diese noch frisch genug
// sind. Das Mapping wird strikt validiert, damit fehlerhafte Konfigurationen
// nicht zu einem Laufzeitfehler oder unvorhersehbarem Verhalten führen.
for (const field of FIELD_NAMES) {
    const requested = String(configuredSelector[field] || DEFAULT_SELECTOR[field]).toLowerCase();
    selector[field] = ["internet", "sensor", "auto"].includes(requested)
        ? requested
        : DEFAULT_SELECTOR[field];
}

// -----------------------------------------------------------------------------
// Abschnitt 6: Frischeprüfung der Sensordaten
// -----------------------------------------------------------------------------
// Sensorwerte sind für Automationen oft wertvoll, aber nur dann, wenn sie noch
// aktuell genug sind. Eine feste Gültigkeitsdauer verhindert, dass veraltete
// Messwerte eine Heizung oder Beleuchtung fälschlich beeinflussen.
//
// SensorMaxAgeMs kann pro Konfiguration angepasst werden, damit z. B. bei
// ruhiger Wetterlage eine höhere Toleranz akzeptiert wird.
const sensorMaxAgeMs = Math.max(1000, Number(configuredSelector.SensorMaxAgeMs) || 15 * 60 * 1000);
const sensorUpdatedMs = Date.parse(sensor.UpdatedAt || "");
const sensorFresh = Number.isFinite(sensorUpdatedMs) && Date.now() - sensorUpdatedMs <= sensorMaxAgeMs;

// -----------------------------------------------------------------------------
// Abschnitt 7: Extraktion der Internetwerte je Feld
// -----------------------------------------------------------------------------
// Die Internetquelle liefert nicht immer dieselben Datenstrukturen. Die Namen
// werden hier gezielt auf das interne Feldmodell abgebildet. Dadurch müssen die
// nachgelagerten Automationen nicht wissen, wie Daten aus der externen API
// heißen.
const internetValues = {
    SunPercentageNextHour: internet.ExpectedPercentSunshineNextHour,
    Sunset: internet.SunsetToday,
    SunDawn: internet.SunriseToday,
    EstimatedTemperaturNextMorning: internet.EstimatedTemperatureNextMorning,
    ActualTemperature: internet.Current?.TemperatureC
};

// -----------------------------------------------------------------------------
// Abschnitt 8: Typnormalisierung und Validierung
// -----------------------------------------------------------------------------
// Die rohen API-Werte sind häufig Zeichenketten oder undefiniert. Hier werden sie
// in ein einheitliches internes Format gebracht. Dadurch können spätere
// Vergleiche, Konditionen und Statusanzeigen sicher auf semantisch korrekten
// Werten arbeiten.
const isNumberField = field => [
    "SunPercentageNextHour",
    "EstimatedTemperaturNextMorning",
    "ActualTemperature"
].includes(field);
const normalize = (field, value) => {
    if (isNumberField(field)) return Number.isFinite(Number(value)) ? Number(value) : null;
    return typeof value === "string" && value.trim() ? value : null;
};

// -----------------------------------------------------------------------------
// Abschnitt 9: Auswahl der tatsächlichen Werte je Feld
// -----------------------------------------------------------------------------
// Für jedes Feld wird nun entschieden, welcher Wert für die Automation genutzt
// werden soll. Reihenfolge und Regeln:
// 1. Wenn der Selektor auf "sensor" steht, wird nur ein frischer Sensorwert
//    akzeptiert.
// 2. Wenn der Selektor auf "auto" steht, nimmt die Funktion einen frischen
//    Sensorwert, falls verfügbar; ansonsten fällt sie auf Internetwerte zurück.
// 3. Wenn kein gültiger Wert vorliegt, bleibt der Feldwert null und wird als
//    unvollständig markiert.
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

// -----------------------------------------------------------------------------
// Abschnitt 10: Abschluss des Automations-Objekts
// -----------------------------------------------------------------------------
// Das finale Objekt enthält die ausgewählten Werte, die Herkunft je Feld, den
// Qualitätsstatus und zusätzliche Metadaten. Diese Struktur dient als zentrale
// Schnittstelle für alle nachfolgenden Flows.
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

// Der Selektor wird global persistiert, damit spätere Flows denselben
// Konfigurationszustand wiederverwenden und das Verhalten nachvollziehbar bleibt.
global.set("WeatherAutomationSelector", {
    ...selector,
    SensorMaxAgeMs: sensorMaxAgeMs
});
global.set("WeatherAutomationData", automationData);

// -----------------------------------------------------------------------------
// Abschnitt 11: Statusanzeige und Rückgabe
// -----------------------------------------------------------------------------
// Der Node-Status zeigt auf einen Blick an, ob die Automationsdaten vollständig
// und aktuell genug sind. Das ist für die Fehlersuche im Editor besonders nützlich,
// weil der Flow selbst nicht in der Lage ist, detaillierte Debug-Infos zu
// rendern.
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
