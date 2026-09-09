// Open-Meteo-Antwort in eine stabile Steuerungs-Payload umwandeln
// Reject invalid HTTP responses or missing forecast payloads early.
if (Number(msg.statusCode) !== 200 || !msg.payload || !msg.payload.hourly) {
    return [null, { payload: { reason: "HTTP- oder Datenfehler", statusCode: msg.statusCode } }];
}

// Extract the hourly and daily forecast sections needed for the control payload.
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

// Refuse to continue if the forecast data is incomplete or not aligned.
if (!times.length || times.length !== sunshine.length || !dailyDates.length || dailyDates.length !== sunrises.length || dailyDates.length !== sunsets.length) {
    return [null, { payload: { reason: "Unvollständige Wetterdaten" } }];
}

// Clamp percentages to a safe 0..100 range.
const clampPercent = value => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

// Resolve the sunrise and sunset timestamps for a given forecast date.
const solarTimesForDate = timeValue => {
    const dateIndex = dailyDates.indexOf(String(timeValue).slice(0, 10));
    if (dateIndex < 0) return null;
    return {
        sunrise: new Date(sunrises[dateIndex]),
        sunset: new Date(sunsets[dateIndex])
    };
};

// Build a normalized hourly interval ending at the given timestamp.
const hourIntervalEndingAt = timeValue => {
    const end = new Date(timeValue);
    return {
        start: new Date(end.getTime() - 60 * 60 * 1000),
        end
    };
};

// Format a timestamp as a compact hour label such as 08:00.
const formatHour = value => String(value.getHours()).padStart(2, "0") + ":00";

// Create a human-readable label for the weather interval.
const intervalLabel = timeValue => {
    const interval = hourIntervalEndingAt(timeValue);
    return formatHour(interval.start) + "–" + formatHour(interval.end);
};

// Calculate how many seconds of daylight overlap the selected hour.
const daylightSecondsForInterval = timeValue => {
    const interval = hourIntervalEndingAt(timeValue);
    const solarTimes = solarTimesForDate(timeValue);
    if (!solarTimes) return 0;
    const overlapStart = Math.max(interval.start.getTime(), solarTimes.sunrise.getTime());
    const overlapEnd = Math.min(interval.end.getTime(), solarTimes.sunset.getTime());
    return Math.max(0, Math.round((overlapEnd - overlapStart) / 1000));
};

// Convert sunshine duration into a percentage of the actual daylight period.
const sunshinePercent = (seconds, timeValue) => {
    const daylightSeconds = daylightSecondsForInterval(timeValue);
    if (daylightSeconds <= 0) return 0;
    return clampPercent(((Number(seconds) || 0) / daylightSeconds) * 100);
};

// Determine the current hour as the reference point for historical and future forecasts.
const now = new Date(data.current?.time || Date.now());
const currentHour = new Date(now);
currentHour.setMinutes(0, 0, 0);

// Convert forecast timestamps into Date objects for reliable comparisons.
const parsedTimes = times.map(value => new Date(value));

// Track the last forecast hour that is already at or before the current hour.
let lastHourIndex = -1;
for (let index = 0; index < parsedTimes.length; index += 1) {
    if (parsedTimes[index] <= currentHour) lastHourIndex = index;
}

// Select the next six hourly slots after the current time for the forecast summary.
const futureIndexes = parsedTimes
    .map((time, index) => ({ time, index }))
    .filter(item => item.time > currentHour)
    .slice(0, 6);

// Abort if there is no valid historical hour or no valid upcoming forecast window.
if (lastHourIndex < 0 || futureIndexes.length < 1) {
    return [null, { payload: { reason: "Keine passende Stundenprognose" } }];
}

// Use the first future hour as the main decision point for solar expectations.
const nextHourIndex = futureIndexes[0].index;
const nextMorningIndex = parsedTimes.findIndex(time => time > now && time.getHours() === 6);
const actualSunshineLastHour = sunshinePercent(sunshine[lastHourIndex], times[lastHourIndex]);
const expectedNextHour = sunshinePercent(sunshine[nextHourIndex], times[nextHourIndex]);
const estimatedTemperatureNextMorning = nextMorningIndex >= 0 && Number.isFinite(Number(temperatures[nextMorningIndex]))
    ? Number(temperatures[nextMorningIndex])
    : null;
const forecastNext6Hours = futureIndexes.map(item => ({
    Time: times[item.index],
    TimeLabel: intervalLabel(times[item.index]),
    SunshinePercent: sunshinePercent(sunshine[item.index], times[item.index]),
    DaylightSeconds: daylightSecondsForInterval(times[item.index]),
    IsDaylight: daylightSecondsForInterval(times[item.index]) > 0,
    TemperatureC: Number(temperatures[item.index]) || 0,
    CloudCoverPercent: clampPercent(clouds[item.index]),
    PrecipitationProbabilityPercent: clampPercent(rainProbability[item.index]),
    WeatherCode: Number(weatherCodes[item.index]) || 0
}));
const expectedNext6Hours = Math.round(forecastNext6Hours.reduce((sum, item) => sum + item.SunshinePercent, 0) / forecastNext6Hours.length);
const expectedThresholdPercent = 10;
const sunPowerExpected = expectedNextHour >= expectedThresholdPercent;
const activeFlag = true;
flow.set("WeatherRetryCount", 0);

msg.payload = {
    SchemaVersion: 1,
    WeatherService: "Open-Meteo",
    WeatherServiceStatusText: "AKTIV",
    ActiveFlag: activeFlag,
    ActiveFlagf: activeFlag,
    DataStaleFlag: false,
    HasLastKnownValues: true,
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
    EstimatedTemperatureNextMorning: estimatedTemperatureNextMorning,
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
