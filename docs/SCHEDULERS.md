# Schedulers v0.9.1

## Zweck und erster Anschluss

Eigenständiger Node-RED-Flow **SCHEDULERS**, Dashboard-Seite **Schedulers**.
Zuerst angeschlossen: `kitchen-light`, Raum `kitchen`, Geräteart `light`, Gruppe
`indoor`. Der LightController und seine Szenariodefinitionen werden nicht ersetzt.
Das Beispiel **Küche · Nachtabsenkung** ist zunächst deaktiviert: 21:00 bis 06:00,
30 % nachts, 100 % außerhalb. Zeiten und Werte bearbeiten, aktivieren, speichern.

Gesamthelligkeit multipliziert die gespeicherte Szenariovorgabe. 50 % im Szenario
und 30 % Gesamthelligkeit ergeben 15 % LED-Ausgabe. Ein ausgeschaltetes Licht
bleibt ausgeschaltet. `on` bedeutet beim Kitchen-Adapter **alle LEDs einschalten**;
`off` bedeutet alle LEDs ausschalten; `scenario` wählt einen vorhandenen Namen.
Ein Hardwaretest am Haus wurde hier nicht durchgeführt.

## Datenfluss und Verantwortung

1. Dashboard → Scheduler-Verwaltung: validierte Einstellungen mit Revision.
2. Scheduler-Verwaltung → Cron-plus: dynamische Termine; Zeitzone Europe/Vienna.
3. Cron-plus → Scheduler-Verwaltung: Ereignisse und nächste Termine.
4. Scheduler → **Link Out Gerätebefehle** → **Link In Küche** → Küchen-Adapter.
5. Küchen-Adapter → bestehender LightController.
6. Controller → Status-Adapter → **Link Out Rückmeldung** → **Link In Scheduler**.

Nur die beiden Link-Verbindungen überqueren die Flow-Grenze. Kein globaler
Context ist für die Kommunikation nötig. Die Küche registriert sich beim Start,
alle 60 Sekunden und bei Controller-Ausgaben. Nach 180 Sekunden ohne Registrierung
gilt sie als offline. Eine Registrierung zeigt Controller-Erreichbarkeit, nicht
den elektrischen Zustand einer Lampe.

## Unterstützte Zeitregeln

| Regel | Bedeutung |
|---|---|
| Helligkeitsfenster | Zustand innerhalb/außerhalb; auch über Mitternacht |
| Wochentage/Uhrzeit | Ein Ereignis je ausgewähltem Tag |
| Einmaltermin | ISO-Zeit mit Offset, z. B. `2026-10-05T21:00:00+02:00` |
| Intervall | Alle 1–1440 Minuten auf einem festen UTC-Raster |
| Sonne | Auf-/Untergang, eigene Koordinaten und Minutenversatz |

Gültigkeitsdaten sind lokale Kalendertage, einschließlich Enddatum. Beim
Nachtfenster beziehen sich die Wochentage auf den **Beginn**: Montag 21:00 reicht
bis Dienstag 06:00. Außerhalb gilt stets der zweite Prozentwert, auch an nicht
ausgewählten Tagen. Gleiche Start-/Endzeit wird abgewiesen.
Fenster unterstützen in dieser Version bewusst nur Helligkeit; Steckdosen
erhalten später Ein-/Aus-Ereignisse über einen eigenen Adapter.

Cron-plus wird auf **3.2.0** festgelegt. Wochen- und Sonnenzeiten verarbeitet
Cron-plus; Fensterzustände berechnet der testbare Kern in Europe/Vienna.
Der statische 15-Sekunden-Takt prüft Neustartzustand, Pausen und Bestätigungen.
Start-/Endtermine lösen zusätzlich an der konfigurierten Minute aus.

## Neustart, Konflikte und manuelle Bedienung

- Fenster werden nach Neustart oder erneuter Registrierung auf den **jetzt**
  gültigen Zustand gesetzt. Ausfall während der Nacht führt nicht bis zum
  nächsten Abend zu einem falschen Tagwert.
- Ereignisse werden nicht nachgeholt. Einmaltermine in der Vergangenheit werden
  nicht eingeplant. Ereignisse werden vor Versand als erledigt gespeichert.
  Damit kann ein Absturz zwischen Speichern und Senden ein Ereignis verlieren,
  aber es nicht beim Neustart doppelt auslösen. Es gibt keine Exactly-once-Zusage.
- Bei überlappenden Fenstern gewinnt höhere Priorität, bei Gleichstand die
  alphabetisch kleinere Zeitplan-ID. Die ID bleibt beim Umbenennen unverändert.
- Gemeinsam im 50-ms-Ereignisbündel eingehende Befehle konkurrieren je Ziel und
  Kanal (Helligkeit bzw. Ein/Aus/Szenario) nach derselben Regel. Ereignisse mit
  verschiedenen Ausführungszeiten wirken nacheinander. Das Bündel ist kein
  verteilter Echtzeitmechanismus.
- Ein Ereignis mit niedrigerer Priorität als ein gültiges Helligkeitsfenster
  darf dessen Helligkeit nicht überschreiben. Ein höher priorisiertes Ereignis
  bleibt bis zur nächsten Fensteränderung wirksam. Nach Neustart gilt wieder
  das aktuelle Fenster, weil Ereignisse nicht rekonstruiert werden.
- Normale Statusmeldungen erzwingen keinen Helligkeitswert. Änderungen von Hand
  bleiben bis zur nächsten Fensteränderung erhalten. **60 Minuten manuell**
  unterdrückt für das Ziel zusätzlich alle Scheduler-Befehle; **Automatik
  fortsetzen** wendet sofort das aktuelle Fenster an.
- Automatik pausieren, Plan deaktivieren oder löschen verändert den aktuellen
  Ausgang nicht. Ein anderer verbleibender Fensterplan kann danach übernehmen.
- Bestätigung fehlt länger als 15 Sekunden: Fehlermeldung, keine automatische
  Wiederholung eines möglicherweise bereits ausgeführten Schaltbefehls.

## Persistenz und Bedienung

Datei: `<Node-RED-userDir>/scheduler-data/<Scheduler-Node-ID>.json`.
Enthält Zeitpläne, Zielbeschreibungen, Aktivierung, Pausen, Revision und
Ereignis-Merker. Schreiben erfolgt atomar mit fsync vor dem Versand von Befehlen.
Bei einer beschädigten Datei wird der Scheduler gesperrt; nichts wird durch
eine leere Standardkonfiguration ersetzt. Erst sichern und Ursache prüfen.
Die feste Node-ID `scheduler_engine` beibehalten, damit die gespeicherten Daten
bei Updates wiedergefunden werden. Runtime-/Onlineinformationen sind flüchtig.

Der Editor besitzt einen eigenen Entwurf. Live-Status überschreibt keine Felder.
Bei paralleler Bearbeitung in zwei Browsern verhindert eine Revision das stille
Überschreiben: aktuellen Plan neu laden und Änderungen erneut übernehmen.
Sonnenkoordinaten werden nicht geraten. Ohne richtige Koordinaten lässt sich der
Sonnenplan nicht speichern. Ziele ohne passende Fähigkeit erhalten keinen Befehl.

## Weitere Räume / Steckdosen hinzufügen

Ein neuer Adapter wird über dieselben Link-Out-/Link-In-Nodes verbunden. Die
Scheduler-Verwaltung oder das Dashboard müssen dafür nicht geändert werden.

Registrierung, alle 60 Sekunden und nach Änderungen senden:

```js
msg.topic = 'scheduler/register';
msg.payload = {
  id: 'livingroom-socket', name: 'Wohnzimmer · Steckdose',
  room: 'livingroom', kind: 'socket', groups: ['indoor'],
  actions: ['on', 'off'], scenarios: []
};
return msg;
```

Nur eindeutig registrierte IDs verwenden. Eine registrierte Geräteart erscheint
im Dashboard. Räume und Gruppen werden aus den Registrierungen gebildet.
`all` + `light` erreicht alle angemeldeten Licht-Empfänger, keine Steckdosen.

Befehl am Geräte-Link:

```json
{"topic":"scheduler/command","payload":{"schemaVersion":1,"requestId":"scheduler-42","scheduleId":"night","targetId":"kitchen-light","action":{"type":"brightness","value":30},"issuedAt":"2026-10-05T19:00:00.000Z"}}
```

Adapter prüfen `topic`, `schemaVersion`, `targetId` und die erlaubte Aktion;
fremde Ziele ignorieren. Gerätebefehle niemals blind aus freien Texten ausführen.
Rückmeldung nach Verarbeitung:

```js
msg.topic = 'scheduler/ack';
msg.payload = {requestId: request.requestId, targetId: 'livingroom-socket',
  ok: true, text: 'Gerätecontroller hat den Befehl angenommen'};
return msg;
```

Neue Aktionsarten erhalten später eine explizite Validierung, Adapterabbildung
und Tests; `ACTIONS` in `nodes/scheduler-core.cjs` ist der zentrale Ansatzpunkt.

## Wartung und Tests

| Datei | Zuständigkeit |
|---|---|
| `nodes/scheduler-core.cjs` | Zeitentscheidungen, Auswahl, Prioritäten, Verträge |
| `nodes/scheduler-store.cjs` | Atomare Speicherung |
| `nodes/home-automation-scheduler.js` | Node-RED-Ein-/Ausgänge, Fehlerbehandlung |
| `tools/scheduler-flow.mjs` | Zusätzliche Nodes und Link-Verbindungen |
| `flow-src/flows/schedulers--schedulers_flow/templates/schedulers-dashboard.html` | Eigenes Dashboard, Farben, Texte, Formulare |
| `flow-src/flows/light-controller--light_controller_flow/functions/scheduler-kitchen-command.js` | Küchenbefehle übersetzen |
| `flow-src/flows/light-controller--light_controller_flow/functions/scheduler-kitchen-status.js` | Registrierung und Bestätigung |

`npm test`, `npm run flow:check`, `npm run flow:roundtrip`.
Die Tests enthalten feste Zeitpunkte für Mitternacht, beide Zeitumstellungen,
Neustart, Persistenzfehler, manuelle Pausen, Zielgruppen, Bestätigung und
konkurrierende Ereignisse. Die Küchenanbindung wird mit dem echten Controller
und der vorhandenen Function ausgeführt, ohne Hardware zu schalten.

## Statusampel ab Version 0.10.0

| Farbe | Bedeutung |
|---|---|
| Rot – Fehler | Zeitgeberfehler, beschädigter Speicher, Speicherfehler oder negativer/ausbleibender Befehlsabschluss |
| Gelb – Warnung | Keine aktuelle Zeitgebermeldung, fehlende/offline/pausierte Empfänger oder ungültige Eingabe |
| Grün – Läuft | Gültiger aktiver Plan, frischer Zeitgeber, erreichbare Empfänger ohne gemeldeten Fehler |
| Grau – Idle | Automatik deaktiviert oder kein aktuell gültiger aktiver Plan |

Grün bedeutet Bereitschaft der Zeitsteuerung, nicht „Licht eingeschaltet“ und keine
Bestätigung einer elektrischen Messung. Fehler des Zeitgebers haben auch bei
pausierter Automatik Vorrang. Bei mehreren Empfängern reicht ein betroffener
Empfänger für eine Warnung bzw. einen Fehler. Der Kurztext und der Tooltip nennen
die Gründe. Der reservierte Ampelbereich bleibt bei Statuswechseln gleich hoch.

Ein Zeitgeberfehler verschwindet erst nach frischem Watchdog und vollständiger
Cron-Liste. Ein Befehlsfehler verschwindet nach erfolgreichem neuem Befehl; es gibt
keine automatische Wiederholung. Speicherfehler verhindern den Befehlsversand.
Ein späterer erfolgreicher Speicherversuch hebt diesen Fehler auf. Beschädigte
Dateien werden nicht überschrieben. Eingabewarnungen enden beim nächsten gültigen
Status. Nach 60 Sekunden ohne Status zeigt das Dashboard Gelb statt altem Grün.

Aktivierung, Pläne, Zielbeschreibungen, Pausen und Ausführungsmarker bleiben in
`<Node-RED-userDir>/scheduler-data/<Node-ID>.json` erhalten. Ampel, Erreichbarkeit
und Tick-Zeit sind Live-Daten: Nach Neustart müssen sich Zeitgeber und Geräte neu
melden. Die Node-ID `scheduler_engine` bleibt unverändert.

Farben ändern: CSS-Kommentar „Ampelfarben hier anpassen“ im Dashboard-Template.
Bedeutung ändern: Methode `health()` in `nodes/scheduler-core.cjs`.
Zeitgrenzen: 45 s Zeitgeber, 180 s Registrierung, 15 s Befehlsantwort;
Dashboard-Verbindungsprüfung im Template: 60 s.

## Vorbereitete Raum-Links

Im Flow SCHEDULERS gibt es je ein freies Link-Out/Link-In für Kinderzimmer,
Bad und Wohnzimmer. Nur du stellst die externen Links zu deinen Geräteadaptern her.
Die Küche bleibt an ihrem bestehenden Link-Bus. Es werden keine zusätzlichen
Geräte registriert und keine Lampen/Steckdosen automatisch verbunden.

| Raum | Registrierung `payload.room` / Befehl `payload.roomId` |
|---|---|
| Kinderzimmer | `kinderzimmer` |
| Bad | `bad` |
| Wohnzimmer | `wohnzimmer` |

Verbinde das jeweilige Link-Out mit deinem Befehlsadapter und die Rückmeldung
deines Adapters mit dem zugehörigen Link-In. Registrierung alle 60 s, eindeutige
Geräte-ID, Geräteart und unterstützte Aktionen gemäß Vertrag weiter oben.
Jeder Adapter muss zusätzlich `targetId` prüfen: mehrere Beleuchtungen im selben
Raum erhalten Raum-Nachrichten über denselben Ausgang. Antworten enthalten die
originale `requestId` und `targetId`. Registrierungen/Bestätigungen gehen über den
Rückkanal zur Engine. Erweiterungen können Lichter, Steckdosen oder weitere
Gerätearten sein; das Room-Routing schränkt die Art nicht ein.

## Installation des Updates

Basis: Georgs hochgeladener Projektstand vom 10.10.2026, Version 0.9.1.
Der Laufzeit-Flow wurde mit den wartbaren Quellen synchronisiert. Eigene
Kommentare und vorhandene Geräteverbindungen bleiben erhalten. Version 0.10.1.
Das Paket enthält README.txt, Installation mit Prüfmodus und Regressionstests.
Der Installer prüft den eingesandten Stand, sichert betroffene Dateien und
aktualisiert auch das lokale Scheduler-Laufzeitmodul. Kein automatischer Neustart,
keine Änderung der persistenten Scheduler-Daten, kein Git-Reset oder Stash.
Installation erst nach Georgs Freigabe. Für Details und Rücknahme siehe README.txt.

Patch 0.10.1 übernimmt Georgs nachgereichte flows.json einschließlich Node-Positionen
und Cron-plus-Editorfeldern. Der Watchdog bleibt bei 15 Sekunden.
