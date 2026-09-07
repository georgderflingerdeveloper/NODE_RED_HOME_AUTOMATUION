# Wartung: Projekt- und Versionsinformation

## Zweck

Der Info-Kopf im SYSTEM-Dashboard zeigt den tatsächlich laufenden Projektstand.
Damit sind ein falsches aktives Node-RED-Projekt, ein falscher Git-Branch oder
nicht committete Änderungen ohne Terminal sofort erkennbar.

## Datenfluss

1. `system_project_info_schedule` fordert die Information beim Start und jede Minute an.
2. `home-automation-project-info` liest ausschließlich lokale Metadaten.
3. `version-und-kurzinfo.html` setzt Version, Branch und den Info-Schalter in
   die oberste Dashboard-Statusleiste und zeigt den aufklappbaren Überblick.

Der Knoten führt nur lesende Git-Befehle aus und verändert weder Branch noch
Dateien.

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

Die Passwortverwaltung und Projektinformation bilden Version `0.1.0`.

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
`flow-src/flows/system--system_dashboard_flow/templates/version-und-kurzinfo.html`.
Für jede neue Erkennung ist ein Test in `test/project-info.test.mjs` hinzuzufügen.
