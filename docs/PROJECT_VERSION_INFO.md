# Wartung: Projekt- und Versionsinformation

## Zweck

Der Info-Kopf im SYSTEM-Dashboard zeigt den tatsächlich laufenden Projektstand.
Damit sind ein falsches aktives Node-RED-Projekt, ein falscher Git-Branch oder
nicht committete Änderungen ohne Terminal sofort erkennbar.

## Datenfluss

1. `home-automation-project-info` liest ausschließlich lokale Metadaten.
2. Der nur lesende Endpunkt `/home-automation/project-info` stellt diese
   ungefährlichen Versionsdaten dem Dashboard bereit.
3. `project-version-and-branch-info.html` liest den Endpunkt beim Laden und jede Minute,
   setzt Version, Branch und den Info-Schalter in die oberste
   Dashboard-Statusleiste und zeigt den aufklappbaren Überblick.

Der vorhandene Flow-Aufruf bleibt zusätzlich für Node-RED-Diagnose und
Erweiterungen erhalten. Das globale Dashboard-Template hängt dadurch nicht vom
Angular-Kontext einer bestimmten Dashboard-Seite ab.

Knoten und Endpunkt führen nur lesende Git-Befehle aus und verändern weder
Branch noch Dateien. Passwörter und Tresordaten werden nicht ausgeliefert.

## Angezeigte Werte

| Wert | Quelle |
|---|---|
| App-Version | `package.json` |
| aktives Projekt | absolute Flow-Datei oder `.config.projects.json` |
| Branch | `git branch --show-current` |
| Commit | `git rev-parse --short=8 HEAD` |
| Änderungen | `git status --porcelain` |
| Branch-Zweck | `homeAutomation.branchPurposes` in `package.json` |
| Node-RED-Version | laufende Node-RED-Instanz |
| Node.js/Plattform | laufender Prozess |

## Versionierung

Die App-Version folgt `MAJOR.MINOR.PATCH`:

- `MAJOR`: inkompatible Änderung an Flows oder gespeicherten Daten;
- `MINOR`: neue wartbare Funktion;
- `PATCH`: Fehlerbehebung ohne geänderte Bedienlogik.

Die SolarEdge-Energiebilanz und die erweiterte Projektinformation bilden
Version `0.2.0`. Der anbieterunabhängige Flow `ENERGY_FORECAST` und die globale
Automationsstruktur `EnergyForecastData` bilden Version `0.3.0`.
Der kompatible Installer mit englischen Source-Dateinamen und aktualisierten
Bestandstests bildet Patch-Version `0.3.1`.

Jeder ausgelieferte Commit oder Patch erhöht die Version genau einmal. Dafür
stehen `npm run version:patch`, `npm run version:minor` und
`npm run version:major` bereit. Installationspakete müssen `package.json`
mitführen, damit die sichtbare Versionsnummer dem tatsächlich installierten
Stand entspricht.

## Branch-Kurzinfo pflegen

Die Erklärung hinter dem `i` wird nach Branchname in `package.json` gepflegt:

```json
"homeAutomation": {
  "branchPurposes": {
    "mein-branch": "Kurze, verständliche Beschreibung des Arbeitsstands."
  }
}
```

So kann ein neuer Branch beschrieben werden, ohne Dashboard- oder Node-Code zu
ändern. Für nicht eingetragene Branches erscheint bewusst eine neutrale Kurzinfo.

## Erweiterung

Neue Metadaten werden zuerst in
`nodes/home-automation-project-info-core.cjs` ergänzt. Die Darstellung bleibt in
`flow-src/flows/system--system_dashboard_flow/templates/project-version-and-branch-info.html`.
Für jede neue Erkennung ist ein Test in `test/home-automation-project-info.test.mjs` hinzuzufügen.
