# Hausnetz und Starlink · 0.21.1

Auf dem Home-PC läuft Internet über WLAN `STARLINK` (192.168.1.x). Die Raspberry
Pis sind über Ethernet im TP-Link-Hausnetz 192.168.0.x erreichbar. Der Scan darf
daher nicht die Internet-Standardroute verwenden. Der Exec-Knoten fragt die
Route zu 192.168.0.1 ab; die nachfolgende Function akzeptiert ausschließlich das
Hausnetz. Fehlt die LAN-Route, wird nicht ersatzweise Starlink gescannt.
Bei einer Änderung des Hausnetzes müssen das Exec-Ziel, `SYSTEM_SCAN_SUBNET`
(Standard 192.168.0) und die festen Raspberry-Inventaradressen angepasst werden.

Ein /24-Scan prüft 253 Adressen mit acht Starts pro Sekunde, also ungefähr
32 Sekunden plus Ping und Namensauflösung. Die fünf bekannten Raspberry-Adressen
werden zuerst geprüft. Beim Folgescan bleiben vorherige Geräte sichtbar, bis
sie erneut geprüft wurden; der Zeitstempel zeigt die tatsächliche letzte Antwort.
Ein Ping bestätigt nur die Erreichbarkeit. CPU-Temperatur, RAM, SSD und Laufzeit
benötigen eine erfolgreiche SSH-Abfrage.

Der aktive Benutzerordner lautet `.node-red-instances/1880`. Dort müssen
`system-credentials.vault.json` und der zugehörige `.key` mitgeschützt übertragen
werden, damit der automatische SSH-Betrieb des bisherigen Rechners fortgesetzt
werden kann. Beide Dateien gehören nicht in Git. Zusätzlich benötigt die aktuelle
SSH-Implementierung `/usr/bin/expect`. Ein passender Branch allein überträgt
weder Tresor noch Systempakete.

Das Dashboard zeigt SSH-Erfassungsfehler ausdrücklich. Historische Temperaturen
aus dem Inventar vom 26.07.2026 sind als Inventarwerte gekennzeichnet. Laufzeit
und daraus berechneter Systemstart erscheinen nur bei echten SSH-Livewerten;
dieser Zeitpunkt ist der Systemstart und keine gemessene lückenlose Netzverfügbarkeit.

Diagnose am 14.11.2026: Laufzeit-Flow und Projekt identisch; Branch
`home-automation-solar-workspace`, HEAD/Remote `015cd9d7`. Alle fünf bekannten
Pis antworten auf Ping und Port 22. Der vorherige Scan folgte der Starlink-Route.
Tresor und expect fehlen auf dem Home-PC. Die Erweiterung HOSTRECHNER bleibt erhalten.

Nachtrag 0.21.2: Der vorhandene Tresor und sein Betriebsschlüssel wurden vom
Notebook über SSH bytegleich übernommen und mit Dateirechten 0600 abgelegt.
Benutzerlokales expect ist installiert und im Messbetrieb nutzbar. Vier Systeme
liefern bestätigte SSH-Livewerte. `pientry` verweigert den gespeicherten Zugang
auch vom Notebook aus; dies ist ein bestehendes Anmeldeproblem des Eintrags.
Tresor, Schlüssel und SSH-Übertragungsschlüssel bleiben außerhalb des Repositorys.
