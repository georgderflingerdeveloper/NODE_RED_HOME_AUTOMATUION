# Hostrechner · Version 0.21.0

Flow und Dashboard besitzen einen eigenen Tab `HOSTRECHNER`. Der Flow liest
alle fünf Sekunden ausschließlich lokale Linux-Systemdaten mit Python 3;
zusätzliche Pakete, Cloud-Dienste und Administratorrechte sind nicht erforderlich.
`tools/host-monitor/collect.py` muss beim Installieren mit übernommen werden.
Der Exec-Knoten enthält den absoluten Projektpfad und hat ein Zeitlimit von vier Sekunden.

CPU-Gesamtlast und Last je logischem Thread werden aus zwei `/proc/stat`-
Messungen im Abstand von ca. 0,8 Sekunden berechnet. Kerne, Threads, CPU-Modell,
Lastmittelwerte, Betriebssystem, Kernel und Laufzeit ergänzen die Übersicht.
RAM-Belegung ist Gesamt minus `MemAvailable`; vollständig freier RAM und
Dateicache sind gesondert ausgewiesen. Alle Größen verwenden binäre Einheiten.

Lokale, eingehängte Gerätedateisysteme werden über `findmnt` und `statvfs`
erfasst. Freier Speicher bedeutet für den Benutzer verfügbarer Platz, ohne
reservierte Systemblöcke. Die Systempartition und EFI werden getrennt angezeigt.
Temperatur erscheint nur, wenn Linux einen gültigen Thermal-Sensor bereitstellt.
Netzwerkzähler zeigen die übertragenen Bytes seit Start der Schnittstelle.

CPU und RAM erhalten einen Verlauf der letzten fünf Minuten im jeweiligen
Browser. Dieser beginnt beim Öffnen des Tabs und wird nicht auf Platte gespeichert.
Nach 20 Sekunden ohne Messwert zeigt das Dashboard eine Warnung statt Live-Status.
Erfassungsfehler erscheinen zusätzlich im Debug-Knoten des Flows.

Das Dashboard übernimmt die vorhandenen Designvariablen und passt sein Raster
an die verfügbare Breite an. Keine bestehenden Steuerungen werden angeschlossen.

## Aktive Kerne und Lastverursacher · 0.22.0

Die CPU-Kacheln zeigen den physischen Kern und dessen logische Threads. Blau
kennzeichnet gemessene Aktivität; Gelb den stärksten Thread im Messintervall.
Die Momentaufnahme dauert jetzt etwa 0,8 Sekunden und bleibt im Fünfsekundentakt.

Die Prozessranglisten zeigen CPU-Verbrauch und residenten RAM für jeweils bis zu
acht Prozesse. CPU-Zeit wird aus zwei `/proc/PID/stat`-Messungen berechnet,
inklusive sämtlicher Threads des Prozesses. CPU gesamt ist auf alle logischen
CPUs normalisiert; 100 % eines Threads entsprechen bei zwölf Threads 8,33 %
des Rechners. Die Kennung des Prozessstarts verhindert falsche Differenzen bei
wiederverwendeten PIDs. Zwischen den Messungen gestartete oder beendete Prozesse
werden nicht als vollständig gemessene Prozesse ausgewiesen.

„CPU zuletzt“ zeigt den letzten CPU-Thread des Hauptthreads. Dies ist keine
feste Prozesszuordnung: Linux kann Threads verschieben und parallel ausführen.
Kernelarbeit und Interrupts lassen sich nicht vollständig einem Prozess zuordnen.
RAM verwendet RSS; gemeinsam verwendete Speicherseiten können mehrfach zählen.
Der Collector selbst erscheint nicht in der Rangliste, verursacht aber ebenfalls
etwas messbare Systemlast. Ausgelesen werden ausschließlich Prozessname und
Zähler, keine Kommandozeilen, Zugangsdaten oder Prozessumgebungen.

Die Tests prüfen die CPU-Normalisierung, PID-Wiederverwendung, Prozessnamen mit
Klammern und einen realen, an einen CPU-Thread gebundenen Lastprozess. Die Last
wird nur während dieser kurzen Integrationsprüfung erzeugt und danach beendet.
