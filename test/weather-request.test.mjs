import assert from "node:assert/strict";
import test from "node:test";
import { runFunctionNode } from "./helpers/function-node-harness.mjs";

test("Wetterabfrage enthält Standort, Zeitzone und alle benötigten Prognosefelder", async () => {
  const { result } = await runFunctionNode("weather_build_request", {
    msg: { topic: "weather/update" },
  });
  const url = new URL(result.url);

  assert.equal(result.method, "GET");
  assert.equal(url.hostname, "api.open-meteo.com");
  assert.equal(url.searchParams.get("latitude"), "47.89464");
  assert.equal(url.searchParams.get("longitude"), "13.7163");
  assert.equal(url.searchParams.get("timezone"), "Europe/Vienna");
  assert.equal(url.searchParams.get("past_hours"), "1");
  assert.equal(url.searchParams.get("forecast_hours"), "36");
  assert.match(url.searchParams.get("hourly"), /sunshine_duration/);
  assert.match(url.searchParams.get("daily"), /sunrise/);
  assert.match(url.searchParams.get("daily"), /sunset/);
});
