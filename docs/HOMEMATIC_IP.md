# Homematic IP · v0.16.0

## Umfang
Eigener Flow HOMEMATIC IP und Dashboard-Menü Homematic IP. HmIP-HAP über die
Homematic-IP-Cloud, ausschließlich lesend. Keine direkte lokale Geräte-API am HAP.
Keine Änderungen an Lichtsteuerung, Scheduler, Phidgets, Messdaten oder Abrechnungen.

Community-SDK: homematicip 2.19.1 (Python >=3.12), GPL-3.0-or-later:
https://github.com/hahn-th/homematicip-rest-api
Die Cloud-Schnittstelle ist inoffiziell. Cloudänderungen können Anpassungen erfordern.
Die Bibliothek wird separat installiert und nicht mit diesem Paket ausgeliefert.

## Einrichtung nach bestätigter Installation
Alle Befehle als derselbe Benutzer, unter dem Node-RED läuft. Kein sudo.
Bei abweichendem userDir NODE_RED_USER_DIR exportieren.

```bash
cd ~/Dokumente/HomeAutomation &&
bash tools/homematic/setup.sh &&
bash tools/homematic/authorize.sh
```

SGTIN vom HAP-Aufkleber lokal eingeben (24 Hex-Zeichen, Trennstriche erlaubt).
Optionale App-PIN ebenfalls verdeckt eingeben. Danach die Taste am HAP kurz drücken.
Wartezeit maximal 120 Sekunden. Token wird nicht angezeigt. Bei vorhandenem Zugang
bricht die Autorisierung ab und überschreibt ihn nicht. Eine erneute Registrierung
ist normalerweise unnötig; bei Widerruf Zugang über die Homematic-App entfernen
und die lokale credentials.json bewusst außerhalb von Git sichern/entfernen.

Zugang: ~/.node-red/homematic-ip/credentials.json (0600, Verzeichnis 0700).
Datei nicht hochladen oder ins Git kopieren. Sie enthält ein Klartext-Token mit
Dateisystem-Zugriffsschutz, keine Verschlüsselung. Die Cloud-Berechtigung kann mehr
zulassen; dieser Adapter implementiert ausschließlich Leseaufrufe.

Der installierte Flow erkennt die Autorisierung beim nächsten Poll automatisch.
Nach der ersten Installation muss Node-RED die neuen Custom Nodes per Neustart laden.
Ohne Python-SDK oder Zugang bleibt der Flow grau / Einrichtung ausstehend.
setup.sh benötigt Internet; installieren.sh und --pruefen führen keine Cloudzugriffe aus.

## Daten und Status
Mindestens 60 Sekunden zwischen Abfragen, auch nach Fehlern/manuellem Refresh.
Eine Abfrage maximal 45 Sekunden, nie überlappend. Kein WebSocket-Livestream.
„Abgefragt“ bezeichnet den Cloudbestand, nicht eine garantierte physische Live-Messung.
Seriennummer zeigt die vom SDK gelieferte SGTIN; unbekannte Felder bleiben unbekannt.
TRUE/FALSE, Null und Zahlenwert 0 sind getrennt. DimLevel bleibt als Rohwert 0..1
sichtbar, ohne unbelegte Prozentumrechnung. Einheiten nur für explizit zugeordnete Felder.
Primitive Datenpunkte einschließlich unbekannter Kanaltypen bleiben erweiterbar.
Token-/PIN-/Passwortfelder, Home-Clients, Standort und Sicherheitsjournal werden nicht exportiert.
Raumzuordnung aus META-Gruppen und deren Kanal-/Untergruppenbeziehungen.

Status: Grün = Cloud-Abfrage erfolgreich, Gelb = HAP offline/Gerätewarnung,
Rot = Abfragefehler, Grau = noch nicht eingerichtet/gestartet.
Gerätedetails: current = Cloudstand abgefragt, offline = Gerät laut Cloud unerreichbar,
stale = alter Bestand nach Fehler/Neustart/HAP offline, missing = nicht mehr in Antwort.
Unbekannte Erreichbarkeit wird ausdrücklich als unbekannt angezeigt.

Persistenz: ~/.node-red/homematic-ip/<node-id>-snapshot.json. Letzter erfolgreicher
Bestand, atomar geschrieben. Das getrennte historische Messarchiv ist seit 0.20.0 verfügbar (siehe unten). Verschwundene Geräte bleiben
als missing erhalten. Nach Neustart niemals sofort als aktuell markieren.
UI-Suchtext/offene Zeilen bleiben bei Datenupdates erhalten (nicht browserübergreifend).
Anzeigezeit im Browser in dessen lokaler Zeitzone; Zeitstempel als Unix-Millisekunden.

## Link-Schnittstellen
Eingang `Homematic IP · get / refresh`:
- msg.topic = homematic-ip/get: letzten Bestand sofort ausgeben, ohne Cloudzugriff.
- msg.topic = homematic-ip/refresh: Abfrage, sofern Mindestintervall abgelaufen.
Zusätzlich stehen seit 0.20.0 die unten beschriebenen lesenden Historienabfragen zur Verfügung. Andere Topics werden ignoriert und als Warnung protokolliert. Keine Befehlsweiterleitung.
Ausgang `Homematic IP · Gerätezustände` bleibt für deine Verdrahtung unverbunden.

Ausgabe: topic homematic-ip/state; payload:
```
{schemaVersion:1, provider:'homematic-ip-cloud', readOnly:true,
 status, message, storageError, lastSuccess, intervalMs,
 rows:[{id,name,model,serial,rooms,reachable,lowBattery,quality,lastSeen,
        points:[{name,value,unit}]}]}
```
Keine globale Variable: andere Flows abonnieren den Link-Ausgang oder fordern über
get einen Snapshot an. Späterer Schreibadapter muss separat freigegeben werden.

## Wartung und Tests
- nodes/homematic-ip-core.cjs: Normalisierung, Raumzuordnung, Einheiten, Persistenz-Merge.
- nodes/home-automation-homematic-ip.js: Poll-Lifecycle und Status.
- tools/homematic/bridge.py: Cloud-/Autorisierungsadapter; identische Laufzeitkopie
  nodes/homematic-ip-bridge.py beibehalten.
- flow-src/flows/homematic-ip--hmip_flow/templates/homematic-ip-dashboard.html: Anzeige.
- test/homematic-ip.test.mjs und test/homematic/test_bridge.py: Regressionstests.

`npm test`, `npm run flow:check`, `npm run flow:roundtrip`.
SDK-Vertrag anhand des Quellcodes von 2.19.1 geprüft; Tests verwenden simulierte Antworten.
Dein echter Gerätebestand und deine Cloud-Zugangsdaten sind hier nicht verfügbar.
Die erste Live-Abnahme erfolgt nach deiner lokalen Autorisierung.

## Erweiterte Geräteübersicht · v0.17.0

Die Übersicht zeigt pro Gerät die gemeldeten Ist- und Solltemperaturen,
Luftfeuchte, Ventilöffnung, Fenster-/Türzustände, Schaltzustände und weitere
unterstützte Messwerte (z. B. Leistung, Energie, Helligkeit und Bewegung).
Mehrere gleichartige Messwerte bleiben mit Kanalbezeichnung getrennt sichtbar.
Nicht gemeldete Werte werden nicht als Null interpretiert. Die vollständigen
Rohdatenpunkte bleiben pro Gerät aufklappbar.

Zähler fassen Gerätebestand, aktuell erreichbare Geräte, Offline-/fehlende
Geräte, schwache Batterien und veraltete Zustände zusammen. Suche, Raumfilter
und „Nur Warnungen“ lassen sich kombinieren. Die Raumwahl verwendet die vom
Cloud-Adapter gemeldete Raumzuordnung (gegebenenfalls mehrere Räume zusammen).
Veraltete und fehlende Geräte behalten ihre letzten bekannten Werte mit
sichtbarem Hinweis; Aktualisieren bleibt an das Abfrageintervall gebunden.


## Dynamische Trends und Messarchiv · v0.20.0

Unter der Geräteübersicht erscheint „Trends und Historie“ mit einem dynamischen
Trendmenü. Gerät/Raum und Suche filtern den Katalog tatsächlich aufgezeichneter
Datenpunkte. Anfangs werden Ist- und, falls verfügbar, Solltemperatur desselben
Geräts gewählt. Bis zu sechs numerische Trends gleicher Einheit lassen sich
vergleichen. Boolesche Zustände werden gemeinsam als 0/1, Textzustände einzeln
mit ihren Zustandsnamen dargestellt. Unbekannte numerische Datenpunkte bleiben
auswählbar; Identifikatoren, Metadaten und Geheimnisfelder sind ausgeschlossen.
Prozentwerte von Ventilposition, Dimmer und Rollladen werden für die Darstellung
von 0–1 auf 0–100 skaliert. Rohdaten in den Gerätedetails bleiben erhalten.

„Aktueller Verlauf · Live“ bietet 1, 6, 24 Stunden oder 7 Tage und aktualisiert
sich nach Geräteabfragen, ohne zusätzliche Cloud-Abfragen auszulösen.
„Historischer Verlauf“ verwendet Von-/Bis-Datum und Uhrzeit in Europe/Vienna,
maximal 366 Tage, Ende exklusiv; Vorschläge gestern und letzte 7 Tage.
Mehrdeutige/nicht existente lokale Zeiten bei Zeitumstellung werden abgewiesen.
Historische Ergebnisse, Gerätewahl, Trendwahl und Suchfilter werden durch
Live-Nachrichten nicht ersetzt. Eine bewusst geleerte Auswahl bleibt leer.

Temperaturen haben einen festen wertabhängigen Farbverlauf: 0 °C und darunter
blau, um 20 °C grün, über Gelb/Orange bis zu Rot ab 35 °C. Diese Farben sind eine
visuelle Temperatureinordnung, keine gerätespezifischen Alarmgrenzen. Sollwerte
sind als Stufenlinie gestrichelt. Weitere Linien unterscheiden sich durch
Strichmuster; andere Messgrößen erhalten unterscheidbare Serienfarben.

Mausbewegung oder Antippen setzt den Cursor. Pro Trend zeigt er eine tatsächlich
aufgezeichnete Messung samt eigenem Messzeitpunkt oder „—“ bei einer Lücke.
Die Cursorzeit und die Messzeit werden getrennt ausgewiesen; bei verdichteten
Daten wird kein interpolierter Wert als Messung ausgegeben. Zeitangaben nennen
Wiener Zeit und UTC-Offset, auch an Tagen mit Sommer-/Winterzeitwechsel.

Zoom +/− bis 128×, Früher/Später und der volle Zeitraum-Schieberegler navigieren
im abgefragten Bereich. Der Slider funktioniert sofort und schaltet bei 1×
automatisch auf 2×. Zoom und Verschieben laden den Ausschnitt nach kurzer
Entprellung (200 ms) detailliert aus dem lokalen Archiv nach. Bei fokussiertem
Diagramm: +/−, Pfeiltasten und Home; auf kleinen Displays horizontal scrollbar.
Veraltete Antworten werden anhand von requestId ignoriert.

### Speicherung und Datenqualität

`~/.node-red/homematic-ip/<node-id>-history.sqlite` speichert die Zeitreihen
separat vom letzten JSON-Snapshot. WAL-Modus, transaktionale Poll-Batches und
ein eindeutiger Schlüssel aus Datenpunkt/Zeitpunkt verhindern halbe oder doppelte
Schreibvorgänge. Datei 0600, eigenes Verzeichnis 0700. Die Historie übersteht
Node-RED- und Browser-Neustarts. Im Knoten ist die Aufbewahrung konfigurierbar:
standardmäßig 365 Tage, 1–3650 Tage. Abgelaufene Messwerte werden spätestens bei
der nächsten täglichen Bereinigung entfernt; der Trendkatalog bleibt bestehen.

Aufzeichnung beginnt nach Installation mit den künftigen Geräteabfragen.
Vorherige Messverläufe können aus einem einzelnen Snapshot nicht rückwirkend
hergestellt werden. Zeitstempel sind Abfragezeitpunkte der Cloud, keine
zugesicherten physischen Messzeitpunkte im Gerät. Gleichbleibende Werte können
dem unveränderten Cloudbestand entsprechen. Die Historie behauptet deshalb
keine höhere Echtzeitauflösung als das bestehende Abfrageintervall.

Nur aktuelle Gerätewerte werden als Messungen gespeichert. Offline-/veraltete,
verschwundene oder nicht mehr gemeldete Datenpunkte sowie fehlgeschlagene Polls
erzeugen Lücken statt Wiederholungen alter Werte. Auch zeitliche Lücken zwischen
Abfragen über 2,5 Intervallen werden beim Zeichnen nicht überbrückt. Bei langen
Zeiträumen liefert jede Serie höchstens ungefähr 1600 Originalpunkte: erster,
minimaler, maximaler und letzter Wert sowie Lückenmarker je Zeitbucket. Buckets
mit internen Lücken werden bewusst ohne verbindende Linie dargestellt.
Min/Max/Mittelwert/Anzahl beziehen sich auf alle gültigen Archivwerte im geladenen
Ausschnitt. Sie sind bei unregelmäßigen Abfragen nicht zeitgewichtet.

### Lesende Schnittstellen und Installation

- `homematic-ip/history/catalog` → gleiches Topic mit `/result`:
  `{requestId, series, retentionDays, intervalMs}`.
- `homematic-ip/history/query` → gleiches Topic mit `/result`:
  `seriesIds` (max. 6), entweder `mode: live` mit `hours: 1|6|24|168` oder
  Wiener Von-/Bis-Text `YYYY-MM-DDTHH:mm`; für Zoom numerische Unix-Millisekunden.
  Antwort `{requestId, from, to, series, bucketMs, intervalMs, retentionDays}`.
  Jede Serie enthält Metadaten, Originalpunkte `{at,value,text,quality,breakBefore}`
  und unverdichtete Statistik. Fehler werden als `{requestId,error}` ausgegeben.

Antworten erhalten socketid und requestId; sie gehen nur an den anfragenden
Dashboard-Client. Keine Steuerbefehle, keine zusätzliche Cloud-Anmeldung.
`homematic-ip/state` enthält zusätzlich `historyError`, falls das Messarchiv
nicht geöffnet/beschrieben werden kann. Die aktuelle Geräteanzeige bleibt dabei
verfügbar.

`npm run nodes:install` installiert auch `homematic-ip-history.cjs`; danach die
synchronisierten Flows laden / Node-RED neu starten. Das aktualisierte
`package.json` gehört zur Installation. Für Sicherungen des neuen Archivs einen
SQLite-konsistenten Backup-Weg verwenden; die bisherige History-Datenbank und
Homematic-Archivdatei sind getrennte Datenbanken.

Tests: `test/homematic-ip-history.test.mjs`, `test/homematic-ip-trends-ui.test.mjs`
und bestehende `test/homematic-ip.test.mjs`. Sie verwenden temporäre Datenbanken
und simulierte Geräteabfragen, keine Hardware- oder Cloud-Zugriffe.
