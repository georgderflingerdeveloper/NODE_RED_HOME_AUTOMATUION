import assert from "node:assert/strict";
import test from "node:test";
import { runFunctionNode } from "./helpers/function-node-harness.mjs";

const weatherData = {
  ActiveFlag: true,
  SunriseToday: "2026-07-29T05:37",
  SunsetToday: "2026-07-29T20:45",
  ForecastNext6Hours: Array.from({ length: 6 }, (_, index) => ({
    TimeLabel: `${index + 10}:00`,
  })),
};

test("neue Dashboard-Verbindung erhält den vollständigen Wetterstand", async () => {
  const { result } = await runFunctionNode("weather_dashboard_refresh", {
    msg: { payload: "connect", socketid: "browser-1" },
    globalValues: { WeatherData: weatherData },
  });

  assert.equal(result.socketid, "browser-1");
  assert.equal(result.topic, "WeatherData");
  assert.equal(result.dashboardRefresh, true);
  assert.equal(result.payload.ForecastNext6Hours.length, 6);
});

test("Wechsel auf den Wetter-Tab aktualisiert ebenfalls", async () => {
  const { result } = await runFunctionNode("weather_dashboard_refresh", {
    msg: { payload: "change", name: "WETTER", socketid: "browser-2" },
    globalValues: { WeatherData: weatherData },
  });

  assert.equal(result.socketid, "browser-2");
  assert.equal(result.payload, weatherData);
});

test("unpassende Events und unvollständige Daten werden ignoriert", async () => {
  const lost = await runFunctionNode("weather_dashboard_refresh", {
    msg: { payload: "lost" },
    globalValues: { WeatherData: weatherData },
  });
  const incomplete = await runFunctionNode("weather_dashboard_refresh", {
    msg: { payload: "connect" },
    globalValues: { WeatherData: {} },
  });

  assert.equal(lost.result, null);
  assert.equal(incomplete.result, null);
});
