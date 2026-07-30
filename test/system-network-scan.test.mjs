import assert from "node:assert/strict";
import test from "node:test";
import { runFunctionNode } from "./helpers/function-node-harness.mjs";

test("System-Scan akzeptiert nur private lokale IPv4-Adressen und plant das /24", async () => {
  const { result, flow } = await runFunctionNode("system_scan_targets", {
    msg: { payload: "192.168.0.165\n" },
  });

  assert.equal(result.scanSubnet, "192.168.0");
  assert.equal(result.payload.length, 253);
  assert.equal(result.payload.includes("192.168.0.165"), false);
  assert.equal(flow.get("systemNetworkScan").expected, 253);
});

test("System-Scan verwirft öffentliche oder unvollständige IP-Werte", async () => {
  const { result } = await runFunctionNode("system_scan_targets", {
    msg: { payload: "8.8.8.8" },
  });

  assert.equal(result, null);
});

test("System-Scan veröffentlicht nur tatsächlich erreichbare Geräte mit Hostnamen", async () => {
  const scan = {
    scanId: "192.168.0-1",
    subnet: "192.168.0",
    expected: 2,
    completed: 1,
    results: {
      "192.168.0.120": { ip: "192.168.0.120", state: "online", observedAt: "2026-07-30T10:00:00.000Z" },
    },
  };
  const { result } = await runFunctionNode("system_scan_result", {
    msg: { scanId: "192.168.0-1", targetIp: "192.168.0.121", online: false },
    flowValues: { systemNetworkScan: scan },
  });

  assert.equal(result.payload.system.network.state, "online");
  assert.equal(result.payload.system.summary.devices, 1);
  assert.equal(result.payload.system.summary.offline, null);
  assert.deepEqual(result.payload.system.devices.map((device) => device.ip), ["192.168.0.120"]);
});

test("Hostname wird nur aus dem gekennzeichneten Resolver-Ergebnis übernommen", async () => {
  const { result } = await runFunctionNode("system_hostname_result", {
    msg: { targetIp: "192.168.0.120", payload: "__SYSTEM_HOSTNAME__raspberrypi.local.\n" },
  });

  assert.equal(result.hostname, "raspberrypi.local");
  assert.equal(result.online, true);
  assert.equal(result.payload, "192.168.0.120");
});

test("bekannte Raspberry-Pi-Inventardaten ergänzen den dynamischen Scan", async () => {
  const scan = {
    scanId: "192.168.0-2",
    subnet: "192.168.0",
    expected: 1,
    completed: 0,
    results: {},
  };
  const { result } = await runFunctionNode("system_scan_result", {
    msg: { scanId: "192.168.0-2", targetIp: "192.168.0.150", online: true, hostname: null },
    flowValues: { systemNetworkScan: scan },
  });
  const device = result.payload.system.devices[0];

  assert.equal(device.name, "PICENTER2");
  assert.equal(device.temperatureC, 45);
  assert.match(device.services, /Node-RED 1880/);
});

test("Live-Systemwerte werden sicher übernommen und lösen ein Dashboard-Update aus", async () => {
  const { result, flow } = await runFunctionNode("system_live_metrics_result", {
    msg: { payload: JSON.stringify({ devices: [{ ip: "192.168.0.150", online: true, hostname: "PICENTER2", temperatureC: 45.5 }] }) },
  });

  assert.equal(result.liveMetricsUpdate, true);
  assert.equal(flow.get("systemLiveMetrics")["192.168.0.150"].temperatureC, 45.5);
});
