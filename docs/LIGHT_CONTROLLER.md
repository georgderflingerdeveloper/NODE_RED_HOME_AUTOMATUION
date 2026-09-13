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
- sechs LED-Anzeigen mit dem tatsächlichen Prozentwert aus `LedOutput`;
- Auswahl vorhandener Szenarien;
- sechs Prozentfelder für `ScenarioProperties`;
- Aktionen zum Speichern, Anlegen, Auswählen, Auflisten und Löschen.

Das Dashboard sendet keine eigene Lichtlogik. Es erzeugt ausschließlich die
dokumentierten Controller-Nachrichten. Deshalb bleiben Bedienung, Hardware und
Automatisierungs-Flows konsistent.

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
| `normal` | nächstes Licht/Szenario | nächstes Szenario auswählen | aktuelles Einzellicht persistent übernehmen | alle Lichter aus, Commander-Befehl senden |
| `scenario` | gewähltes Szenario persistent Ein/Aus | nächstes Szenario auswählen | Szenariomodus verlassen, Normalbetrieb fortsetzen | alle Lichter aus, Modus verlassen, Commander-Befehl senden |
| `manual-light` | gewähltes Einzellicht persistent Ein/Aus | nächstes Szenario auswählen | Einzellichtmodus verlassen, Normalbetrieb fortsetzen | alle Lichter aus, Modus verlassen, Commander-Befehl senden |

Der erste kurze Klick wird während `doubleClickTimeMs` nur vorgemerkt. Trifft
der zweite Klick rechtzeitig ein, wird die vorgemerkte Einzelklickaktion
verworfen. Dadurch schaltet ein Doppelklick nicht versehentlich kurz aus oder
weiter. Der Standardwert ist `500` ms und kann konfiguriert werden.

`SelectScenario` wechselt in den Modus `scenario`. Modus, Szenario,
Ein/Aus-Zustand, Einzellichtnummer und `DutyCycle` werden in `runtimeState`
gespeichert. Auch ein ausgeschaltetes Szenario bleibt daher nach einem Neustart
ausgeschaltet.

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
