// Bei jeder neuen Dashboard-Verbindung den letzten vollständigen Wetterstand erneut senden.
// msg.socketid bleibt erhalten, damit nur der neu verbundene Browser aktualisiert wird.
if (msg.payload !== "connect" && !(msg.payload === "change" && msg.name === "WETTER")) {
    return null;
}

const weatherData = global.get("WeatherData");
if (!weatherData || !Array.isArray(weatherData.ForecastNext6Hours)) {
    return null;
}

return {
    topic: "WeatherData",
    payload: weatherData,
    socketid: msg.socketid,
    dashboardRefresh: true
};