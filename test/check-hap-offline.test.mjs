import assert from "node:assert/strict";
import test from "node:test";
import { runFunctionNode } from "./helpers/function-node-harness.mjs";

function sample(lastSuccess, cloudConnected, previous, intervalMs = 600000) {
    return runFunctionNode("hmip_reboot_check", {
        msg: { topic: "homematic-ip/state", payload: { lastSuccess, cloudConnected, intervalMs } },
        contextValues: { offline: previous?.context.get("offline") },
    });
}

test("only three fresh offline confirmations spanning twenty minutes trigger once", async () => {
    let result = await sample(1000, false);
    result = await sample(1000, false, result);
    result = await sample(601000, false, result);
    result = await sample(601000, undefined, result);
    assert.equal(result.result, null);
    result = await sample(1201000, false, result);
    assert.deepEqual(result.result, {});
    result = await sample(1801000, false, result);
    assert.equal(result.result, null);
});

test("online, unknown and gaps reset the offline confirmations", async () => {
    for (const [at, status] of [[601000, true], [601000, null], [960100, false]]) {
        let result = await sample(1000, false);
        result = await sample(at, status, result);
        result = await sample(at + 600000, false, result);
        assert.equal(result.result, null);
    }
});

test("hourly offline reports retry through a persistent outage", async () => {
    let previous;
    for (const [time, status, trigger] of [
        [1000, false, true], [1000, false, false], [3601000, false, true],
        [7201000, true, false], [10801000, null, false], [14401000, false, true],
    ]) {
        previous = await sample(time, status, previous, 3600000);
        assert.deepEqual(previous.result, trigger ? {} : null);
    }
});
