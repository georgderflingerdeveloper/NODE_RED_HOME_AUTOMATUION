# Phidget-Erkennung 0.13.1
Eigener Flow SYSTEM · Phidget Discovery; Links zum vorhandenen SYSTEM-Dashboard
und zum Ergebnis des internen IP-Scanners. Der IP-Scan triggert die Phidget-Suche,
deren tatsächliche Inventarisierung über Phidget-Server-Discovery erfolgt.
Es werden nicht alle IP-Adressen auf offene Ports geprüft.

## Ablauf und Voraussetzungen
Beim Start nach 1,5 Sekunden, danach alle 60 Sekunden; im Node konfigurierbar,
mindestens 30 Sekunden. Zusätzlich Dashboard „Jetzt scannen“ und abgeschlossener
Netzscan (höchstens einmal pro Minute). Überlappende Scans werden verworfen.
Zwei feste Befehle ohne Shell, ohne vom Dashboard vorgegebene Argumente:
- phidget22admin -s -w 5
- phidget22admin -R -d -w 5
Je Befehl maximal 20 Sekunden und 4 MiB Ausgabe. Nur Inventar, keine Kanalöffnung,
keine Messwertabfrage, kein Schalten, keine Firmwareänderung.

Auf dem Node-RED-Rechner muss phidget22admin samt Bibliothek verfügbar sein.
Bei eingerichtetem offiziellem Phidgets-Paketrepository:
sudo apt install phidget22admin libphidget22 libavahi-client3 avahi-daemon
Der Installer führt keine Paketinstallation und kein sudo aus.
Die Befehle müssen unter dem Benutzer und PATH des Node-RED-Dienstes funktionieren.
Ein eigener lokaler phidget22networkserver ist nur nötig, um lokale Hardware
freizugeben. Dessen Programmfund im PATH und systemd-Status sind Diagnosehinweise;
sie bestimmen nicht den Status der entfernten Server. Andere Dienstnamen/
Container können „Status nicht verfügbar“ ergeben.

Discovery findet veröffentlichte Server im erreichbaren Discovery-Netz.
Multicast/mDNS über Router/VLANs, passwortgeschützte Server oder deaktivierte
Veröffentlichung können die Erkennung begrenzen. Direkte IP-Fallbacks und
Passwortverwaltung sind in dieser Version nicht implementiert.

## Anzeige / Persistenz
Serverliste (IP und Endpunkt), physische Hubs und Module, Seriennummern, Ports,
Firmware und Kanallisten. Dictionaries werden nicht als Hardware gezählt.
Hub-Port-Betriebsarten stehen als Fähigkeiten beim Hub, nicht als zusätzliche
Module. Feuchte- und Temperaturkanäle dürfen denselben Kanalindex haben.
Gleiche Hardware wird anhand Seriennummer, Port und Gerätename zusammengeführt;
mehrere meldende Server werden aufgeführt. Der Endpunkt stammt unverändert
aus dem CLI, auch wenn dessen Anzeige einen Namen kürzt.

Bekanntes Inventar wird atomar nach
<userDir>/phidget-inventory/<node-id>.json geschrieben.
Nach Neustart: Status unbekannt bis zum ersten erfolgreichen Scan.
Erfolgreicher Scan ohne zuvor vorhandenes Gerät: nicht mehr erkannt.
Fehlgeschlagener Scan: unbekannt/veraltet, nicht fälschlich offline.
„Erkannt“ bestätigt Inventarisierung, nicht die Funktion einer Steuerung.
Der Hub-Zähler enthält auch gespeicherte, aktuell nicht erkannte Hubs.
Keine automatischen Löschungen; alte Geräte bleiben zur Nachverfolgung erhalten.
Schreibfehler erscheinen als Warnung; letzte Meldung bleibt sichtbar.

## Wartung
nodes/phidget-discovery-core.cjs: Parser und Inventarzusammenführung.
nodes/home-automation-phidget-discovery.js: Prozesse, Timer und Speicherung.
nodes/home-automation-phidget-discovery.html: Node-Editor.
flow-src/flows/system--system_dashboard_flow/templates/phidgets-hardware-und-verbindungen.html:
Dashboardgestaltung.
test/phidget-discovery.test.mjs: Parser, doppelte Meldungen, Ausfall/Wiederkehr,
Neustart, Prozessargumente, fehlendes Werkzeug und Flowverbindungen.
Die bisherigen Test-/Worker-Eingänge sind erhalten; das Dashboard nimmt
ausschließlich das neue discovery-Inventar an, damit simulierte Meldungen
keine echte Erkennung vortäuschen.

## Prüfung
Automatisierte Tests verwenden Beispielausgaben nach Georgs Scan und simulierte
Prozesse. Ein echter Test im Hausnetz ist hier nicht möglich.
Nach Installation: Node-RED starten, SYSTEM öffnen, „Jetzt scannen“.
Erwartet nach Georgs Scan: HUB597039 an 192.168.0.200 mit Modulen Port0/2/5
und InterfaceKit311883 an pientry. Maßgeblich ist der aktuelle Scan.

## Vollständigkeit der Speicherung
Zusätzlich werden firstSeen und die vollständigen Originalausgaben des letzten
erfolgreichen Server-/Gerätescans gespeichert und im Dashboard aufklappbar gezeigt.
Es handelt sich um ein dauerhaftes Inventar und den letzten erfolgreichen Scan,
nicht um ein unbegrenzt wachsendes Archiv jeder einzelnen Abfrage.
Bei VINT-Modulen bezeichnet die Zahl vor dem Port die Hub-Seriennummer;
eine separate Modulseriennummer wird von dieser CLI-Ausgabe nicht geliefert.
Es werden keine Seriennummern erfunden. Gerätezustände sind nach Neustart
bis zum nächsten erfolgreichen Scan ausdrücklich unbekannt.
