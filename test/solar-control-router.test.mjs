import assert from "node:assert/strict";
import test from "node:test";
import { runFunctionNode } from "./helpers/function-node-harness.mjs";

test("manueller SolarEdge-Reconnect wird ausschließlich an Ausgang 1 gesendet", async () => {
  const { result } = await runFunctionNode("se_control_router", {
    msg: { topic: "modbus-reconnect", payload: true },
  });

  assert.equal(result.length, 2);
  assert.equal(result[1], null);
  assert.equal(result[0].topic, "SolarEdgeModbusReconnectManual");
  assert.equal(result[0].payload.tcpHost, "192.168.0.128");
  assert.equal(result[0].payload.tcpPort, "502");
});

test("bestätigter Node-RED-Neustart wird ausschließlich an Ausgang 2 gesendet", async () => {
  const message = { topic: "node-red-restart", payload: true };
  const { result } = await runFunctionNode("se_control_router", { msg: message });

  assert.equal(result[0], null);
  assert.equal(result[1], message);
});

test("unbekannte oder unbestätigte Befehle werden sicher verworfen", async () => {
  const unknown = await runFunctionNode("se_control_router", {
    msg: { topic: "etwas-anderes", payload: true },
  });
  const unconfirmed = await runFunctionNode("se_control_router", {
    msg: { topic: "node-red-restart", payload: false },
  });

  assert.deepEqual(unknown.result, [null, null]);
  assert.deepEqual(unconfirmed.result, [null, null]);
});
