# Hostrechner · Version 0.21.0

Flow und Dashboard besitzen einen eigenen Tab `HOSTRECHNER`. Der Flow liest
alle fünf Sekunden ausschließlich lokale Linux-Systemdaten mit Python 3;
zusätzliche Pakete, Cloud-Dienste und Administratorrechte sind nicht erforderlich.
`tools/host-monitor/collect.py` muss beim Installieren mit übernommen werden.
Der Exec-Knoten enthält den absoluten Projektpfad und hat ein Zeitlimit von vier Sekunden.

CPU-Gesamtlast und Last je logischem Thread werden aus zwei `/proc/stat`-
Messungen im Abstand von 0,4 Sekunden berechnet. Kerne, Threads, CPU-Modell,
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
