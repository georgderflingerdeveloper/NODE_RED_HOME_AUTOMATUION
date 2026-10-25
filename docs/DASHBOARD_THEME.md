# Dashboard-Graustufen v0.14.2
Basis v0.14.1. Nur Darstellung: Türkise Dekorfarben in CSS/konstanten Inline-Styles
werden durch neutrale Grautöne ersetzt. Semantische Grün-, Gelb-, Rot- und
Preisfarben bleiben erhalten, ebenso dynamische Leistungsfarben.

Node-RED-Grundfarben: flow-src/configuration/nodes.json, ui_base.theme.
Komponentenfarben: jeweilige HTML-Datei unter flow-src/flows/*/templates/.
Zentraler Tastaturfokus, Hover, deaktivierte Controls und Ziffernausrichtung:
project-version-and-branch-info.html, Kommentar GEORGSHOME GRAUSTUFEN.
Nach Änderung npm run flow:import, npm test, npm run flow:check.

Keine Änderung an JavaScript, Angular-Bindings, Nachrichten, Persistenz,
Berechnungen, Abständen, Kartengrößen oder Schaltlogik. Dadurch bleiben die
bereits stabilisierten Taster- und Tabellenlayouts erhalten. native Eingaben
verwenden das dunkle Farbschema; Tastaturfokus ist mit heller Kontur sichtbar.

Getestet: unveränderte Scripts und Markup, Statusfarben, bestehende Unit-Tests,
Flow-Prüfung und Roundtrip. Browserdarstellung auf dem Zielgerät noch prüfen.

## Design-Menü v0.15.0
Unter Darstellung stehen Grays, Dark Mode, Blues und Moderate Greens zur Wahl.
Die Auswahl greift sofort, ohne Deploy oder Neustart. localStorage speichert
sie unter georgshome.dashboard.theme.v1 pro Browser/Origin (Adresse + Port).
Andere Geräte/Browser haben eine unabhängige Auswahl; ein Wechsel von IP zu
Hostname benutzt einen anderen Speicherbereich. Löschen von Browserdaten setzt
auf Grays zurück. Bei gesperrtem Speicher erscheint eine Warnung, das Design
wirkt dann nur für die Sitzung. Es handelt sich um eine Darstellungspräferenz,
nicht um eine zentrale Steuerungs- oder Anlagenkonfiguration.

Paletten zentral in dashboard-theme-global.html unter :root[data-gh-theme].
Farbtokens: page, card, inset, control, border, text, muted. Fachtemplates nutzen
CSS-Variablen mit bisherigen Grautönen als Fallback. Signalfarben unverändert.
Optionen und Namen in dashboard-theme-picker.html. Beide befinden sich unter
flow-src/flows/system--system_dashboard_flow/templates/.

Globaler Dienst stellt das Design auch beim direkten Öffnen anderer Seiten her.
Storage-Ereignisse synchronisieren Tabs derselben Adresse. Event-Listener werden
beim Entfernen aufgeräumt. Der Picker besitzt keine Ausgangsverbindungen und
sendet keine Node-RED-Nachrichten. Keine neue Abhängigkeit erforderlich.

## Korrektur v0.15.1
Der globale Theme-Dienst läuft im Head ohne Angular-scope. Vor dem erneuten
Initialisieren wird der alte Storage-Listener entfernt. Picker und persistente
Auswahl bleiben kompatibel. Regressionstest startet absichtlich ohne scope.
Graue Hintergrundbalken auf Überschriften und Absätzen werden entfernt;
Karten erhalten transparente, dezente Konturen. Inputs behalten ihre Abgrenzung,
Fokus und semantische Farbkennzeichnungen bleiben erhalten.
