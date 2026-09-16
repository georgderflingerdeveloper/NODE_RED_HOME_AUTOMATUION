# LightController

`LightController` ist die generische, hardwareunabhängige Lichtlogik. Namen wie
`LightControllerKitchen` bezeichnen ausschließlich eine konkrete Instanz.

## Dateien

- `lib/functions/generated/LightController.js`: einzige Implementierung;
- `lib/functions/generated/LightControllerKitchen.js`: kompatibler Weiterleiter;
- `lib/functions/generated/LightControllerScenarioStore.js`: atomarer Dateispeicher;
- `examples/light-controller-function.js`: wartbarer Node-RED-Wrapper;
- `examples/LightController.node-red.json`: wartbarer Function-Node-Wrapper;
- `test/LightController.test.mjs`: direkte Unit-Tests der echten Moduldatei;
- `test/LightControllerFlow.test.mjs`: Wrapper- und Test-Inject-Tests;
- `test/LightControllerScenarioStore.test.mjs`: Persistenztests.
- `flow-src/flows/light-controller--light_controller_flow/templates/kitchen-light-controller-dashboard.html`:
  wartbare Oberfläche für Test, Status und Szenarioverwaltung.
- `test/LightControllerDashboard.test.mjs`: Struktur- und Verdrahtungstests der Oberfläche.

## Kitchen-Dashboard

Die bestehende Dashboard-Seite **KÜCHE** enthält das Feld
**Kitchen · Lichtsteuerung und Szenarien**. Es ist bidirektional mit derselben
`LightControllerKitchen`-Instanz verbunden, die auch reale Eingangsnachrichten
verarbeitet.

Enthalten sind:

- Licht-Testtaster mit getrenntem Drücken und Loslassen;
- laufende und zuletzt gemessene Betätigungsdauer in Millisekunden;
- Uhrzeit von Drücken und Loslassen;
- verständliche Textanzeige für Kurz-, Doppel-, Lang- und Ultralangdruck;
- dynamisch 1 bis 16 LED-Anzeigen mit dem tatsächlichen Prozentwert aus `LedOutput`;
- `+`-Button zum persistenten Hinzufügen weiterer LEDs;
- Auswahl vorhandener Szenarien;
- automatisch passende Prozentfelder für `ScenarioProperties`;
- Aktionen zum Speichern, Anlegen, Auswählen, Auflisten und Löschen.

Das Dashboard sendet keine eigene Lichtlogik. Es erzeugt ausschließlich die
dokumentierten Controller-Nachrichten. Deshalb bleiben Bedienung, Hardware und
Automatisierungs-Flows konsistent.

Live-Statusmeldungen aktualisieren die Zustandsfelder inkrementell. Die
Szenarioliste wird nur ersetzt, wenn sich ihr Inhalt geändert hat, und die
LED-Eingabefelder nur bei einer tatsächlichen Änderung der Ausgangszahl. Eine
laufende Visualisierung schließt dadurch keine Auswahl und verwirft keine noch
nicht gespeicherten Benutzereingaben.

Beim Laden einer älteren persistenten Konfiguration werden nachträglich ergänzte
LEDs automatisch vor den Gruppenszenarien einsortiert. Die Schaltfolge erreicht
dadurch jeden Ausgang bis zur konfigurierten Obergrenze von 16.

Taster, Ereignistext, Statusraster und Commander-Ausgabe reservieren feste
Anzeigeflächen. Live-Tasterwerte ändern dadurch weder Kartenhöhe noch
Scrollposition des Dashboards.

Die LED-Anzahl kann mit `+` und `−` persistent zwischen 1 und 16 geändert
werden. `ClearAllScenarios` entfernt nur Benutzerszenarien und stellt die
dynamische interne Einzel- und Gruppenfolge wieder her. Interne Schaltszenarien
können weder gelöscht noch versehentlich überschrieben werden.

## Konfiguration

```js
{
  instanceName: "Kitchen",
  inputCount: 3,
  outputCount: 6,
  holdTimeMs: 2000,
  doubleClickTimeMs: 500,
  ultraHoldTimeMs: 4000,
  inputBindings: [
    {
      id: "main",
      shortAction: "next",
      doubleAction: "next-scenario",
      longAction: "toggle-mode",
      ultraLongAction: "all-off-command"
    },
    { id: "off", shortAction: "off", longAction: "none" },
    {
      id: "work",
      shortAction: { type: "select", scenarioId: "work" },
      longAction: "none"
    }
  ],
  scenarios: [
    { id: "work", name: "Arbeitslicht", outputs: [1, 1, 1, 0, 0, 0] },
    { id: "evening", name: "Abendlicht", outputs: [0.4, 0.2, 0, 0, 0, 0] },
    { id: "all", name: "Alles", activeLights: [0, 1, 2, 3, 4, 5] }
  ]
}
```

`outputs` enthält je Licht einen Faktor von `0` bis `1`. Der aktuelle
`DutyCycle` skaliert diese Werte zusätzlich. Alternativ beschreibt
`activeLights` die eingeschalteten Ausgangsindizes.

## Laufzeitnachrichten

Kompatibler Einzeltaster:

```js
msg.payload = { ButtonPressed: true, DutyCycle: 70 };
```

Mehrere Eingänge:

```js
msg.payload = { Inputs: [true, false, false], DutyCycle: 70 };
```

Direkte Befehle:

```js
msg.payload = { Command: "AllLightsOn", DutyCycle: 70 }; // alle Ausgänge ein
msg.payload = { Command: "AllLightsOff" };               // alle Ausgänge aus
```

LED-Anzahl dynamisch ändern (maximal 16):

```js
msg.payload = { Command: "AddOutput" };                 // eine LED hinzufügen
msg.payload = { Command: "SetOutputCount", OutputCount: 12 };
```

Die Standardschaltfolge wird beim Erweitern vollständig aus der aktuellen
Ausgangszahl aufgebaut: zuerst jedes Licht einzeln, danach die Gruppen von zwei
bis zu allen konfigurierten LEDs. Dadurch werden neue LEDs sowohl einzeln als
auch in den Gruppenszenarien berücksichtigt. Eigene Szenarien bleiben dabei
unverändert erhalten und werden nur mit ausgeschalteten neuen Ausgängen ergänzt.
Die vollständige Konfiguration wird über denselben atomaren Szenariospeicher
persistiert.

`AllLightsOn` verwendet den aktuellen `DutyCycle`. Beide Befehle sind von der
konfigurierten Szenarioliste unabhängig.

## Benannte Szenarien

Ausgangsnummern in `ScenarioProperties` sind einsbasiert und Prozentwerte liegen
zwischen `0` und `100`:

```js
msg.payload = {
  Command: "SaveScenario",
  ScenarioName: "Dinner",
  ScenarioProperties: { 1: 50, 2: 100, 6: 70 }
};
```

| Command | Wirkung |
|---|---|
| `SaveScenario` | Szenario nach Namen anlegen oder aktualisieren und aktivieren |
| `AddScenario` | neues Szenario anlegen; ein vorhandener Name wird abgewiesen |
| `SelectScenario` | vorhandenes Szenario nach Namen aktivieren, ohne es zu verändern |
| `ListScenarios` | alle Namen und `ScenarioProperties` in `ScenarioList` ausgeben |
| `DeleteScenario` | genau das mit `ScenarioName` bezeichnete Szenario löschen |
| `ClearAllScenarios` | alle Szenarien löschen und sämtliche LEDs ausschalten |

Namen sind ohne Beachtung der Groß-/Kleinschreibung eindeutig. `SaveScenario`
kann ohne `ScenarioProperties` das aktuell aktive Szenario unter einem neuen
Namen kopieren. `AddScenario` verlangt die Eigenschaften immer ausdrücklich.

Jede Antwort enthält beispielsweise:

```js
msg.payload.LedStatus = ["1=On[50%]", "2=On[100%]", "3=Off"];
msg.payload.LedStatusText = "1=On[50%], 2=On[100%], 3=Off";
msg.payload.ButtonTiming = {
  InputNumber: 1,
  Pressed: false,
  PressedAt: "2026-09-13T10:15:30.000Z",
  ReleasedAt: "2026-09-13T10:15:31.250Z",
  DurationMs: 1250,
  CurrentDurationMs: 1250
};
```

Der mitgelieferte Debug-Node zeigt `LedStatusText`. Die Inject-Nodes
`TEST · Taster EIN (drücken)` und `TEST · Taster AUS (loslassen)` simulieren den
Taster. Für einen Langdruck zuerst EIN klicken, zwei bis unter vier Sekunden
warten und danach AUS klicken. Ab vier Sekunden löst der Wrapper den
Ultralangdruck selbstständig aus; ein gesondertes Loslassen ist für die Aktion
nicht erforderlich.

## Taster-Zustandsautomat

| `OperatingMode` | Kurzer Klick | Doppelklick innerhalb 500 ms | Langdruck 2 bis <4 s | Ultralangdruck ab 4 s |
|---|---|---|---|---|
| `normal` | nächstes Licht/Szenario | nächstes Szenario auswählen | aktuelles Licht oder komplette Gruppe persistent festhalten | alle Lichter aus, Commander-Befehl senden |
| `scenario` | gewähltes Szenario persistent Ein/Aus | nächstes Szenario auswählen | Szenariomodus verlassen, Normalbetrieb fortsetzen | alle Lichter aus, Modus verlassen, Commander-Befehl senden |
| `manual-light` | gewähltes Einzellicht persistent Ein/Aus | nächstes Szenario auswählen | Einzellichtmodus verlassen, Normalbetrieb fortsetzen | alle Lichter aus, Modus verlassen, Commander-Befehl senden |

Im Normalbetrieb durchlaufen kurze Klicks zuerst alle konfigurierten Einzellichter
und danach die kumulativen Gruppen. Die Folge bleibt dabei immer im Modus
`normal`. Ein Langdruck über zwei und unter vier Sekunden hält das gerade aktive
Einzellicht oder die komplette Gruppe im Modus `scenario` fest. Kurze Klicks
schalten anschließend genau dieses Szenario gemeinsam aus und ein. Der nächste
Langdruck verlässt den Szenariomodus; ein weiterer kurzer Klick setzt die normale
Folge beim nächsten Eintrag fort.

`manual-light` bleibt ausschließlich zur Wiederherstellung älterer persistierter
Zustände kompatibel. Neue Langdruckaktionen verwenden einheitlich den Modus
`scenario`, auch für ein einzelnes Licht.

Der erste kurze Klick wird während `doubleClickTimeMs` nur vorgemerkt. Trifft
der zweite Klick rechtzeitig ein, wird die vorgemerkte Einzelklickaktion
verworfen. Dadurch schaltet ein Doppelklick nicht versehentlich kurz aus oder
weiter. Der Standardwert ist `500` ms und kann konfiguriert werden.

`SelectScenario` wechselt in den Modus `scenario`. Modus, Szenario,
Ein/Aus-Zustand, Einzellichtnummer und `DutyCycle` werden in `runtimeState`
gespeichert. Auch ein ausgeschaltetes Szenario bleibt daher nach einem Neustart
ausgeschaltet.

Eine leere Szenarioliste, ein gelöschtes oder unbekanntes extern ausgewähltes
Szenario und eine ungültige Tasteraktion werden auf eine bedienbare dynamische
Grundfolge zurückgeführt. Dadurch bleibt bei jeder Ausgangszahl von 1 bis 16
mindestens LED 1 erreichbar.

Der Ultralangdruck ist gegenüber dem normalen Langdruck exklusiv: Die
2-Sekunden-Aktion wird erst beim Loslassen vor Ablauf der 4-Sekunden-Grenze
ausgeführt. Wird weiter gehalten, setzt der Controller sofort:

```js
msg.payload.SendCommand = "CommandAllLightsOff";
```

Gleichzeitig werden alle `LedOutput`-Werte auf `0` gesetzt und dieser Zustand
persistiert. `ultraHoldTimeMs` und `ultraLongAction` sind pro Instanz bzw.
Eingang konfigurierbar.

Stellen für eigene Anpassungen:

- `DEFAULT_DOUBLE_CLICK_TIME_MS`: Standard-Doppelklickfenster;
- `DEFAULT_ULTRA_HOLD_TIME_MS`: Standardgrenze für den Ultralangdruck;
- `normalizeInputBindings()`: Standardaktionen;
- `applyAction()`: Einzel-, Doppel-, Lang- und Ultralangdruckaktionen;
- `flushUltraLongPresses()`: exklusive 4-Sekunden-Auslösung;
- `getPersistentState()` / `restorePersistentState()`: Neustart-Persistenz;
- `examples/light-controller-function.js`: Klick- und Ultralang-Timer sowie
  Weitergabe von `payload.SendCommand`.

Dynamische Konfiguration im Küchen-Function-Node:

```js
msg.topic = "light-controller/configure";
msg.payload = {
  inputCount: 2,
  outputCount: 4,
  inputBindings: [
    { shortAction: "next", longAction: "save" },
    { shortAction: "off", longAction: "none" }
  ],
  scenarios: [
    { id: "work", name: "Arbeit", activeLights: [0, 1, 2] },
    { id: "night", name: "Nacht", outputs: [0.1, 0, 0, 0.05] }
  ]
};
```

Die Konfiguration wird im Flow-Kontext unter
`LightControllerKitchenConfiguration` gespiegelt. Zusätzlich speichert der
`LightControllerScenarioStore` sie atomar und mit privaten Dateirechten unter
`~/.node-red/data/light-controller-scenarios/Kitchen.json`. Sie bleibt damit
auch nach Node-RED- und Rechnerneustarts erhalten.

## Kompatibilität

Die frühere Aktion `longAction: "toggle-next"` bleibt für bestehende
Sonderkonfigurationen verfügbar:

1. Sind LEDs aktiv, schaltet ein Langdruck ab 2 Sekunden diese LEDs aus.
2. Ein weiterer Langdruck ab 2 Sekunden aktiviert das nächste Szenario.
3. Danach wiederholt sich die Folge: ausschalten, nächstes Szenario einschalten.

Die alte Speicherfunktion ist weiterhin mit `longAction: "save"` verfügbar.

## Erweiterungsregeln

1. Raumbezug nur im Instanznamen und Context-Schlüssel verwenden.
2. Neue Aktionen ausschließlich in `applyAction()` ergänzen.
3. Neue Szenariofelder in `normalizeScenario()` validieren.
4. Bestehende Ausgangsfelder nicht umbenennen.
5. Jede Erweiterung in `test/LightController.test.mjs` absichern.
6. Persistenz ausschließlich über `LightControllerScenarioStore` kapseln.
# v0.8.9 – Szenariovorgaben und Gesamthelligkeit

Der Dashboard-Taster sendet nur ButtonPressed; er überschreibt keine Helligkeit mehr.
Die Ausgabe ist Szenarioprozent × Gesamthelligkeit / 100. Im neuen Feld
„Gesamthelligkeit“ 100 eintragen und „Übernehmen“ wählen, um die Szenariovorgaben
unverändert auszugeben. Bestehende Dimmung bleibt beim Update absichtlich erhalten.
`payload = { Command: 'SetDutyCycle', DutyCycle: 100 }` setzt und persistiert die
Gesamthelligkeit. Nur endliche Zahlen von 0 bis 100 sind erlaubt; 0 ist gültig.
Szenariodefinitionen werden dabei nicht verändert.

Dropdown-Auswahl und aktive Szene sind unabhängig vom bearbeiteten Entwurf.
Auswählen/Löschen verwenden den Dropdown-Namen, Speichern/Anlegen den Formularnamen.
Grundszenarien bleiben geschützt: abweichende Werte unter einem eigenen Namen
anlegen und danach im Dropdown auswählen. Statusmeldungen überschreiben keine Entwürfe.
Anpassungspunkte: Dashboard `sendButton`, `applyDutyCycle`, `sendScenarioCommand`;
Controller `process` für SetDutyCycle und `getLedOutput` für die Skalierung.
