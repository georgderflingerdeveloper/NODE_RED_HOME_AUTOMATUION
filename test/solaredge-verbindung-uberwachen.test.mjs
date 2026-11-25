import test from 'node:test';
import assert from 'node:assert/strict';
import {runFunctionNode} from './helpers/function-node-harness.mjs';
import {readFileSync} from 'node:fs';

const run=globalValues=>runFunctionNode('se_connection_watchdog',{
    globalValues, contextValues:{healthyCycles:1}
});

test('Aktuelle, verspätete oder nur teilweise gelieferte Werte starten keinen Transportneubau',async()=>{
    const now=Date.now();
    for(const [pv,grid] of [[now,now],[now,0],[0,now],[0,0]]){
        const {result}=await run({SolarEdgeTransportState:'connected',SolarEdgePvLastSuccessMs:pv,
            SolarEdgeGridLastSuccessMs:grid,SolarEdgeTransportRetryDueMs:now+120000});
        assert.equal(result.length,4);
        assert.equal(result[3].payload.OnlineFlag,Boolean(pv && grid));
        assert.equal(result[3].payload.ReconnectInSeconds,0);
        assert.equal(result[3].payload.CanReconnect,false);
    }
});

test('Realer Abbruch schlägt gerade empfangene Werte und zeigt den Retry des Clients',async()=>{
    const now=Date.now();
    const {result}=await run({SolarEdgeTransportState:'disconnected',SolarEdgePvLastSuccessMs:now,
        SolarEdgeGridLastSuccessMs:now,SolarEdgeTransportRetryDueMs:now+120000});
    const status=result[3].payload;
    assert.equal(status.State,'OFFLINE');
    assert.equal(status.CanReconnect,true);
    assert.ok(status.ReconnectInSeconds>=119 && status.ReconnectInSeconds<=120);
});

test('Nur der manuelle Steuerpfad erreicht den Flex-Connector, der TCP-Client übernimmt echte Abbrüche',()=>{
    const flows=JSON.parse(readFileSync(new URL('../flows.json',import.meta.url)));
    assert.deepEqual(flows.filter(n=>n.wires?.flat().includes('se_modbus_reconnector')).map(n=>n.id),['se_manual_modbus_link_in']);
    assert.deepEqual(flows.filter(n=>n.wires?.flat().includes('se_auto_reconnect')).map(n=>n.id),['se_control_buttons']);
    const client=flows.find(n=>n.id===flows.find(n=>n.id==='se_auto_reconnect').server);
    assert.equal(client.reconnectOnTimeout,true);
    assert.equal(Number(client.reconnectTimeout),120000);
});
