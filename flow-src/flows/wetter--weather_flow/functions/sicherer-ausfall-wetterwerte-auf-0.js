// Sicherer Ausfallzustand: keine Prognose darf Verbraucher einschalten
const reason = msg.payload?.reason || msg.error?.message || "Wetterdienst nicht erreichbar";
const emptyForecast = Array.from({ length: 6 }, (_, index) => ({
    Time: "",
    TimeLabel: "+" + (index + 1) + " h",
    SunshinePercent: 0,
    TemperatureC: 0,
    CloudCoverPercent: 0,
    PrecipitationProbabilityPercent: 0,
    WeatherCode: 0
}));
msg.payload = {
    SchemaVersion: 1,
    WeatherService: "Open-Meteo",
    WeatherServiceStatusText: "NICHT AKTIV",
    ActiveFlag: false,
    ActiveFlagf: false,
    UpdatedAt: new Date().toISOString(),
    UpdatedAtText: new Date().toLocaleString("de-AT"),
    ErrorReason: reason,
    Location: { Name: "Reindlmühl bei Altmünster am Traunsee", Latitude: 47.89464, Longitude: 13.7163, Timezone: "Europe/Vienna" },
    Current: { Time: "", TemperatureC: 0, CloudCoverPercent: 0, WeatherCode: 0, IsDay: false },
    ActualSunshineLastHour: 0,
    ActualSunshineLastHourPercent: 0,
    ExpectedPercentSunshineNextHour: 0,
    ExpectetPercentSunshineNextHour: 0,
    ExpectedPercentSunshineNext6Hours: 0,
    SunPowerExpected: false,
    SunPowerExpectedText: "NEIN · Wetterdienst nicht aktiv",
    SunPowerExpectedForHours: 1,
    SunPowerExpectedUntil: "",
    ExpectedSunshineThresholdPercent: 10,
    ForecastNext6Hours: emptyForecast
};
msg.payload.DashboardText =
    "Standort: Reindlmühl | Dienst: NICHT AKTIV | Temperatur: 0 Grad C | Sonne letzte Stunde: 0%" +
    " | Sonne nächste Stunde: 0% | Sonne nächste 6 Stunden: 0%" +
    " | Solarleistung erwartet: NEIN | Aktualisiert: " + msg.payload.UpdatedAtText;
return msg;