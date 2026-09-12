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

## Konfiguration

```js
{
  instanceName: "Kitchen",
  inputCount: 3,
  outputCount: 6,
  holdTimeMs: 2000,
  inputBindings: [
    { id: "main", shortAction: "next", longAction: "toggle-next" },
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
```

Der mitgelieferte Debug-Node zeigt `LedStatusText`. Die Inject-Nodes
`TEST · Taster EIN (drücken)` und `TEST · Taster AUS (loslassen)` simulieren den
Taster. Für einen Langdruck zuerst EIN klicken, mindestens zwei Sekunden warten
und danach AUS klicken.

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

## Standardverhalten bei Langdruck

`longAction: "toggle-next"` bildet die gewünschte Zweischrittfolge:

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
