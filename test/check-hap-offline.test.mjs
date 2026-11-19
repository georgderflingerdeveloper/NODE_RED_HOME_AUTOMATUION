import assert from "node:assert/strict";
import test from "node:test";
import { runFunctionNode } from "./helpers/function-node-harness.mjs";

function sample(lastSuccess, cloudConnected, previous) {
    return runFunctionNode("hmip_reboot_check", {
        msg: { topic: "homematic-ip/state", payload: { lastSuccess, cloudConnected, intervalMs: 600000 } },
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
