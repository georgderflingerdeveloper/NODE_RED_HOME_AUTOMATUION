import assert from "node:assert/strict";
import test from "node:test";
import { runFunctionNode } from "./helpers/function-node-harness.mjs";

const envValues = {
    SISSI_EWELINK_APP_ID: "test-app",
    SISSI_EWELINK_ACCESS_TOKEN: "test-token",
    SISSI_EWELINK_BRIDGE_ID: "bridge-id",
    SISSI_EWELINK_BUTTON_ID: "button-id",
    SISSI_EWELINK_RELAY_ID: "relay-id",
};

async function step(msg, previous, env = envValues) {
    return runFunctionNode("sissi_ewelink_control", {
        msg,
        contextValues: { room: previous?.context.get("room") },
        envValues: env,
    });
}

function reply(previous, value, statusCode = 200) {
    const request = previous.result[1];
    return step({
        _msgid: request._msgid,
        sissiRequest: request.sissiRequest,
        payload: value,
        statusCode,
    }, previous);
}

function deviceList(light) {
    return {
        error: 0,
        data: { thingList: [
            { itemData: { deviceid: "bridge-id", online: true } },
            { itemData: { deviceid: "button-id", online: false } },
            { itemData: { deviceid: "relay-id", online: true, params: { switch: light } } },
        ] },
    };
}

test("room stays locked without eWeLink credentials or a confirmed relay state", async () => {
    const click = { _msgid: "click", topic: "sissi/light", payload: true };
    for (const env of [{}, envValues]) {
        const { result: [ui, api] } = await step(click, undefined, env);
        assert.equal(ui.payload.light, null);
        assert.equal(ui.payload.canSwitch, false);
        assert.equal(api, null);
    }
});

test("a command addresses only the relay and waits for its reported state", async () => {
    const poll = await step({ _msgid: "poll", topic: "sissi/poll" });
    const confirmed = await reply(poll, deviceList("off"));
    const [ui] = confirmed.result;
    assert.deepEqual(ui.payload.devices, { bridge: "online", button: "offline", relay: "online" });
    assert.equal(ui.payload.canSwitch, true);
    assert.equal(ui.payload.light, false);
    assert.doesNotMatch(JSON.stringify(ui), /test-token/);

    const click = await step({ _msgid: "click", topic: "sissi/light", payload: true }, confirmed);
    assert.deepEqual(click.result[1].payload, { type: 1, id: "relay-id", params: { switch: "on" } });
    assert.equal(click.result[0].payload.light, false);
    assert.equal(click.result[0].payload.pending, true);
    const duplicate = await step({ _msgid: "duplicate", topic: "sissi/light", payload: true }, click);
    assert.equal(duplicate.result[1], null);

    const readback = await reply(click, { error: 0 });
    assert.equal(readback.result[0].payload.light, false);
    const updated = await reply(readback, deviceList("on"));
    assert.equal(updated.result[0].payload.light, true);
    assert.equal(updated.result[0].payload.pending, false);
});

test("throttling clears the confirmed state and pauses requests", async () => {
    const poll = await step({ _msgid: "poll", topic: "sissi/poll" });
    const response = await reply(poll, { error: 429 }, 429);
    assert.equal(response.result[0].payload.canSwitch, false);
    assert.equal(response.result[0].payload.light, null);
    assert.match(response.result[0].payload.message, /fünf Minuten/);
    const retry = await step({ _msgid: "retry", topic: "sissi/poll" }, response);
    assert.equal(retry.result[1], null);
});
