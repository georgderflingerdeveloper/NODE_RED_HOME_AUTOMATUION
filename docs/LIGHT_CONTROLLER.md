# LightController

`LightController` ist die generische, hardwareunabhängige Lichtlogik. Namen wie
`LightControllerKitchen` bezeichnen ausschließlich eine konkrete Instanz.

## Dateien

- `lib/functions/generated/LightController.js`: einzige Implementierung;
- `lib/functions/generated/LightControllerKitchen.js`: kompatibler Weiterleiter;
- `examples/LightController.node-red.json`: wartbarer Function-Node-Wrapper;
- `test/LightController.test.mjs`: direkte Unit-Tests der echten Moduldatei.

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
`LightControllerKitchenConfiguration` gespeichert. Mit dateibasiertem
Node-RED-Kontext bleibt sie auch nach einem Neustart erhalten.

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
