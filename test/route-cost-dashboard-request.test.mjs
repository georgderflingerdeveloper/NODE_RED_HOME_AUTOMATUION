import assert from "node:assert/strict";
import test from "node:test";
import { runFunctionNode } from "./helpers/function-node-harness.mjs";

test("Route cost dashboard request separates history and forecast requests", async () => {
  const history = await runFunctionNode("kosten_dashboard_request_router", { msg: { topic: "history/dashboard" } });
  assert.deepEqual(history.result, [{ topic: "history/dashboard" }, null]);

  const forecast = await runFunctionNode("kosten_dashboard_request_router", { msg: { topic: "energy/forecast/read" } });
  assert.deepEqual(forecast.result, [null, { topic: "energy/forecast/read" }]);
});

test("Route cost dashboard request rejects unknown topics safely", async () => {
  const { result, warnings } = await runFunctionNode("kosten_dashboard_request_router", { msg: { topic: "unknown" } });
  assert.deepEqual(result, [null, null]);
  assert.equal(warnings.length, 1);
});
