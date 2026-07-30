import assert from "node:assert/strict";
import test from "node:test";
import { runFunctionNode } from "./helpers/function-node-harness.mjs";

const lastValidWeather = {
  ActiveFlag: true,
  UpdatedAt: "2026-07-30T08:00:00.000Z",
  SunriseToday: "2026-07-30T05:39",
  SunsetToday: "2026-07-30T20:43",
  Current: { TemperatureC: 24.5, CloudCoverPercent: 20 },
  ActualSunshineLastHour: 80,
  ActualSunshineLastHourPercent: 80,
  ExpectedPercentSunshineNextHour: 70,
  ExpectedPercentSunshineNext6Hours: 60,
  ForecastNext6Hours: [{ TimeLabel: "12:00", TemperatureC: 25 }],
};

test("Wetterausfall zeigt letzte gültige Werte, bleibt für Steuerungen aber sicher", async () => {
  const { result } = await runFunctionNode("weather_fallback", {
    msg: { payload: { reason: "Zeitüberschreitung" } },
    globalValues: { WeatherLastValidData: lastValidWeather },
    flowValues: { WeatherRetryCount: 0 },
  });

  assert.equal(result.length, 2);
  assert.equal(result[0].payload.ActiveFlag, false);
  assert.equal(result[0].payload.DataStaleFlag, true);
  assert.equal(result[0].payload.HasLastKnownValues, true);
  assert.equal(result[0].payload.Current.TemperatureC, 24.5);
  assert.equal(result[0].payload.SunPowerExpected, false);
  assert.equal(result[1].topic, "weather/retry");
  assert.equal(result[1].payload.attempt, 1);
});

test("Wetterausfall ohne gültige Historie kennzeichnet Werte als nicht verfügbar", async () => {
  const { result } = await runFunctionNode("weather_fallback", {
    msg: { payload: { reason: "HTTP-Fehler" } },
    flowValues: { WeatherRetryCount: 3 },
  });

  assert.equal(result[0].payload.HasLastKnownValues, false);
  assert.equal(result[0].payload.SunriseToday, "");
  assert.equal(result[0].payload.ForecastNext6Hours.length, 6);
  assert.equal(result[1], null);
});
