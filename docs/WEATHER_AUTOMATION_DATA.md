# Wetterdaten für Automatisierungen

Der Function-Node **Wetterdaten für Automatisierung bereitstellen** erzeugt die
kleine, stabile globale Struktur `WeatherAutomationData`. Automationen lesen nur
diese Struktur und müssen weder den Internetdienst noch einen konkreten Sensor
kennen.

## Globale Datenstruktur

```js
const weather = global.get("WeatherAutomationData");

weather.SunPercentageNextHour;
weather.Sunset;
weather.SunDawn;
weather.EstimatedTemperaturNextMorning;
weather.ActualTemperature;
```

Zusätzlich stehen `Ready`, `DataStaleFlag`, `Sources`, `Quality` und `UpdatedAt`
zur Diagnose bereit. Vor einer Schaltentscheidung sollte mindestens `Ready`
geprüft werden. Bei sicherheitsrelevanten Entscheidungen muss zusätzlich
`DataStaleFlag === false` gelten.

## Quellen auswählen

Die globale Konfiguration `WeatherAutomationSelector` kann für jedes Feld einen
der Werte `internet`, `sensor` oder `auto` enthalten:

```js
global.set("WeatherAutomationSelector", {
    SunPercentageNextHour: "internet",
    Sunset: "internet",
    SunDawn: "internet",
    EstimatedTemperaturNextMorning: "internet",
    ActualTemperature: "auto",
    SensorMaxAgeMs: 15 * 60 * 1000
});
```

`auto` bevorzugt einen frischen Sensorwert und verwendet sonst den Internetwert.
Die Standardeinstellung nutzt dies für `ActualTemperature`; Prognose- und
Sonnenwerte kommen standardmäßig aus dem Internet.

## Sensor anbinden

Ein Sensor-Flow sendet über einen Link-Out zum Link-In **WETTER SENSORIK IN**:

```js
msg.topic = "weather/sensor";
msg.payload = {
    ActualTemperature: 21.4,
    UpdatedAt: new Date().toISOString()
};
return msg;
```

Weitere Sensorfelder können später mit denselben Namen ergänzt werden. Die
Quelldaten werden in `WeatherSensorData` gespeichert. Passwörter oder andere
Zugangsdaten gehören nicht in diese Strukturen.

## Auffindbarkeit

- Flow: `WETTER`
- Function: `Wetterdaten für Automatisierung bereitstellen`
- JavaScript: `flow-src/flows/wetter--weather_flow/functions/wetterdaten-fur-automatisierung-bereitstellen.js`
- Tests: `test/weather-automation-data.test.mjs`
