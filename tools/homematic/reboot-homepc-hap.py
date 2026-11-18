"""Restart the locally reachable HmIP-HAP, at most once per hour."""
import fcntl
import os
import runpy
import socket
import time
from pathlib import Path

HOME = Path('/home/georgshomepc')
STATE = HOME / '.node-red-instances/1880/homematic-ip'


def main():
    os.environ.pop('HAP_TARGET_IP', None)
    request = runpy.run_path(str(HOME / 'netzdiagnose/hap-client.py'))['request']
    with (STATE / 'hap-reboot.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        last_attempt = STATE / 'hap-reboot-attempt'
        if last_attempt.exists() and time.time() - float(last_attempt.read_text()) < 3600:
            print('HAP-Neustart gesperrt: letzter Versuch vor weniger als einer Stunde')
            return

        code, data = request(b'n')
        if code != 1 or len(data) < 12 or socket.inet_ntoa(data[4:8]) != '192.168.0.149':
            raise RuntimeError('HAP oder Gateway lokal nicht bestätigt')

        pending = last_attempt.with_suffix('.tmp')
        with pending.open('w') as stamp:
            stamp.write(str(time.time()))
            stamp.flush()
            os.fsync(stamp.fileno())
        pending.replace(last_attempt)

        code, _ = request(b'R')
        if code not in (1, 2):
            raise RuntimeError('Neustart vom HAP nicht bestätigt')
        print('Neustart vom HAP bestätigt')


if __name__ == '__main__':
    os.umask(0o077)
    try:
        main()
    except Exception:
        raise SystemExit('HAP-Neustart fehlgeschlagen oder nicht bestätigt')
