import assert from "node:assert/strict";
import test from "node:test";
import { runFunctionNode } from "./helpers/function-node-harness.mjs";

function sample(lastSuccess, cloudConnected, previous) {
    return runFunctionNode("hmip_reboot_check", {
        msg: { topic: "homematic-ip/state", payload: { lastSuccess, cloudConnected } },
        contextValues: { offline: previous?.context.get("offline") },
    });
}

test("only three fresh offline confirmations spanning four minutes trigger once", async () => {
    let result = await sample(1000, false);
    result = await sample(1000, false, result);
    result = await sample(121000, false, result);
    result = await sample(121000, undefined, result);
    assert.equal(result.result, null);
    result = await sample(241000, false, result);
    assert.deepEqual(result.result, {});
    result = await sample(361000, false, result);
    assert.equal(result.result, null);
});

test("online, unknown and gaps reset the offline confirmations", async () => {
    for (const [at, status] of [[121000, true], [121000, null], [361000, false]]) {
        let result = await sample(1000, false);
        result = await sample(at, status, result);
        result = await sample(at + 120000, false, result);
        assert.equal(result.result, null);
    }
});
