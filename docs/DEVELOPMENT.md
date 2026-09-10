# Entwicklungsablauf

## Architektur

`flows.json` bleibt die von Node-RED geladene Laufzeitdatei. Die Werkzeuge unter
`tools/flow-source/` erzeugen daraus eine zweite, entwicklerfreundliche Sicht:

```text
flows.json
   ⇅ bytegenauer Import/Export
flow-src/
├── manifest.json
├── configuration/
│   └── nodes.json
└── flows/
    └── FLOWNAME--FLOW_ID/
        ├── nodes.json
        ├── functions/
        │   └── NAME--NODE_ID.js
        └── templates/
            └── NAME--NODE_ID.html

lib/functions/generated/
└── FLOWNAME/
    └── FUNCTION-NAME.js
```

In `nodes.json` ersetzt ein Verweis wie
`{"$flowSource":"flows/.../functions/...js"}` den ursprünglichen langen
JavaScript- oder HTML-Text. Beim Import wird dieser Inhalt an exakt derselben
Property-Position wieder eingesetzt. Dadurch bleibt der Round-Trip bytegenau.

## Schutz vor Datenverlust

Der Export speichert für jede generierte Datei eine SHA-256-Prüfsumme. Wurde eine
Datei in VS Code geändert, verweigert `npm run flow:export` das Überschreiben.
Dann ist zuerst `npm run flow:import` auszuführen.

Der Import:

1. liest sämtliche `nodes.json`-Dateien;
2. setzt ausgelagerte JavaScript- und HTML-Dateien ein;
3. prüft doppelte IDs, alle Wires, Links und Function-Syntax;
4. erzeugt den kompletten Flow im Speicher;
5. sichert die bisherige Datei als `.flow-import-backup.json`;
6. ersetzt `flows.json` atomar.

Credentials und bestehende Node-RED-Einstellungen werden von den Werkzeugen nicht
gelesen oder verändert.

Jeder Function-Node wird außerdem als eigenständige `.js`-Datei mit
Node-RED-kompatiblen Metadatenzeilen gespeichert. Bestehende Dateien in
`lib/functions/` werden dabei nicht überschrieben.

Die sichtbaren Bibliotheksnamen enthalten keine Node-IDs oder Hashes. Kommt ein
Function-Name innerhalb desselben Flows mehrfach vor, verwendet der Generator
verständliche Suffixe wie `-2` und `-3`. Die unveränderliche Node-ID bleibt nur in
der Metadatenzeile `// nodeId:` erhalten.

## Befehle

| Befehl | Wirkung |
|---|---|
| `npm run flow:export` | `flows.json` sicher nach `flow-src/` exportieren |
| `npm run flow:import:check` | Import nur im Speicher prüfen |
| `npm run flow:import` | `flow-src/` validieren und nach `flows.json` schreiben |
| `npm run flow:check` | Synchronität, Syntax und Referenzen prüfen |
| `npm run flow:roundtrip` | isolierten bytegenauen Export/Import prüfen |
| `npm test` | alle JavaScript-Unit-Tests ausführen |
| `npm run library:install` | versionierte Functions nach `~/.node-red/lib/functions/HOMEAUTOMATION_NG/` installieren |
| `npm run nodes:install` | eigene Datenbank- und Tresorknoten nach `~/.node-red/nodes/` installieren |
| `npm run flow:deploy` | validiertes `flows.json` lokal zu Node-RED deployen |
| `npm run version:patch` | Version für eine Fehlerkorrektur erhöhen |
| `npm run version:minor` | Version für eine neue kompatible Funktion erhöhen |
| `npm run version:major` | Version für eine inkompatible Änderung erhöhen |

Die gleichen Befehle sind in VS Code unter **Terminal → Task ausführen** verfügbar.

## Verbindliche Versionierung

Jeder Commit, Patch und jedes andere ausgelieferte Änderungspaket erhält eine
neue Version in `package.json`. Die Version wird vor der abschließenden Prüfung
genau einmal erhöht:

- Fehlerkorrektur oder kleine Wartungsänderung: `npm run version:patch`;
- neue rückwärtskompatible Funktion: `npm run version:minor`;
- inkompatible Änderung an Flows, Schnittstellen oder Daten: `npm run version:major`.

Ein Installationspaket muss die aktualisierte `package.json` enthalten und in
das aktive Projekt kopieren. Dadurch zeigt der Dashboard-Kopf nach dem
Node-RED-Neustart immer den ausgelieferten Stand. Der provider-neutrale
Forecast-Flow beginnt mit Version `0.3.0`; die nächste Korrektur ist mindestens
Version `0.3.1`. Diese Patch-Version aktualisiert auch ältere Projekttests auf
die englischen Dashboard-Source-Dateinamen.

Ist der Node-RED-Editor mit `adminAuth` geschützt, verwendet das Deploy-Skript
`NODE_RED_ACCESS_TOKEN` oder fordert über `NODE_RED_USERNAME` und
`NODE_RED_PASSWORD` automatisch ein kurzlebiges Zugriffstoken an. Zugangsdaten
werden nicht in Git gespeichert. Ein bereits aktualisiertes aktives Projekt kann
alternativ mit `node-red-restart` neu geladen werden.

## Einen Function-Node bearbeiten

1. Die Node-ID im Node-RED-Editor ablesen.
2. In VS Code global nach der ID suchen.
3. Die gefundene Datei unter `flow-src/**/functions/` bearbeiten.
4. Einen Test unter `test/FUNCTION-NAME.test.mjs` ergänzen. Der englische
   Dateiname muss exakt dem Namen der JavaScript-Datei entsprechen, zum Beispiel
   `provide-weather-automation-data.js` und
   `provide-weather-automation-data.test.mjs`. Alle direkten Tests derselben
   Function gehören in diese eine Testdatei.
5. `npm test` ausführen.
6. `npm run flow:import` ausführen.
7. `npm run flow:check` und `npm run flow:roundtrip` ausführen.
8. Erst danach mit `npm run flow:deploy` deployen.

## Unit-Test-Harness

`runFunctionNode()` lädt den echten ausgelagerten Function-Node. Dadurch testet
der Test nicht eine Kopie, sondern denselben JavaScript-Code, der wieder in
`flows.json` importiert wird.

Verfügbare Optionen:

```js
const execution = await runFunctionNode("NODE_ID", {
  msg: { payload: 123 },
  contextValues: {},
  flowValues: {},
  globalValues: {},
  envValues: {},
  waitAfterReturnMs: 0,
});
```

Das Ergebnis enthält:

- `result`: Rückgabewert des Function-Nodes;
- `sent`: Aufrufe von `node.send`;
- `statuses`: Aufrufe von `node.status`;
- `warnings` und `errors`;
- die Context-Stores `context`, `flow` und `global`.

Hardwarezugriffe, Modbus-Kommunikation und Serverneustarts werden nicht in
Unit-Tests ausgelöst. Stattdessen wird die davorliegende Entscheidungslogik getestet.

## Node-RED-Bibliothek

Die Projektkopie unter `lib/functions/generated/` ist versioniert. Die aktive
Node-RED-Installation liest dagegen aus dem userDir. `npm run library:install`
kopiert ausschließlich in den eigenen Unterordner `HOMEAUTOMATION_NG`.

Ein Installationsmanifest schützt dort manuelle Änderungen vor versehentlichem
Überschreiben. Andere persönliche Bibliotheksdateien werden weder gelesen noch gelöscht.

## Neue Nodes und Flows

Neue Nodes werden vorzugsweise weiterhin im Node-RED-Editor erstellt. Danach:

```bash
npm run flow:export
npm run flow:check
npm test
```

Der Import erkennt auch neue oder entfernte Nodes in vorhandenen `nodes.json`-Dateien.
Für große strukturelle Änderungen ist der grafische Node-RED-Editor weiterhin die
sicherste Oberfläche.

## System-Zugangstresor

Architektur, Zustände, Nachrichtenschnittstelle und Erweiterungsregeln der
Passwortverwaltung stehen in [`SYSTEM_CREDENTIAL_VAULT.md`](SYSTEM_CREDENTIAL_VAULT.md).
Änderungen am Tresor müssen die dort beschriebenen Sicherheitsregeln und die
Tests in `test/home-automation-credential-vault-core.test.mjs` und
`test/home-automation-credential-vault.test.mjs` einhalten.

## Projekt- und Versionsinformation

Die Herkunft von App-Version, aktivem Projekt, Branch und Commit sowie die
Regeln zur Erweiterung stehen in
[`PROJECT_VERSION_INFO.md`](PROJECT_VERSION_INFO.md).
