# HOMEAUTOMATION_NG

Langfristig gepflegtes Node-RED-Projekt für Hausautomation, SolarEdge und Wetterprognose.

Der produktive Node-RED-Flow bleibt in `flows.json`. Zusätzlich gibt es unter
`flow-src/` eine für VS Code lesbare und verlustfrei rückführbare Darstellung:

- jeder Flow besitzt ein eigenes Verzeichnis;
- Node-Metadaten stehen in übersichtlichen `nodes.json`-Dateien;
- Function-Nodes liegen als normale JavaScript-Dateien vor;
- jeder Function-Node wird zusätzlich als einzelne Node-RED-Bibliotheksdatei gespiegelt;
- Dashboard-Templates liegen als HTML-Dateien vor;
- `manifest.json` bewahrt Reihenfolge, Zuordnung und Prüfsummen.

## Schnellprüfung

```bash
npm run flow:check
npm test
npm run flow:roundtrip
```

Diese Befehle verändern den laufenden Node-RED-Server nicht.

## Round-Trip Node-RED → VS Code

Nach Änderungen und **Deploy** im Node-RED-Editor:

```bash
npm run flow:export
```

Der Export überschreibt keine geänderten VS-Code-Quelldateien. Sind dort noch
nicht importierte Änderungen vorhanden, bricht er mit einer verständlichen Meldung ab.

## Round-Trip VS Code → Node-RED

1. JavaScript, HTML oder Node-Metadaten unter `flow-src/` bearbeiten.
2. Tests ausführen:

   ```bash
   npm test
   ```

3. Quellen sicher nach `flows.json` übernehmen:

   ```bash
   npm run flow:import
   ```

4. Noch einmal vollständig prüfen:

   ```bash
   npm run flow:check
   npm run flow:roundtrip
   ```

5. In den laufenden lokalen Node-RED-Server deployen:

   ```bash
   npm run flow:deploy
   ```

Vor einer wirklichen Änderung an `flows.json` legt der Import automatisch
`.flow-import-backup.json` an. Diese lokale Sicherung wird nicht committet.

## JavaScript-Unit-Tests

Tests liegen unter `test/` und verwenden den in Node.js eingebauten Test-Runner.
Es sind keine zusätzlichen Testpakete notwendig.

```bash
npm test
```

Der wiederverwendbare Harness in
`test/helpers/function-node-harness.mjs` stellt Function-Nodes die bekannten
Node-RED-Objekte `msg`, `node`, `context`, `flow`, `global` und `env` bereit.

Beispiel:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { runFunctionNode } from "./helpers/function-node-harness.mjs";

test("mein neuer Function-Node", async () => {
  const { result } = await runFunctionNode("NODE_ID", {
    msg: { payload: 10 },
    globalValues: { Freigabe: true },
  });

  assert.equal(result.payload, 10);
});
```

Weitere Einzelheiten stehen in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Node-RED-Function-Bibliothek

Alle Function-Nodes werden einzeln unter `lib/functions/generated/` versioniert.
Beim Deployment installiert das Projekt diese Dateien zusätzlich in den aktiven,
exklusiven Node-RED-Bibliotheksordner:

```text
~/.node-red/lib/functions/HOMEAUTOMATION_NG/
```

Damit erscheinen sie im Function-Node unter **Bibliothek → Importieren**. Die bereits
vorhandenen persönlichen Dateien direkt unter `~/.node-red/lib/functions/` werden
nicht verändert.

Ordner und JavaScript-Dateien verwenden ausschließlich verständliche Namen, zum
Beispiel `wetter/wetterdaten-prufen-und-payload-aufbauen.js`. Bei identischen
Function-Namen im selben Flow wird stabil mit `-2`, `-3` usw. unterschieden.
Technische Node-IDs stehen nur in den unsichtbaren Metadaten zur sicheren Zuordnung.

Nur die Bibliothek synchronisieren:

```bash
npm run library:install
```

## Wichtige Regeln

- `flows.json` und `flow-src/` müssen vor einem Commit synchron sein.
- Zugangsdaten gehören nicht in Function-Node-Quelltexte oder Tests.
- Unit-Tests dürfen keine realen Aktoren schalten.
- `npm run flow:deploy` synchronisiert die Bibliothek und verändert anschließend den laufenden Flow.
- Node-RED-Editor und VS Code nie gleichzeitig am selben Flow ändern; erst eine Richtung
  vollständig abschließen.
