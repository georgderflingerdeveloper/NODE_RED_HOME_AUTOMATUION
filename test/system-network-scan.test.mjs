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

test("Fehler der SSH-Teilnehmerabfrage werden sichtbar statt verschluckt", async () => {
  const { result, flow, statuses, warnings } = await runFunctionNode("system_live_metrics_result", {
    msg: { payload: JSON.stringify({ devices: [], error: "Zugangsdaten nicht gefunden" }) },
  });

  assert.equal(result.liveMetricsUpdate, true);
  assert.equal(result.liveMetricsError, "Zugangsdaten nicht gefunden");
  assert.equal(flow.get("systemLiveMetricsError"), "Zugangsdaten nicht gefunden");
  assert.equal(statuses.at(-1).fill, "red");
  assert.match(warnings.at(-1), /Zugangsdaten nicht gefunden/);
});


test("System-Scan folgt der Hausnetzroute trotz angeschlossener eQ3-LAN-Freigabe", async () => {
  const { result } = await runFunctionNode("system_scan_targets", {
    msg: { payload: "192.0.2.1 via 192.168.0.1 dev wlo1 src 192.168.0.131 uid 1000\n    cache\n" },
  });
  assert.equal(result.scanSubnet, "192.168.0");
  assert.equal(result.payload.includes("192.168.0.105"), true);
  assert.equal(result.payload.includes("10.42.0.47"), false);
});

test("System-Scan rät bei mehreren Adressen oder fehlender Route kein Netz", async () => {
  for (const payload of ["10.42.0.1 192.168.0.131", "RTNETLINK answers: Network is unreachable", "192.0.2.1 via 192.168.0.1 dev wlo1"]) {
    const { result } = await runFunctionNode("system_scan_targets", { msg: { payload } });
    assert.equal(result, null);
  }
});

test('Starlink-Standardroute wird bei fehlender Hausnetz-LAN-Route nicht gescannt', async () => {
  const {result,warnings}=await runFunctionNode('system_scan_targets',{msg:{payload:'192.168.0.1 via 192.168.1.1 dev wlp2s0 src 192.168.1.236 uid 1000'}});
  assert.equal(result,null);
  assert.match(warnings[0],/statt 192\.168\.0/);
});

test('LAN-Scan prüft bekannte Pis zuerst und bewahrt Geräte bis zu deren neuer Prüfung', async () => {
  const previous={subnet:'192.168.0',results:{'192.168.0.150':{ip:'192.168.0.150',state:'online'}}};
  const {result,flow}=await runFunctionNode('system_scan_targets',{msg:{payload:'192.168.0.1 dev enp1s0 src 192.168.0.149 uid 1000'},flowValues:{systemNetworkScan:previous}});
  assert.equal(result.scanSubnet,'192.168.0');
  assert.deepEqual(result.payload.slice(0,5),['192.168.0.104','192.168.0.105','192.168.0.125','192.168.0.150','192.168.0.190']);
  assert.equal(new Set(result.payload).size,253);
  assert.equal(flow.get('systemNetworkScan').results['192.168.0.150'].state,'online');
});

test('Dashboard-Payload enthält SSH-Fehler, Hausnetz und gemessene Laufzeit', async () => {
 const scan={scanId:'test',subnet:'192.168.0',expected:1,completed:1,results:{'192.168.0.150':{ip:'192.168.0.150',state:'online',observedAt:'2026-11-14T10:00:00Z'}}};
 const {result}=await runFunctionNode('system_scan_result',{msg:{liveMetricsUpdate:true},flowValues:{systemNetworkScan:scan,systemLiveMetricsError:'Tresor fehlt',systemLiveMetrics:{'192.168.0.150':{hostname:'PICENTER2',uptimeSeconds:3600,temperatureC:44,observedAt:'2026-11-14T10:00:00Z'}}}});
 assert.equal(result.payload.system.network.liveMetricsError,'Tresor fehlt');
 assert.equal(result.payload.system.network.subnet,'192.168.0');
 assert.equal(result.payload.system.devices[0].uptimeSeconds,3600);
 assert.equal(result.payload.system.devices[0].temperatureSource,'live');
 assert.equal(result.payload.system.devices[0].metricsObservedAt,'2026-11-14T10:00:00Z');
});
