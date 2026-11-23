#!/usr/bin/python3
"""Sichert einen konsistenten Scheduler-Stand und prüft die Drive-Kopie."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

SOURCE = '/home/georgshomepc/.node-red-instances/1880/scheduler-data/scheduler-setup.json'
STATE = Path('/var/lib/georg-scheduler-backup')
REMOTE = 'homeauto-drive:HOMEPC_LINUX_RECOVERY/Scheduler/'
RCLONE = ['/usr/local/libexec/georg-recovery-rclone', '--config',
          '/etc/georg-homepc-recovery/rclone.conf', '--drive-root-folder-id',
          '1RiFjIXWG80NfkJYBY8ECS1wbaMFSihqx', '--retries', '2']

def run(args):
    return subprocess.check_output(args, timeout=120)

def main():
    data = run(['/usr/sbin/runuser', '-u', 'georgshomepc', '--', '/usr/bin/cat', SOURCE])
    digest = hashlib.sha256(data).hexdigest()
    receipt = STATE / 'status.json'
    if receipt.exists() and json.loads(receipt.read_text())['digest'] == digest:
        return
    if json.loads(data)['schemaVersion'] != 1:
        raise ValueError('Unbekannte Scheduler-Dateiversion')
    with tempfile.NamedTemporaryFile(dir=STATE) as snapshot:
        snapshot.write(data)
        snapshot.flush()
        run(RCLONE + ['copyto', snapshot.name, REMOTE + 'Versionen/' + digest + '.json'])
        current = REMOTE + 'scheduler-setup.json'
        run(RCLONE + ['copyto', snapshot.name, current, '--checksum'])
        if run(RCLONE + ['cat', current]) != data:
            raise ValueError('Die Drive-Kopie weicht vom lokalen Stand ab.')
    temporary = STATE / 'status.tmp'
    temporary.write_text(json.dumps({'digest': digest, 'at': datetime.datetime.now(datetime.timezone.utc).isoformat()}))
    os.chmod(temporary, 0o644)
    temporary.replace(receipt)

if __name__ == '__main__':
    main()
