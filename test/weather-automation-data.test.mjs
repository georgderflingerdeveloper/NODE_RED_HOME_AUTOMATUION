import assert from "node:assert/strict";
import test from "node:test";
import { runFunctionNode } from "./helpers/function-node-harness.mjs";

const internetWeather = {
  ActiveFlag: true,
  DataStaleFlag: false,
  ExpectedPercentSunshineNextHour: 72,
  SunriseToday: "2026-06-01T05:00",
  SunsetToday: "2026-06-01T21:00",
  EstimatedTemperatureNextMorning: 13.5,
  Current: { TemperatureC: 20.4 },
};

test("globale Automationsstruktur enthält alle stabilen Wetterfelder", async () => {
  const { result, global } = await runFunctionNode("weather_automation_data", {
    msg: { topic: "WeatherData", payload: internetWeather },
  });

  const data = global.get("WeatherAutomationData");
  assert.equal(data.SunPercentageNextHour, 72);
  assert.equal(data.Sunset, "2026-06-01T21:00");
  assert.equal(data.SunDawn, "2026-06-01T05:00");
  assert.equal(data.EstimatedTemperaturNextMorning, 13.5);
  assert.equal(data.ActualTemperature, 20.4);
  assert.equal(data.Ready, true);
  assert.equal(result.topic, "weather/automation");
});

test("Selektor auto bevorzugt einen frischen Temperatur-Sensor", async () => {
  const now = new Date().toISOString();
  const { global } = await runFunctionNode("weather_automation_data", {
    msg: { topic: "WeatherData", payload: internetWeather },
    globalValues: {
      WeatherAutomationSelector: { ActualTemperature: "auto" },
      WeatherSensorData: { ActualTemperature: 22.8, UpdatedAt: now },
    },
  });

  const data = global.get("WeatherAutomationData");
  assert.equal(data.ActualTemperature, 22.8);
  assert.equal(data.Sources.ActualTemperature, "sensor");
  assert.equal(data.Sources.SunPercentageNextHour, "internet");
});

test("Selektor internet ignoriert vorhandene Sensorwerte", async () => {
  const { global } = await runFunctionNode("weather_automation_data", {
    msg: { topic: "WeatherData", payload: internetWeather },
    globalValues: {
      WeatherAutomationSelector: { ActualTemperature: "internet" },
      WeatherSensorData: { ActualTemperature: 99, UpdatedAt: new Date().toISOString() },
    },
  });

  const data = global.get("WeatherAutomationData");
  assert.equal(data.ActualTemperature, 20.4);
  assert.equal(data.Sources.ActualTemperature, "internet");
});

test("veraltete Sensorwerte werden im auto-Modus nicht verwendet", async () => {
  const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { global } = await runFunctionNode("weather_automation_data", {
    msg: { topic: "WeatherData", payload: internetWeather },
    globalValues: {
      WeatherAutomationSelector: { ActualTemperature: "auto", SensorMaxAgeMs: 15 * 60 * 1000 },
      WeatherSensorData: { ActualTemperature: 22.8, UpdatedAt: old },
    },
  });

  const data = global.get("WeatherAutomationData");
  assert.equal(data.ActualTemperature, 20.4);
  assert.equal(data.Sources.ActualTemperature, "internet");
});

test("Sensor-Link aktualisiert WeatherSensorData und die globale Struktur", async () => {
  const { global } = await runFunctionNode("weather_automation_data", {
    msg: {
      topic: "weather/sensor",
      payload: { ActualTemperature: 18.7 },
    },
    globalValues: {
      WeatherData: internetWeather,
      WeatherAutomationSelector: { ActualTemperature: "sensor" },
    },
  });

  assert.equal(global.get("WeatherSensorData").ActualTemperature, 18.7);
  assert.equal(global.get("WeatherAutomationData").ActualTemperature, 18.7);
});
