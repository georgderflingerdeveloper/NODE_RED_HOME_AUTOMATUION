import assert from "node:assert/strict";
import test from "node:test";
import { runFunctionNode } from "./helpers/function-node-harness.mjs";

const run = (msg, contextValues) => runFunctionNode("hmip_device_snapshot", { msg, contextValues });

test("the timer publishes typed values and distinguishes offline from stale", async () => {
    const values = [{ name: "on", value: false }, { name: "power", value: 0, unit: "W" }];
    const rows = [
        { id: "1", quality: "current", reachable: true, points: values },
        { id: "2", quality: "offline", reachable: false, points: [] },
        { id: "3", quality: "stale", reachable: true, points: [] },
        { id: "4", quality: "missing", reachable: true, points: [] },
    ];
    const cached = await run({ topic: "homematic-ip/state", payload: { lastSuccess: 100, rows } });
    assert.equal(cached.result, null);
    const tick = await run({ topic: "homematic-ip/snapshot/tick" }, { snapshot: cached.context.get("snapshot") });
    assert.equal(tick.result.topic, "homematic-ip/devices");
    assert.equal(tick.result.payload.cloudReadAt, 100);
    assert.deepEqual(tick.result.payload.devices.map(device => device.status), ["online", "offline", "unknown", "unknown"]);
    assert.deepEqual(tick.result.payload.devices[0].values, values);
});

test("the timer publishes an empty inventory before the first snapshot", async () => {
    const { result } = await run({ topic: "homematic-ip/snapshot/tick" });
    assert.deepEqual(result.payload.devices, []);
    assert.equal(result.payload.cloudReadAt, null);
});
