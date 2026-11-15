import datetime as dt
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
import zipfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('solar_backup', Path(__file__).resolve().parents[1] / 'tools/backup/solar-backup.py')
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)

class BackupTests(unittest.TestCase):
    def test_wal_snapshot_and_csv_restore(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            database = directory / 'history.sqlite'
            source = sqlite3.connect(database)
            source.execute('PRAGMA journal_mode=WAL')
            source.execute('CREATE TABLE solar_power_samples(observed_at TEXT, pv_power_w REAL, note TEXT)')
            source.execute('INSERT INTO solar_power_samples VALUES(?,?,?)', ('2026-11-15T12:00:00Z', 500, '=1+2'))
            source.commit()
            archive = backup.create_archive(database, directory / 'backups')
            with zipfile.ZipFile(archive) as saved:
                self.assertIn('500.0', saved.read('csv/solar_power_samples.csv').decode('utf-8-sig'))
                self.assertIn("'=1+2", saved.read('csv/solar_power_samples.csv').decode('utf-8-sig'))
                self.assertEqual(json.loads(saved.read('manifest.json'))['tables']['solar_power_samples'], 1)
                saved.extract('home-automation.sqlite', directory / 'restore')
            with sqlite3.connect(directory / 'restore/home-automation.sqlite') as restored:
                self.assertEqual(restored.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
                self.assertEqual(restored.execute('SELECT pv_power_w FROM solar_power_samples').fetchone()[0], 500)
            source.close()

    def test_failed_upload_keeps_archive_and_no_success_marker(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            database = directory / 'history.sqlite'
            with sqlite3.connect(database) as db:
                db.execute('CREATE TABLE test(id INTEGER)')
            config = {'database':str(database), 'backupDirectory':str(directory/'backups'), 'driveRemote':'drive:Solar', 'localRetentionDays':1}
            class Failed:
                returncode = 1
            with patch.object(backup.subprocess, 'run', return_value=Failed()):
                with self.assertRaisesRegex(RuntimeError, 'Upload fehlgeschlagen'):
                    backup.run(config)
            self.assertEqual(len(list((directory/'backups').glob('solar-history-*.zip'))), 1)
            self.assertEqual(len(list((directory/'backups').glob('*.uploaded.json'))), 0)
            self.assertEqual(json.loads((directory/'backup-status.json').read_text())['state'], 'error')
            class Success:
                returncode = 0
            with patch.object(backup.subprocess, 'run', return_value=Success()) as upload:
                self.assertEqual(backup.run(config)['state'], 'ok')
                self.assertEqual(upload.call_count, 4) # altes und neues Archiv jeweils kopiert UND geprüft
            self.assertEqual(len(list((directory/'backups').glob('*.uploaded.json'))), 2)

    def test_missing_database_never_creates_empty_source(self):
        with tempfile.TemporaryDirectory() as temp:
            file = Path(temp)/'missing.sqlite'
            with self.assertRaisesRegex(RuntimeError, 'Quelldatenbank fehlt'):
                backup.run({'database':str(file),'backupDirectory':str(Path(temp)/'backups')})
            self.assertFalse(file.exists())

if __name__ == '__main__':
    unittest.main()
