# Phidget IO-Übersicht – v0.14.0

## Datenfluss
Der bestehende Discovery-Flow sendet sein Inventar zusätzlich an den neuen
`home-automation-phidget-io`-Node. Dessen Daten gehen über den bestehenden
Ergebnis-Link zum SYSTEM-Dashboard. Steuerungsflows bleiben unverändert.

Der Lesedienst verbindet sich mit den IPs/Ports der erkannten Network Server.
Kanäle werden anhand Seriennummer, Hub-Port, Kanalindex und Klasse adressiert.
Der Kanaltyp gehört zum Schlüssel: Temperatur und Feuchte können denselben
Index haben. Keine feste Begrenzung auf 6 oder 16 Kanäle.

## Darstellung und Bedeutung
Die Tabelle zeigt Gerät/Server, Seriennummer, Port/Kanal, Typ, TRUE/FALSE,
Wert mit Einheit, Datenqualität und letzten Lesezeitpunkt. Der Filter bleibt
bei Updates erhalten; Zeilen haben stabile Schlüssel.

Digitale Eingänge: TRUE/FALSE und 1/0. Digitale Ausgänge: Phidget-State und
Duty Cycle in Prozent. Bei PWM ist API-State nicht identisch mit „Duty > 0“;
Phidgets beschreibt State als TRUE bei Duty > 0.5. Ausgänge zeigen den vom
Server gemeldeten Zustand, keine elektrische Rückmessung einer Last.
Analoge Kanäle besitzen keinen künstlichen Boolean-Status.

Lesezyklus standardmäßig 2000 ms, mindestens 1000 ms. SDK-Getter liefern den
vom Server aktualisierten Cache. „Zuletzt gelesen“ ist kein Sensor-Zeitstempel
und keine Garantie für das Alter der letzten physikalischen Messung.
Bei Fehler bleibt der letzte bekannte Wert sichtbar, als historisch markiert;
TRUE/FALSE wird dann durch — ersetzt. Ohne Updates werden Werte nach 10 s als
veraltet dargestellt. Fehlende Werte sind niemals automatisch FALSE oder 0.

## Persistenz
Eigene Datei im Node-RED-userDir: `phidget-inventory/<node-id>-io.json`.
Atomare Speicherung alle 30 Sekunden und beim regulären Schließen. Bei hartem
Stromausfall können bis zu 30 Sekunden fehlen. Nach Neustart gelten gespeicherte
Werte als veraltet, bis erneut erfolgreich gelesen wurde. Speicherfehler stehen
im Dashboard. Kein endloses Messwertarchiv, sondern letzter bekannter Zustand.

## Erweiterbarkeit
`nodes/phidget-io-core.cjs`: TYPES enthält Klasse, Getter und Einheit.
Unterstützt: DigitalInput, DigitalOutput, HumiditySensor, TemperatureSensor,
VoltageInput, VoltageRatioInput, CurrentInput und LightSensor.
Hub-Verwaltungskanäle und unbekannte Klassen werden angezeigt, aber nicht geöffnet.
Hypothetische Hub-Port-Betriebsarten werden nicht geöffnet oder umkonfiguriert.
Passwortgeschützte Server sind in dieser Version nicht konfigurierbar;
fehlender Zugriff wird als Lesefehler angezeigt.

Keine Aufrufe von setState, setDutyCycle, setDataInterval, setChannelPersistence
oder Port-Betriebsarten. Die Setter im Lesedienst dienen nur der Adressierung.
Die Lesebibliothek liegt separat in ~/.node-red/phidget-monitor-runtime,
um bestehende Phidget-Steuerungsbibliotheken nicht zu ersetzen.

## Installation / Prüfung
Basis: Preisfarben v0.13.2. Installer prüft betroffene Dateien per Hash und testet
zunächst in einer temporären Projektkopie. Bestehende Kommentare werden erhalten.
Vor Installation setup-sdk.sh ausführen (npm-Download phidget22@3.26.1 und dessen
Abhängigkeiten, getrennt vom Projekt). Danach Node-RED stoppen, installieren,
starten. Erst nach ausdrücklicher Freigabe am Zielsystem installieren.

Unit-Tests verwenden simulierte Hardware; die SDK-Methoden wurden gegen 3.26.1
geprüft. Eine Live-Prüfung in Georgs Hausnetz ist hier nicht möglich.
Nach Installation: Eingänge betätigen, Duty Cycle ändern, Netzwerk trennen,
wieder verbinden und Node-RED neu starten. Alte Werte dürfen nie live erscheinen.

Hersteller: https://www.phidgets.com/docs/Network_Server_Guide
SDK: https://www.npmjs.com/package/phidget22/v/3.26.1

## LED-Anzeige v0.14.1
Jeder dynamisch erkannte Kanal hat eine LED samt Klartext. Grün: TRUE oder
gültiger Analogwert; Grau: FALSE oder noch unbekannt (Text unterscheidet);
Gelb: veraltet; Rot: Lesefehler. Nicht unterstützte Typen sind grau markiert.
PWM folgt dem API-State, der Duty Cycle bleibt daneben sichtbar. Kein Blinken,
feste LED-Abmessungen, stabile Zeilenschlüssel. Farben im CSS bei IO-LED,
Zuordnung in scope.ioLed im Dashboard-Template zentral änderbar.
