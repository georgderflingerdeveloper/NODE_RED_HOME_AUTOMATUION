import assert from "node:assert/strict";
import test from "node:test";
import { runFunctionNode } from "./helpers/function-node-harness.mjs";

test("Temperatur des nächsten Morgens wird aus der 06-Uhr-Prognose gelesen", async () => {
  const times = [
    "2026-06-01T09:00", "2026-06-01T10:00", "2026-06-01T11:00",
    "2026-06-01T12:00", "2026-06-01T13:00", "2026-06-01T14:00",
    "2026-06-01T15:00", "2026-06-01T16:00", "2026-06-02T06:00",
  ];
  const payload = {
    latitude: 47.89,
    longitude: 13.71,
    timezone: "Europe/Vienna",
    current: {
      time: "2026-06-01T10:30",
      temperature_2m: 20,
      cloud_cover: 10,
      weather_code: 1,
      is_day: 1,
    },
    hourly: {
      time: times,
      sunshine_duration: [0, 1800, 3600, 900, 0, 0, 0, 0, 0],
      temperature_2m: [20, 20, 20, 20, 20, 20, 20, 20, 12.5],
      cloud_cover: times.map(() => 10),
      precipitation_probability: times.map(() => 0),
      weather_code: times.map(() => 1),
    },
    daily: {
      time: ["2026-06-01"],
      sunrise: ["2026-06-01T05:00"],
      sunset: ["2026-06-01T21:00"],
    },
  };

  const { result } = await runFunctionNode("weather_parse", {
    msg: { statusCode: 200, payload },
  });

  assert.equal(result[0].payload.EstimatedTemperatureNextMorning, 12.5);
});
