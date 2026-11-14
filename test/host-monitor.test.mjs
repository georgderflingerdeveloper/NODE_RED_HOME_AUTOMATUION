import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

test('Linux-Hostmonitor liefert konsistente reale CPU-, RAM- und Dateisystemwerte', {skip:process.platform!=='linux'}, () => {
  const data=JSON.parse(execFileSync('python3',['tools/host-monitor/collect.py'],{encoding:'utf8',timeout:5000}));
  assert.ok(data.timestamp>Date.now()-10000);
  assert.ok(data.hostname);
  assert.ok(data.cpu.cores>0 && data.cpu.threads>=data.cpu.cores);
  assert.equal(data.cpu.perCore.length,data.cpu.threads);
  for(const core of [data.cpu,...data.cpu.perCore])assert.ok(core.percent>=0 && core.percent<=100);
  assert.equal(data.memory.used+data.memory.available,data.memory.total);
  assert.ok(data.memory.available>=0 && data.memory.available<=data.memory.total);
  for(const disk of data.disks){assert.ok(disk.total>0);assert.ok(disk.available>=0 && disk.available<=disk.total);assert.ok(disk.used>=0 && disk.used<=disk.total);}
  assert.ok(data.uptime>0);
});

test('Hostmonitor bleibt von den vorhandenen Automations-Flows getrennt', () => {
  const flows=JSON.parse(readFileSync('flows.json','utf8'));
  const host=flows.filter(n=>n.z==='host_monitor_flow');
  const ids=new Set(host.map(n=>n.id));
  for(const n of host)for(const output of n.wires||[])for(const id of output)assert.ok(ids.has(id));
  const exec=host.find(n=>n.type==='exec');
  assert.equal(exec.addpay,false);
  assert.equal(exec.timer,'4');
  assert.ok(host.some(n=>n.type==='inject' && n.repeat==='5'));
});

test('Hostmonitor berechnet Prozesslast und behandelt PID-Wechsel sowie schwierige Prozessnamen', {skip:process.platform!=='linux'}, () => {
  execFileSync('python3',['test/host-monitor-core.py'],{encoding:'utf8',timeout:5000});
});

test('Ein gezielt belasteter CPU-Thread und dessen Prozess werden erkannt', {skip:process.platform!=='linux'}, async () => {
  const {spawn}=await import('node:child_process');
  const {once}=await import('node:events');
  const worker=spawn('python3',['-u','-c',"import os; cpu=min(os.sched_getaffinity(0)); os.sched_setaffinity(0,{cpu}); print(cpu,flush=True)\nwhile True: pass"],{stdio:['ignore','pipe','pipe']});
  try {
    const [output]=await once(worker.stdout,'data');
    const core=Number(output.toString().trim());
    const data=JSON.parse(execFileSync('python3',['tools/host-monitor/collect.py'],{encoding:'utf8',timeout:5000}));
    const process=data.processes.topCpu.find(p=>p.pid===worker.pid);
    assert.ok(process,'CPU-Verbraucher muss in der Rangliste erscheinen');
    assert.ok(process.cpuPercent>40);
    assert.equal(process.lastCpu,core);
    assert.ok(data.cpu.perCore.find(c=>c.name==='cpu'+core).percent>40);
    assert.ok(Math.abs(process.hostCpuPercent-process.cpuPercent/data.cpu.threads)<0.02);
  } finally {worker.kill('SIGTERM');await once(worker,'exit');}
});
