import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const path='flow-src/flows/system--system_dashboard_flow/templates/technisches-hausnetz.html';
function panel(){const source=fs.readFileSync(path,'utf8');const scope={$watch(){}};vm.runInNewContext(source.match(/<script>([\s\S]*?)<\/script>/)[1],{scope,angular:{copy:x=>structuredClone(x)}});return scope;}
test('Raspberry-Anzeige unterscheidet fehlende Laufzeit vom echten Systemstart',()=>{const s=panel();assert.equal(s.uptimeLabel(null),'—');assert.equal(s.uptimeLabel(90060),'1 Tage 1 Std 1 Min');assert.equal(s.bootAt({uptimeSeconds:null}),null);assert.equal(s.bootAt({uptimeSeconds:3600,metricsObservedAt:'2026-11-14T10:00:00Z'}),Date.parse('2026-11-14T09:00:00Z'));});
test('Fehlender Tresor wird im Dashboard verständlich statt als Wartezustand erklärt',()=>{const s=panel();s.systemView.network.liveMetricsError="ENOENT: no such file or directory, open '/user/system-credentials.vault.json'";assert.match(s.metricsError(),/fehlt der SSH-Zugangstresor/);});
