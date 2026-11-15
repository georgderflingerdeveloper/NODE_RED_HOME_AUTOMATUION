# Solar-Historie, CSV und Google-Drive-Sicherung · 0.23.0

Der bestehende History-Knoten speichert weiterhin SolarEdge-Netz- und PV-Zähler,
Stundenenergie, Tagesabgleiche und verfügbare Cloud-Energie in SQLite.
Zusätzlich enthält `solar_power_samples` eine Leistungsstichprobe pro Minute
sowie jeden Online/Offline-Wechsel. Werte sind Watt, Zeitstempel UTC;
Tagesbilanzen verwenden Europe/Vienna. Offline-Leistung ist NULL, keine erfundene
Nullproduktion. Rohdaten werden mit dem bestehenden Geheimnisfilter gespeichert.
Historische Daten werden nicht automatisch gelöscht. Vor Einführung der
Minutenwerte gibt es nur die bereits vorhandenen Zähler- und Stundenwerte.

## Export

Auf SOLAR → HISTORIE & SICHERUNG Datensatz und optional UTC-Datumsgrenzen wählen.
Ohne Datum erfolgt ein vollständiger Export. Bis-Datum einschließlich.

`GET /home-automation/solar/export.csv?dataset=hourly&from=2026-11-01&to=2026-11-30`

Datensätze: `power`, `hourly`, `meter`, `inverter`, `daily`, `grid`, `cloud`.
CSV: UTF-8 mit BOM, Semikolon, englische Spaltennamen mit Einheiten, Dezimalpunkt.
Export liest eine konsistente SQLite-Transaktion, sendet zeilenweise mit
Backpressure und verändert keine Messdaten. Texte, die Tabellenformeln auslösen
könnten, werden neutralisiert. Kein stilles Abschneiden der Ergebnismenge.
Der Status steht unter `/home-automation/solar/history-status`.
Die Routen verwenden denselben LAN-Zugang wie das bestehende Dashboard.

## Automatische Sicherung

`tools/backup/solar-backup.py` erstellt über die SQLite-Backup-API einen geprüften
Snapshot einschließlich WAL-Inhalt. ZIP enthält `home-automation.sqlite`, sieben
CSV-Dateien für vorhandene Solar-Tabellen und ein Manifest mit Zeilenzahlen und
SHA-256 der Datenbank. Keine Tresor- oder Authentifizierungsdateien werden kopiert.
Die SQLite-Datei enthält auch die bisherige fachliche Telemetrie/Tarife/Abrechnung.
Temporäre Snapshots werden nach Abschluss entfernt. Ein Lock verhindert parallele
Sicherungen. Unvollständige ZIPs werden nie hochgeladen.

Der Benutzertimer `home-automation-solar-backup.timer` läuft täglich um 02:30
Europe/Vienna (bis zu zwei Minuten Verzögerung), holt verpasste Läufe nach.
Mit `systemctl --user start home-automation-solar-backup.service` sofort starten.
Konfiguration: `~/.config/home-automation/solar-backup.json` (Modus 0600).
Die beiliegenden Units entsprechen dem Home-PC-Projektpfad; auf anderen Rechnern
ExecStart anpassen. Standardziel lokal: `~/.local/share/home-automation/solar-backups`.

Für automatische Cloud-Uploads muss rclone auf diesem Rechner mit Google Drive
angemeldet sein. Connector-Zugriff in einer Agentensitzung liefert keine
Daueranmeldung für einen systemd-Dienst. Die rclone-Konfiguration bleibt außerhalb
Git mit Modus 0600. Keine Tokens in Projektdateien oder Befehlsargumenten speichern.
`driveRemote` z.B. `georgshome-solar:` setzen; die rclone-Remote soll als root_folder_id
den verifizierten Ordner `GEORGSHOME Solar Backups` verwenden. Der Zugang zum
bereits separat angelegten Ordner muss bei der Einrichtung geprüft werden.
Ein auf app-eigene Dateien beschränkter Drive-Scope kann den über den Connector
angelegten Ordner nicht sehen; in diesem Fall eine eigene rclone-Zielmappe anlegen. Den Ordner niemals
öffentlich freigeben.

Uploads verwenden `copyto`, danach Größen-/Prüfsummenvergleich; keine Drive-Dateien
werden gelöscht. Erfolgsmarker entstehen erst nach bestätigter Prüfung.
Fehlgeschlagene Uploads werden beim nächsten Lauf erneut versucht.
Lokal werden nur nachweislich hochgeladene ZIPs nach 31 Tagen entfernt.
Ohne Drive-Anmeldung laufen tägliche lokale Sicherungen weiter, Status ist
`local-only`; das Dashboard meldet die fehlende Cloud-Anbindung ausdrücklich.
`lastCloudSuccessAt` bleibt bei Fehlern als letzter Erfolg sichtbar.

## Wiederherstellung prüfen

ZIP in ein separates Verzeichnis entpacken und mit Python/SQLite
`PRAGMA integrity_check` sowie Messwertanzahlen prüfen. Für eine tatsächliche
Wiederherstellung zuerst Node-RED stoppen und die AKTIVE Datenbank samt WAL/SHM
separat sichern. Dann die geprüfte Snapshot-Datei einsetzen und neu starten.
`tools/restore-history-db.mjs` hat einen älteren festen UserDir-Pfad und ist für
diese Instanz ohne Anpassung NICHT zu verwenden.

Tests: `test/solar-history-export.test.mjs`, `test/solar-backup.test.mjs`.
