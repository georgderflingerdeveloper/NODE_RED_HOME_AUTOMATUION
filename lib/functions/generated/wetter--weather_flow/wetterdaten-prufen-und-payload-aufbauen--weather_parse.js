// name: Wetterdaten prüfen und Payload aufbauen
// nodeId: weather_parse
// flow: WETTER
// Open-Meteo-Antwort in eine stabile Steuerungs-Payload umwandeln
if (Number(msg.statusCode) !== 200 || !msg.payload || !msg.payload.hourly) {
    return [null, { payload: { reason: "HTTP- oder Datenfehler", statusCode: msg.statusCode } }];
}

const data = msg.payload;
const hourly = data.hourly;
const times = Array.isArray(hourly.time) ? hourly.time : [];
const sunshine = Array.isArray(hourly.sunshine_duration) ? hourly.sunshine_duration : [];
const temperatures = Array.isArray(hourly.temperature_2m) ? hourly.temperature_2m : [];
const clouds = Array.isArray(hourly.cloud_cover) ? hourly.cloud_cover : [];
const rainProbability = Array.isArray(hourly.precipitation_probability) ? hourly.precipitation_probability : [];
const weatherCodes = Array.isArray(hourly.weather_code) ? hourly.weather_code : [];
const daily = data.daily || {};
const dailyDates = Array.isArray(daily.time) ? daily.time : [];
const sunrises = Array.isArray(daily.sunrise) ? daily.sunrise : [];
const sunsets = Array.isArray(daily.sunset) ? daily.sunset : [];

if (!times.length || times.length !== sunshine.length || !dailyDates.length || dailyDates.length !== sunrises.length || dailyDates.length !== sunsets.length) {
    return [null, { payload: { reason: "Unvollständige Wetterdaten" } }];
}

const clampPercent = value => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
const solarTimesForHour = timeValue => {
    const dateIndex = dailyDates.indexOf(String(timeValue).slice(0, 10));
    if (dateIndex < 0) return null;
    return {
        sunrise: new Date(sunrises[dateIndex]),
        sunset: new Date(sunsets[dateIndex])
    };
};
const daylightSecondsForHour = timeValue => {
    const solarTimes = solarTimesForHour(timeValue);
    if (!solarTimes) return 0;
    const hourStart = new Date(timeValue);
    const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);
    const overlapStart = Math.max(hourStart.getTime(), solarTimes.sunrise.getTime());
    const overlapEnd = Math.min(hourEnd.getTime(), solarTimes.sunset.getTime());
    return Math.max(0, Math.round((overlapEnd - overlapStart) / 1000));
};
const sunshinePercent = (seconds, timeValue) => {
    const daylightSeconds = daylightSecondsForHour(timeValue);
    if (daylightSeconds <= 0) return 0;
    return clampPercent(((Number(seconds) || 0) / daylightSeconds) * 100);
};
const now = new Date(data.current?.time || Date.now());
const currentHour = new Date(now);
currentHour.setMinutes(0, 0, 0);

const parsedTimes = times.map(value => new Date(value));
let lastHourIndex = -1;
for (let index = 0; index < parsedTimes.length; index += 1) {
    if (parsedTimes[index] < currentHour) lastHourIndex = index;
}
const futureIndexes = parsedTimes
    .map((time, index) => ({ time, index }))
    .filter(item => item.time > currentHour)
    .slice(0, 6);

if (lastHourIndex < 0 || futureIndexes.length < 1) {
    return [null, { payload: { reason: "Keine passende Stundenprognose" } }];
}

const nextHourIndex = futureIndexes[0].index;
const actualSunshineLastHour = sunshinePercent(sunshine[lastHourIndex], times[lastHourIndex]);
const expectedNextHour = sunshinePercent(sunshine[nextHourIndex], times[nextHourIndex]);
const forecastNext6Hours = futureIndexes.map(item => ({
    Time: times[item.index],
    TimeLabel: times[item.index].slice(11, 16),
    SunshinePercent: sunshinePercent(sunshine[item.index], times[item.index]),
    DaylightSeconds: daylightSecondsForHour(times[item.index]),
    IsDaylight: daylightSecondsForHour(times[item.index]) > 0,
    TemperatureC: Number(temperatures[item.index]) || 0,
    CloudCoverPercent: clampPercent(clouds[item.index]),
    PrecipitationProbabilityPercent: clampPercent(rainProbability[item.index]),
    WeatherCode: Number(weatherCodes[item.index]) || 0
}));
const expectedNext6Hours = Math.round(forecastNext6Hours.reduce((sum, item) => sum + item.SunshinePercent, 0) / forecastNext6Hours.length);
const expectedThresholdPercent = 10;
const sunPowerExpected = expectedNextHour >= expectedThresholdPercent;
const activeFlag = true;

msg.payload = {
    SchemaVersion: 1,
    WeatherService: "Open-Meteo",
    WeatherServiceStatusText: "AKTIV",
    ActiveFlag: activeFlag,
    ActiveFlagf: activeFlag,
    UpdatedAt: new Date().toISOString(),
    UpdatedAtText: new Date().toLocaleString("de-AT"),
    Location: {
        Name: "Reindlmühl bei Altmünster am Traunsee",
        Latitude: Number(data.latitude),
        Longitude: Number(data.longitude),
        Timezone: data.timezone || "Europe/Vienna"
    },
    Current: {
        Time: data.current?.time || "",
        TemperatureC: Number(data.current?.temperature_2m) || 0,
        CloudCoverPercent: clampPercent(data.current?.cloud_cover),
        WeatherCode: Number(data.current?.weather_code) || 0,
        IsDay: Number(data.current?.is_day) === 1
    },
    ActualSunshineLastHour: actualSunshineLastHour,
    ActualSunshineLastHourPercent: actualSunshineLastHour,
    ExpectedPercentSunshineNextHour: expectedNextHour,
    ExpectetPercentSunshineNextHour: expectedNextHour,
    ExpectedPercentSunshineNext6Hours: expectedNext6Hours,
    SunPowerExpected: sunPowerExpected,
    SunPowerExpectedText: sunPowerExpected ? "JA · nächste Stunde" : "NEIN",
    SunPowerExpectedForHours: 1,
    SunPowerExpectedUntil: times[nextHourIndex],
    ExpectedSunshineThresholdPercent: expectedThresholdPercent,
    SunriseToday: sunrises[0] || "",
    SunsetToday: sunsets[0] || "",
    ForecastNext6Hours: forecastNext6Hours
};
msg.payload.DashboardText =
    "Standort: Reindlmühl | Dienst: " + msg.payload.WeatherServiceStatusText +
    " | Temperatur: " + msg.payload.Current.TemperatureC + " Grad C" +
    " | Sonne letzte Stunde: " + msg.payload.ActualSunshineLastHour + "%" +
    " | Sonne nächste Stunde: " + msg.payload.ExpectedPercentSunshineNextHour + "%" +
    " | Sonne nächste 6 Stunden: " + msg.payload.ExpectedPercentSunshineNext6Hours + "%" +
    " | Solarleistung erwartet: " + msg.payload.SunPowerExpectedText +
    " | Aktualisiert: " + msg.payload.UpdatedAtText;
return [msg, null];