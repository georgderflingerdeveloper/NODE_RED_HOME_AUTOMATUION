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
Bestand, atomar geschrieben; kein historisches Messarchiv. Verschwundene Geräte bleiben
als missing erhalten. Nach Neustart niemals sofort als aktuell markieren.
UI-Suchtext/offene Zeilen bleiben bei Datenupdates erhalten (nicht browserübergreifend).
Anzeigezeit im Browser in dessen lokaler Zeitzone; Zeitstempel als Unix-Millisekunden.

## Link-Schnittstellen
Eingang `Homematic IP · get / refresh`:
- msg.topic = homematic-ip/get: letzten Bestand sofort ausgeben, ohne Cloudzugriff.
- msg.topic = homematic-ip/refresh: Abfrage, sofern Mindestintervall abgelaufen.
Andere Topics werden ignoriert und als Warnung protokolliert. Keine Befehlsweiterleitung.
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
