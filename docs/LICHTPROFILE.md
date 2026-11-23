# Lichtprofile in Küche und Kinderzimmer

Im Raum-Dashboard **Lichtprofil und Rampe** öffnen, eine Szene wählen und optional
**Rampenbetrieb** zuschalten. Ein- und Ausblendzeit werden in Sekunden eingegeben
(0–3600, auch Dezimalwerte). Null schaltet sofort. **Profil speichern** schreibt
die Einstellung für diesen Raum und diese Szene in die Scheduler-Setup-Datei.
**Ein testen** und **Aus testen** führen das gewählte Profil aus. In der Küche
zeigt der Controller die Ausgabe als Vorschau. Die Hardwareverbindung ist offen.

Unter **Szene bearbeiten oder anlegen** lassen sich Name und Kanalhelligkeiten
ändern. Die Küche nutzt ihren vorhandenen Szenenspeicher und übernimmt gespeicherte
Szenen wie bisher direkt. Kinderzimmer-Szenen stehen in der Scheduler-Setup-Datei
und werden an den Szenenkatalog von PICENTER2 übertragen. Beim Speichern einer
Kinderzimmer-Szene bleibt der aktuelle Ausgangszustand erhalten.

Im Scheduler können **Ein** und **Aus** unter **Lichtprofil (optional)** auf eine
benannte Szene verweisen. Ohne Auswahl gilt das aktuelle Profil. Die Option
**Für diesen Befehl sofort schalten** überspringt die zeitliche Rampe.

Beispiel für den Eingang des Profilmoduls (Szenenname des jeweiligen Raums):
```json
{"topic":"profile/test","payload":{"type":"on","profile":"Abend"}}
```
Für Aus `type` auf `off` setzen. `"ramp":false` schaltet sofort. Dauer und
Freigabe ändern sich dadurch nicht. Der Scheduler verwendet dieselben
Aktionsfelder. Seine Bestätigung bezieht sich auf die Annahme des Befehls.

Der Node **home-automation-light-profile** verwaltet eine Rauminstanz. Ausgang 1
geht zum Controller, dessen Status zurück zum Profilnode. Ausgang 2 bedient
das Raum-Dashboard, Ausgang 3 den Profileditor, Ausgang 4 die Konfigurationsverwaltung.
Ausgang 5 der Kücheninstanz liefert `payload.LedOutput` mit PWM-Tastverhältnissen
zwischen 0 und 1. Er ist für die spätere Hardwareanbindung frei.
Die gemeinsame Kennlinie interpoliert CIE-L* über die eingestellte Zeit. Der
Kinderzimmeradapter führt die Schritte auf PICENTER2 je Ausgang aus. Ein neuer
Schaltbefehl übernimmt beim zuletzt ausgegebenen PWM-Wert.

Im Georgszimmer erzeugen **Kerzenlicht** und **Kaminfeuer** die Helligkeitsbewegung
lokal auf PICENTER2. Kerzenlicht schwankt leicht, beim Kaminfeuer überlagern sich
eine gemeinsame Glutbewegung und unterschiedliche Flammen je Kanal.
Die fünf LED-Regler bestimmen die jeweilige maximale Helligkeit. Ein Kanal mit
0 % bleibt dunkel. Die Farbtemperatur stammt von den eingesetzten LEDs.
Im Scheduler startet **Ein → Lichtprofil** die gewählte Szene auch bei
ausgeschaltetem Raumlicht. **Aus** beendet den Effekt mit der eingestellten Rampe.

## Morgen und Abend im Georgszimmer

* **Sanfter Morgen** blendet vom aktuellen Lichtwert bis zur vollen
  Profilhelligkeit auf. Alle fünf Kanäle stehen ab Werk auf 100 %.
* **Morgenwecker** pulsiert weich im einstellbaren Rhythmus (2–60 Sekunden je Puls, Vorgabe 4 Sekunden) und geht am
  Ende der eingestellten Dauer in volles Dauerlicht über.
* **Gute Nacht** blendet vom aktuellen Lichtwert bis auf null ab. Ein neuer
  Profilstart übernimmt auch während des Ausblendens den letzten PWM-Wert.

Im Profilfenster die Dauer in Sekunden einstellen (0 bis 3600, auch Dezimalwerte), **Profil
speichern** und bei Bedarf **Starten** drücken. **Sofort aus** beendet die
Routine direkt. Die Voreinstellungen sind 20 Minuten für Morgen- und
Abenddämmerung und eine Minute für den pulsierenden Wecker.

Für einen freiwilligen Weckplan im Scheduler *Georgszimmer → neuer Zeitplan →
Ein → Lichtprofil → Sanfter Morgen* wählen, z. B. 05:00 Uhr an den gewünschten
Wochentagen. Bei 20 Minuten beginnt das Aufblenden um 05:00 Uhr und endet um
05:20 Uhr. Für einen Abendplan **Gute Nacht** wählen. Die Aktivierung erfolgt
beim Speichern des jeweiligen Zeitplans.

Die fünf Schalter unter **Lichter** zeigen die zuletzt auf PICENTER2 ausgegebene
PWM-Helligkeit an. Decke, Rechts und Mansarde 1–3 leuchten entsprechend dem
jeweiligen Kanalwert. Der Prozentwert entspricht der CIE-L*-Skala. Bei fehlenden
Daten erscheint ein Strich. Die Anzeige funktioniert auch ohne angeschlossene LEDs.
Beim Start eines Tests schließt sich das Profilfenster und die Lampen werden sichtbar.
In der Küche zeigt **Lichtprofil und Rampenbetrieb** den berechneten Verlauf
direkt neben den Testtasten an. Die Küchenhardware ist für später vorgesehen.

Die mittlere Gruppe **Lichter** nennt das aktive Raumprofil und zählt die gerade
angesteuerten Lampen. Jede Lampenzeile zeigt Ein/Aus, die wahrgenommene
Helligkeit und darunter die elektrische Ansteuerung als PWM-Tastverhältnis.
Während „Gute Nacht“ bleibt der Profilname beim Ausblenden sichtbar.
