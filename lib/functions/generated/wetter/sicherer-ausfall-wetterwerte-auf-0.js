// name: SICHERER AUSFALL · Wetterwerte auf 0
// nodeId: weather_fallback
// flow: WETTER
// Steuerungen bleiben im Fehlerfall sicher aus. Das Dashboard zeigt jedoch
// vorhandene letzte gültige Messwerte statt erfundener Wetterwerte von 0.
const reason = msg.payload?.reason || msg.error?.message || "Wetterdienst nicht erreichbar";
const lastValid = global.get("WeatherLastValidData");
const hasLastKnownValues = Boolean(
    lastValid &&
    lastValid.ActiveFlag === true &&
    lastValid.Current &&
    Array.isArray(lastValid.ForecastNext6Hours)
);
const now = new Date();
const emptyForecast = Array.from({ length: 6 }, (_, index) => ({
    Time: "",
    TimeLabel: "+" + (index + 1) + " h",
    SunshinePercent: 0,
    TemperatureC: 0,
    CloudCoverPercent: 0,
    PrecipitationProbabilityPercent: 0,
    WeatherCode: 0,
    IsDaylight: false
}));
const previous = hasLastKnownValues ? lastValid : {};

msg.payload = {
    ...previous,
    SchemaVersion: 1,
    WeatherService: "Open-Meteo",
    WeatherServiceStatusText: "OFFLINE · letzte gültige Werte",
    ActiveFlag: false,
    ActiveFlagf: false,
    DataStaleFlag: true,
    HasLastKnownValues: hasLastKnownValues,
    UpdatedAt: now.toISOString(),
    UpdatedAtText: now.toLocaleString("de-AT"),
    LastValidAt: hasLastKnownValues ? lastValid.UpdatedAt : null,
    ErrorReason: reason,
    Location: previous.Location || {
        Name: "Reindlmühl bei Altmünster am Traunsee",
        Latitude: 47.89464,
        Longitude: 13.7163,
        Timezone: "Europe/Vienna"
    },
    Current: hasLastKnownValues
        ? previous.Current
        : { Time: "", TemperatureC: 0, CloudCoverPercent: 0, WeatherCode: 0, IsDay: false },
    ActualSunshineLastHour: hasLastKnownValues ? previous.ActualSunshineLastHour : 0,
    ActualSunshineLastHourPercent: hasLastKnownValues ? previous.ActualSunshineLastHourPercent : 0,
    ExpectedPercentSunshineNextHour: hasLastKnownValues ? previous.ExpectedPercentSunshineNextHour : 0,
    ExpectetPercentSunshineNextHour: hasLastKnownValues ? previous.ExpectetPercentSunshineNextHour : 0,
    ExpectedPercentSunshineNext6Hours: hasLastKnownValues ? previous.ExpectedPercentSunshineNext6Hours : 0,
    // Sicherheitswert für Automationen: bei nicht erreichbarem Wetterdienst nie einschalten.
    SunPowerExpected: false,
    SunPowerExpectedText: "NEIN · Wetterdienst offline",
    SunPowerExpectedForHours: 1,
    SunPowerExpectedUntil: "",
    ExpectedSunshineThresholdPercent: 10,
    SunriseToday: hasLastKnownValues ? (previous.SunriseToday || "") : "",
    SunsetToday: hasLastKnownValues ? (previous.SunsetToday || "") : "",
    ForecastNext6Hours: hasLastKnownValues ? previous.ForecastNext6Hours : emptyForecast
};
msg.payload.DashboardText = hasLastKnownValues
    ? "Wetterdienst OFFLINE | letzte gültige Werte vom " + new Date(lastValid.UpdatedAt).toLocaleString("de-AT") +
      " | Fehler: " + reason
    : "Wetterdienst OFFLINE | noch keine gültigen Wetterwerte | Fehler: " + reason;

const retryCount = Number(flow.get("WeatherRetryCount")) || 0;
let retryMessage = null;
if (retryCount < 3) {
    flow.set("WeatherRetryCount", retryCount + 1);
    retryMessage = {
        topic: "weather/retry",
        payload: {
            attempt: retryCount + 1,
            reason
        }
    };
}
return [msg, retryMessage];
