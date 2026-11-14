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

def collect():
    first = cpu()
    time.sleep(0.4)
    second = cpu()
    usage = {k: round(max(0, min(100, 100 * (1 - (v[1]-first[k][1]) / max(1, v[0]-first[k][0])))), 1) for k,v in second.items() if k in first}
    mem = {p[0].rstrip(':'): int(p[1])*1024 for line in Path('/proc/meminfo').read_text().splitlines() if len(p := line.split()) >= 2}
    info = Path('/proc/cpuinfo').read_text().split('\n\n')
    physical = set()
    model = ''
    for block in info:
        fields = dict(line.split(':',1) for line in block.splitlines() if ':' in line)
        fields = {k.strip():v.strip() for k,v in fields.items()}
        model = fields.get('model name',model)
        if 'core id' in fields: physical.add((fields.get('physical id','0'),fields['core id']))
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
    return dict(timestamp=int(time.time()*1000),hostname=platform.node(),os=platform.freedesktop_os_release().get('PRETTY_NAME',platform.system()),kernel=platform.release(),architecture=platform.machine(),cpu=dict(model=model,cores=len(physical) or os.cpu_count(),threads=os.cpu_count(),percent=usage.pop('cpu'),perCore=[dict(name=k,percent=v) for k,v in usage.items()],load=list(os.getloadavg())),memory=dict(total=total,available=available,free=mem['MemFree'],used=total-available,percent=round(100*(total-available)/total,1),cache=mem.get('Cached',0)),swap=dict(total=mem['SwapTotal'],used=mem['SwapTotal']-mem['SwapFree']),uptime=float(Path('/proc/uptime').read_text().split()[0]),disks=disks,temperatures=temps,network=net)

if __name__=='__main__':
    print(json.dumps(collect(),ensure_ascii=False))
