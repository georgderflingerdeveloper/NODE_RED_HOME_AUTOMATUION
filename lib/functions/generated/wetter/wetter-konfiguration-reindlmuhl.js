// name: WETTER KONFIGURATION · Reindlmühl
// nodeId: weather_build_request
// flow: WETTER
// Zentral änderbare Standortkonfiguration
const LATITUDE = 47.89464;
const LONGITUDE = 13.7163;
const TIMEZONE = "Europe/Vienna";

const parameters = new URLSearchParams({
    latitude: String(LATITUDE),
    longitude: String(LONGITUDE),
    timezone: TIMEZONE,
    elevation: "596",
    past_hours: "1",
    // 36 Stunden reichen zu jeder Tageszeit bis zum nächsten Morgen.
    forecast_hours: "36",
    current: "temperature_2m,weather_code,cloud_cover,is_day",
    hourly: "sunshine_duration,temperature_2m,cloud_cover,precipitation_probability,weather_code",
    daily: "sunrise,sunset"
});
msg.method = "GET";
msg.url = "https://api.open-meteo.com/v1/forecast?" + parameters.toString();
return msg;