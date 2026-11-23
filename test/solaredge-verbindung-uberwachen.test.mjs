import test from 'node:test';
import assert from 'node:assert/strict';
import {runFunctionNode} from './helpers/function-node-harness.mjs';

test('Watchdog wartet auf den geplanten Reconnect und hält danach den Mindestabstand ein', async()=>{
    const now = Date.now();
    const run = globalValues => runFunctionNode('se_connection_watchdog',{globalValues});
    const pending = await run({SolarEdgeReconnectDueMs:now+10000});
    assert.equal(pending.result[4],null);
    assert.equal(pending.result[3].payload.State,'OFFLINE');
    assert.equal((await run({SolarEdgeLastReconnectMs:now})).result[4],null);
    const retry = await run({SolarEdgeLastReconnectMs:now-16000});
    assert.equal(retry.result[4].payload.tcpHost,'192.168.0.128');
    assert.ok(retry.global.get('SolarEdgeLastReconnectMs')>=now);
});
