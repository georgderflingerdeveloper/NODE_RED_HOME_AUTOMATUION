#!/usr/bin/env python3
"""Konsistente SQLite-Sicherung und Solar-CSV-Archiv, optional per rclone zu Drive."""
import argparse
import csv
import datetime as dt
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import zipfile

TABLES = ('solar_power_samples', 'hourly_snapshots', 'solaredge_meter_readings',
          'solaredge_inverter_readings', 'daily_energy_balance',
          'daily_energy_reconciliation', 'solaredge_cloud_energy', 'wallbox_sessions', 'wallbox_samples',
          'wallbox_session_details', 'wallbox_energy_deltas', 'wallbox_price_parts', 'tariff_slots')


def cell(value):
    if isinstance(value, str) and value.startswith(('=', '+', '-', '@', '\t', '\r')):
        return "'" + value
    return value


def atomic_json(path, value):
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temp.chmod(0o600)
    temp.replace(path)


def create_archive(database, output, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    stamp = now.strftime('%Y-%m-%dT%H-%M-%S-%fZ')
    target = output / f'solar-history-{stamp}.zip'
    temporary = target.with_suffix('.partial')
    try:
        with tempfile.TemporaryDirectory(prefix='solar-backup-', dir=output) as directory:
            snapshot = Path(directory) / 'home-automation.sqlite'
            with sqlite3.connect(Path(database).resolve().as_uri() + '?mode=ro', uri=True, timeout=30) as source:
                with sqlite3.connect(snapshot) as destination:
                    source.backup(destination, pages=256, sleep=0.05)
            manifest = {'schemaVersion': 1, 'createdAt': now.isoformat(), 'tables': {}, 'units': 'W / kWh', 'timestamps': 'UTC; day = Europe/Vienna'}
            with sqlite3.connect(snapshot) as source:
                if source.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                    raise RuntimeError('SQLite-Integritätsprüfung fehlgeschlagen.')
                with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
                    archive.write(snapshot, 'home-automation.sqlite')
                    for table in TABLES:
                        if not source.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone():
                            continue
                        cursor = source.execute(f'SELECT * FROM {table} ORDER BY 1')
                        with archive.open(f'csv/{table}.csv', 'w') as binary:
                            with io.TextIOWrapper(binary, encoding='utf-8-sig', newline='') as text:
                                writer = csv.writer(text, delimiter=';')
                                writer.writerow([column[0] for column in cursor.description])
                                count = 0
                                for row in cursor:
                                    writer.writerow([cell(value) for value in row])
                                    count += 1
                        manifest['tables'][table] = count
                    with snapshot.open('rb') as database_file:
                        manifest['databaseSha256'] = hashlib.file_digest(database_file, 'sha256').hexdigest()
                    archive.writestr('manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2))
        temporary.chmod(0o600)
        temporary.replace(target)
        return target
    finally:
        temporary.unlink(missing_ok=True)


def run(config):
    database = Path(config['database']).expanduser().resolve()
    if not database.is_file():
        raise RuntimeError('Quelldatenbank fehlt; es wird keine leere Datenbank angelegt.')
    directory = Path(config['backupDirectory']).expanduser().resolve()
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    status_file = database.parent / 'backup-status.json'
    with (directory / '.backup.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('Eine Sicherung läuft bereits.')
        old = {}
        if status_file.exists():
            try:
                old = json.loads(status_file.read_text())
            except (ValueError, OSError):
                pass
        status = {**old, 'lastAttemptAt': dt.datetime.now(dt.timezone.utc).isoformat()}
        try:
            archive = create_archive(database, directory)
            status.update(localArchive=archive.name, lastLocalSuccessAt=dt.datetime.now(dt.timezone.utc).isoformat())
            remote = config.get('driveRemote', '')
            if remote:
                if ':' not in remote or remote.startswith(('/', ':')):
                    raise RuntimeError('Ungültiges rclone-Drive-Ziel.')
                executable = config.get('rclone', 'rclone')
                for candidate in sorted(directory.glob('solar-history-*.zip')):
                    marker = candidate.with_suffix('.uploaded.json')
                    if marker.exists():
                        continue
                    # copyto verändert keine anderen Drive-Dateien; Wiederholung nutzt denselben Namen.
                    destination = remote.rstrip('/') + '/' + candidate.name
                    options = [executable, 'copyto', str(candidate), destination, '--retries', '3', '--low-level-retries', '3', '--contimeout', '20s', '--timeout', '2m', '--log-level', 'ERROR']
                    result = subprocess.run(options, capture_output=True, timeout=900)
                    if result.returncode:
                        raise RuntimeError('Google-Drive-Upload fehlgeschlagen. rclone-Anmeldung und Verbindung prüfen.')
                    check = subprocess.run([executable, 'check', str(directory), remote, '--include', candidate.name, '--one-way', '--checksum', '--log-level', 'ERROR'], capture_output=True, timeout=900)
                    if check.returncode:
                        raise RuntimeError('Google-Drive-Prüfung fehlgeschlagen. Lokales Archiv bleibt erhalten.')
                    atomic_json(marker, {'uploadedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'size': candidate.stat().st_size})
                status.update(state='ok', message='SQLite und CSV gesichert; Google-Drive-Upload geprüft.', lastCloudSuccessAt=dt.datetime.now(dt.timezone.utc).isoformat())
            else:
                status.update(state='local-only', message='Lokale Sicherung erfolgreich. Google-Drive-Anmeldung fehlt.')
            # Ohne bestätigten Upload keine automatische Löschung ungesicherter Archive.
            cutoff = dt.datetime.now().timestamp() - max(1, int(config.get('localRetentionDays', 31))) * 86400
            for candidate in directory.glob('solar-history-*.zip'):
                marker = candidate.with_suffix('.uploaded.json')
                if marker.exists() and candidate.stat().st_mtime < cutoff:
                    candidate.unlink()
                    marker.unlink()
            atomic_json(status_file, status)
            print(status['message'])
            return status
        except Exception:
            status.update(state='error', message='Sicherung fehlgeschlagen; lokale Archive bleiben erhalten.')
            atomic_json(status_file, status)
            raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True)
    args = parser.parse_args()
    os.umask(0o077)
    try:
        status = run(json.loads(Path(args.config).expanduser().read_text()))
        return 0 if status['state'] == 'ok' else 2
    except Exception as error:
        print(str(error))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
