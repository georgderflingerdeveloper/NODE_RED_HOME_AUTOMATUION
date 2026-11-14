#!/usr/bin/env python3
"""Read-only Linux host snapshot; no third-party dependencies."""
import json, os, platform, subprocess, time
from pathlib import Path

def cpu():
    result = {}
    for line in Path('/proc/stat').read_text().splitlines():
        p = line.split()
        if p and (p[0] == 'cpu' or p[0][3:].isdigit() and p[0].startswith('cpu')):
            v = list(map(int, p[1:9]))
            result[p[0]] = (sum(v), v[3] + v[4])
    return result

def parse_process_stat(text, page_size):
    # comm may contain spaces and parentheses; never read command lines or environment.
    end = text.rfind(')')
    pid = int(text[:text.index(' ')])
    name = text[text.index('(')+1:end]
    fields = text[end+2:].split()
    return dict(pid=pid, name=name, state=fields[0], ticks=int(fields[11])+int(fields[12]),
                started=int(fields[19]), resident=max(0, int(fields[21]))*page_size,
                lastCpu=int(fields[36]), threads=int(fields[17]))

def processes():
    result = {}
    page_size = os.sysconf('SC_PAGE_SIZE')
    for p in Path('/proc').iterdir():
        if not p.name.isdigit() or int(p.name) == os.getpid(): continue
        try:
            item = parse_process_stat((p/'stat').read_text(), page_size)
            result[item['pid']] = item
        except (OSError, ValueError, IndexError): pass
    return result

def process_usage(first, second, elapsed, threads, memory_total, ticks_per_second):
    result = []
    for pid, item in second.items():
        previous = first.get(pid)
        # Ignore new processes and reused PIDs rather than inventing interval CPU usage.
        if previous is None or previous['started'] != item['started']: continue
        percent = max(0, item['ticks']-previous['ticks']) / max(elapsed, .001) / ticks_per_second * 100
        result.append(dict(pid=pid, name=item['name'], cpuPercent=round(percent, 1),
                           hostCpuPercent=round(percent/max(threads, 1), 2),
                           memoryBytes=item['resident'], memoryPercent=round(item['resident']/memory_total*100, 1),
                           lastCpu=item['lastCpu'], threads=item['threads'], state=item['state']))
    return dict(topCpu=sorted(result, key=lambda p:(-p['cpuPercent'], -p['memoryBytes'], p['pid']))[:8],
                topMemory=sorted(result, key=lambda p:(-p['memoryBytes'], p['pid']))[:8],
                measuredCount=len(result), sampleSeconds=round(elapsed, 3))

def collect():
    first = cpu()
    first_processes = processes()
    started = time.monotonic()
    time.sleep(0.8)
    second_processes = processes()
    elapsed = time.monotonic() - started
    second = cpu()
    usage = {k: round(max(0, min(100, 100 * (1 - (v[1]-first[k][1]) / max(1, v[0]-first[k][0])))), 1) for k,v in second.items() if k in first}
    mem = {p[0].rstrip(':'): int(p[1])*1024 for line in Path('/proc/meminfo').read_text().splitlines() if len(p := line.split()) >= 2}
    info = Path('/proc/cpuinfo').read_text().split('\n\n')
    physical = set()
    model = ''
    topology = {}
    for block in info:
        fields = dict(line.split(':',1) for line in block.splitlines() if ':' in line)
        fields = {k.strip():v.strip() for k,v in fields.items()}
        model = fields.get('model name',model)
        if 'core id' in fields:
            key = (fields.get('physical id','0'),fields['core id'])
            physical.add(key)
            topology['cpu'+fields['processor']] = key
    mounts = json.loads(subprocess.check_output(['findmnt','--json','--bytes','--output','SOURCE,TARGET,FSTYPE,SIZE,USED,AVAIL,USE%','--list'],timeout=3))['filesystems']
    disks=[]
    for m in mounts:
        if not m['source'].startswith('/dev/') or m['fstype'] in ('squashfs','iso9660'): continue
        try:
            st=os.statvfs(m['target'])
            disks.append(dict(device=m['source'],mount=m['target'],filesystem=m['fstype'],total=st.f_blocks*st.f_frsize,used=(st.f_blocks-st.f_bfree)*st.f_frsize,available=st.f_bavail*st.f_frsize,percent=round(100*(st.f_blocks-st.f_bfree)/max(1,st.f_blocks),1)))
        except OSError: pass
    temps=[]
    for p in Path('/sys/class/thermal').glob('thermal_zone*'):
        try:
            v=int((p/'temp').read_text())/1000
            if 0<v<150: temps.append(dict(name=(p/'type').read_text().strip(),value=v))
        except (OSError,ValueError): pass
    for sensor in Path('/sys/class/hwmon').glob('hwmon*'):
        for p in sensor.glob('temp*_input'):
            try:
                v=int(p.read_text())/1000
                label=p.with_name(p.name.replace('_input','_label'))
                name=(sensor/'name').read_text().strip()+' · '+(label.read_text().strip() if label.exists() else p.stem)
                if 0<v<150: temps.append(dict(name=name,value=v))
            except (OSError,ValueError): pass
    net=[]
    for p in Path('/sys/class/net').iterdir():
        if p.name=='lo' or (p/'operstate').read_text().strip()!='up': continue
        net.append(dict(name=p.name,rx=int((p/'statistics/rx_bytes').read_text()),tx=int((p/'statistics/tx_bytes').read_text())))
    total=mem['MemTotal']; available=mem.get('MemAvailable',mem['MemFree'])
    load_processes = process_usage(first_processes, second_processes, elapsed, os.cpu_count() or 1, total, os.sysconf('SC_CLK_TCK'))
    core_ids = {key:i for i,key in enumerate(sorted(physical))}
    per_core = [dict(name=k,percent=v,physicalCore=core_ids.get(topology.get(k)),active=v>0) for k,v in usage.items() if k!='cpu']
    busiest = max(per_core,key=lambda c:c['percent']) if per_core else None
    return dict(processes=load_processes,timestamp=int(time.time()*1000),hostname=platform.node(),os=platform.freedesktop_os_release().get('PRETTY_NAME',platform.system()),kernel=platform.release(),architecture=platform.machine(),cpu=dict(model=model,cores=len(physical) or os.cpu_count(),threads=os.cpu_count(),percent=usage.pop('cpu'),perCore=per_core,activeThreads=sum(c['active'] for c in per_core),busiestThread=busiest['name'] if busiest and busiest['percent']>0 else None,load=list(os.getloadavg())),memory=dict(total=total,available=available,free=mem['MemFree'],used=total-available,percent=round(100*(total-available)/total,1),cache=mem.get('Cached',0)),swap=dict(total=mem['SwapTotal'],used=mem['SwapTotal']-mem['SwapFree']),uptime=float(Path('/proc/uptime').read_text().split()[0]),disks=disks,temperatures=temps,network=net)

if __name__=='__main__':
    print(json.dumps(collect(),ensure_ascii=False))
