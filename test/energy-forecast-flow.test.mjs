import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const nodesPath = new URL(
  "../flow-src/flows/energy-forecast--energy_forecast_flow/nodes.json",
  import.meta.url,
);

test("ENERGY_FORECAST flow keeps provider, state builder and reader separated", () => {
  const nodes = JSON.parse(fs.readFileSync(nodesPath, "utf8"));
  const providerInput = nodes.find((node) => node.id === "energy_forecast_provider_in");
  const builder = nodes.find((node) => node.id === "energy_forecast_build");
  const reader = nodes.find((node) => node.id === "energy_forecast_read");
  const output = nodes.find((node) => node.id === "energy_forecast_dashboard_out");

  assert.deepEqual(providerInput.wires, [["energy_forecast_build"]]);
  assert.equal(builder.name, "Build provider-neutral energy forecast");
  assert.equal(reader.name, "Read energy forecast data");
  assert.deepEqual(output.links, ["kosten_forecast_result_in"]);
});

test("Tariff provider failures are normalized before entering the forecast flow", () => {
  const costNodesPath = new URL(
    "../flow-src/flows/kosten--kosten_flow/nodes.json",
    import.meta.url,
  );
  const nodes = JSON.parse(fs.readFileSync(costNodesPath, "utf8"));
  const failure = nodes.find((node) => node.id === "kosten_forecast_provider_offline");
  const payloadRule = failure.rules.find((rule) => rule.p === "payload");

  assert.equal(payloadRule.tot, "json");
  assert.deepEqual(JSON.parse(payloadRule.to), { provider: "aWATTar", online: false, slots: [] });
  assert.deepEqual(failure.wires, [["kosten_forecast_provider_out"]]);
});
