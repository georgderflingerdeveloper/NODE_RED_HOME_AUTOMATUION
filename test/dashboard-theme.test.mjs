import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
test('Graustufen erhalten sämtliche Template-Scripts, Bindings und Bedienelemente',()=>{
 const baseline=JSON.parse(fs.readFileSync('test/fixtures/dashboard-theme-baseline.json'));
 for(const [path,expected] of Object.entries(baseline)){
  const source=fs.readFileSync(path,'utf8');
  assert.equal(hash((source.match(/<script\b[^>]*>[\s\S]*?<\/script>/g)||[]).join('\n')),expected.scripts,path);
  const markup=source.replace(/<style[^>]*>[\s\S]*?<\/style>/g,'').replace(/style="[^"]*"/g,'style=""').trim();
  assert.equal(hash(markup),expected.markup,path);
 }
});
test('Preis- und LED-Signalfarben bleiben erhalten; Tastaturfokus sichtbar',()=>{
 const cost=fs.readFileSync('flow-src/flows/kosten--kosten_flow/templates/cost-dashboard.html','utf8');
 for(const color of ['#a4f6a0','#ffe27a','#ffb46b','#ff9292'])assert.ok(cost.includes(color));
 const io=fs.readFileSync('flow-src/flows/system--system_dashboard_flow/templates/phidgets-hardware-und-verbindungen.html','utf8');
 for(const color of ['#82ef7b','#ffd166','#ff7171'])assert.ok(io.includes(color));
 const global=fs.readFileSync('flow-src/flows/system--system_dashboard_flow/templates/project-version-and-branch-info.html','utf8');
 assert.ok(global.includes(':focus-visible'));assert.ok(global.includes('outline-offset:3px'));
});
