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
Die sichtbare Von-bis-Datumsangabe für den ausgewählten Kostenzeitraum bildet
Patch-Version `0.3.2`.
Die generische und dynamisch konfigurierbare Lichtsteuerung bildet Version
`0.4.0`; `LightControllerKitchen` ist ab dort ausschließlich Instanzname und
Kompatibilitätsalias.
Die persistente Szenarioverwaltung bildet Version `0.5.0`, der namensbasierte
`SelectScenario`-Befehl Patch-Version `0.5.1`.
Die persistenten Betriebsmodi und die Szenarioauswahl per Doppelklick ohne
ungewollte Einzelklickaktion bilden Version `0.6.0`.
Der exklusive Ultralangdruck ab vier Sekunden, das sofortige Ausschalten aller
Lichter und die Commander-Ausgabe `payload.SendCommand = "CommandAllLightsOff"`
bilden Version `0.7.0`.
Das bidirektionale Kitchen-Testdashboard mit persistentem Szenarioeditor, sechs
LED-Anzeigen, Push-Texten sowie Drück-, Loslass- und Dauerausgabe bildet Version
`0.8.0`.
Das automatische Festhalten von Gruppenszenarien, ihr gemeinsames Toggeln per
Kurzdruck und das Verlassen erst per Langdruck über zwei Sekunden bilden
Patch-Version `0.8.1`.
Die dynamische, persistente LED-Anzahl von 1 bis 16 und der `+`-Button im
Kitchen-Dashboard bilden Patch-Version `0.8.2`.
Die Berücksichtigung aller dynamisch hinzugefügten LEDs in der normalen Einzel-
und Gruppenschaltfolge bildet Patch-Version `0.8.3`.
Die Live-Aktualisierung ohne Zurücksetzen geöffneter Auswahl- oder Eingabefelder
bildet Patch-Version `0.8.4`.
Die automatische Reparatur alter, hinter den 6er-Gruppen einsortierter
Zusatz-LEDs beim Laden, die bewegungsfreie Tasteranzeige, der `−`-Button und die
gegen Löschen geschützte dynamische Grundfolge bilden Patch-Version `0.8.5`.
Das kontrollierte Festhalten des aktuellen Einzel- oder Gruppenszenarios erst
durch Langdruck, das anschließende gemeinsame Toggeln und die selbstheilende
Rückkehr aus ungültigen oder gelöschten Szenariozuständen bilden Patch-Version
`0.8.6`.
Die auf Georgs tatsächlich eingesandter Controllerdatei basierende
Zusammenführung erhält alle erklärenden Kommentare, verwirft jedoch die darin
noch enthaltene ältere LED-Erweiterungslogik. Dieser geprüfte Stand bildet
Patch-Version `0.8.7`.
Die vollständige, aus allen elf eingesandten Projektdateien aufgebaute
Dreiwege-Mergebasis beseitigt auch Konflikte in Tests und Dokumentation und
bildet Patch-Version `0.8.8`.

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
