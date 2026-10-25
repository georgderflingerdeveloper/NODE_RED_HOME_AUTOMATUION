# Zeitraumabfrage und manuelle Monatsabrechnung – 0.12.0

Kosten-Dashboard: „Zeitraum auswerten“, Datum JJJJ-MM-TT, Uhrzeit HH:MM, dann „Zeige“. Ein zusammenhängender Zeitraum, Beginn inklusive / Ende exklusive; Europe/Vienna. Maximal 366 Tage, keine Zukunft. Nicht existente oder doppeldeutige Zeiten bei Sommer-/Winterzeit werden ausdrücklich zurückgewiesen. Tagesgrenzen funktionieren auch an 23-/25-Stunden-Tagen.

Berechnung: vorhandene Stundenenergie wird aufsummiert. Teilstunden und Tarifwechsel innerhalb einer Stunde erfordern eine zeitanteilige Schätzung. Negative Tarife sind zulässig. Kosten = Summe aus Abschnittsenergie × Abschnittstarif; Durchschnitt ct/kWh = Kosten × 100 / bepreiste kWh. Keine Rundung vor der Ausgabe, kompensierte Summation. Sechs Nachkommastellen sind Rechengenauigkeit, keine Garantie der Messgenauigkeit.

Offline-Stunden, fehlende Werte und unzureichende Stichproben werden ausgelassen. Fehlende oder überlappende Tarife liefern keine erfundenen Kosten. Ergebnis nennt erfasste und bepreiste kWh sowie Intervallabdeckung. Online-Stunden können trotzdem interne Messlücken enthalten; die bestehende Datenbank kann lückenlose Erfassung nicht beweisen. Tagesanker werden nicht über frei gewählte Stunden verteilt. Bestehende Messwerte werden nicht korrigiert oder verändert. Keine Werte bedeutet „—“, echter erfasster Nullverbrauch bedeutet 0.

Monatsabrechnung: Monat laden/neu, kWh (maximal 3 Nachkommastellen), Gesamtbetrag und optional reine Energiekosten (je maximal 2 Nachkommastellen), Notiz, ausdrücklich speichern. Punkt oder Komma als Dezimalzeichen, keine Tausendertrennzeichen. Beträge sind nichtnegative Rechnungswerte, keine Gutschriften. Ein Datensatz je Kalendermonat. Gesamtbetrag wird separat gezeigt, weil er Netz/Steuern enthalten kann. Kostenvergleich nur gegen optional erfasste reine Energiekosten; bei fehlender Intervall-/Tarifabdeckung keine definitive Monatsdifferenz. Vergleich bleibt auch bei voller Intervallabdeckung durch die Messqualität eingeschränkt.

SQLite-Tabelle user_monthly_bills wird beim Node-Start additiv erzeugt. Geld als Integer-Cent, Energie als Milli-kWh. Transaktion und Revisionsprüfung verhindern verlorene konkurrierende Änderungen. Messdaten bleiben unabhängig. Bestehende SQLite-Backups schließen die neue Tabelle ein. Keine Schema-Löschungen. Rückkehr zu altem Code lässt die neue Tabelle unberührt.

Wartung: nodes/energy-range.cjs (Zeit/Berechnung), nodes/monthly-bills.cjs (Abrechnung), nodes/home-automation-history.js (SQL/Transport), Kosten-Template (UI). Eigene Abfragen laufen über history/dashboard action range/bill-load/bill-save; Antworten history/range/result und history/bill/result. Socket-ID bleibt erhalten. Regelmäßige Dashboard-Updates überschreiben keinen Entwurf. Keine Gmail-Verbindung oder KI-Abhängigkeit in dieser Version.

## Kalenderbedienung 0.12.1
Native Datum-, Zeit- und Monatsfelder mit großen kontrastreichen Eingaben. Vorgabe: gestern 00:00 bis heute 00:00 (Europe/Vienna), letzter Abrechnungsmonat. Schnellwahl setzt nur Eingaben; Zeige führt die Abfrage aus. Live-Updates erhalten Eingaben. Gestaltung: cost-range-editor im cost-dashboard.html; Vorgaben: setRangePreset. Kalenderdarstellung hängt vom Browser ab.

## Preisfarben 0.13.2
Stundentarife und Kosten in Tag-/Monat-/Jahrestabellen sind fett markiert.
Grenzen: <=22 grün, <=25 gelb, <=30 orange, >30 rot (ct/kWh).
Negative Preise zählen günstig. Nicht numerische/fehlende Werte bleiben neutral.
Kostensummen werden anhand EUR*100/kWh bewertet, sofern Messdaten vorhanden und
keine Offlineintervalle gemeldet sind. Bei null Verbrauch bleibt die Farbe neutral.
Dies ist eine Preisbewertung, keine Aussage über vollständige Messabdeckung.
Änderungsstellen im cost-dashboard.html: PRICE_BANDS (Grenzen), PREISFARBEN (CSS).
Die Legende folgt den Grenzen automatisch. Aktuelle Stunde bleibt hellgrün;
dunkle Preisfelder sichern den Kontrast. Keine neue Abfrage/Neuberechnung von Kosten.

## Interaktiver Preisverlauf · 0.18.0

Nach „Zeige“ öffnet „Graphische Anzeige für den Zeitraum“ den gespeicherten
Tarifverlauf als Liniendiagramm. Die Linie folgt den tatsächlichen Tarifintervallen
als Stufen; Preisfarben und Grenzen entsprechen der bestehenden Preisbewertung.
Hover oder Antippen zeigt Wiener Datum/Uhrzeit samt UTC-Offset und den Tarif am
Cursor mit zwei Nachkommastellen. Auch negative Preise und echte Nullpreise
bleiben erhalten. Fehlende und überlappende Tarife werden als Lücken gezeigt;
der Tarifverlauf ist unabhängig von der Verfügbarkeit der Verbrauchsmessung.
Die gestrichelte Referenz zeigt den verbrauchsgewichteten Netzbezugspreis des
gesamten ausgewerteten Zeitraums, sofern berechenbar.

Zoom +/− (bis 128×), Früher/Später und der Schieberegler ändern nur den sichtbaren
Ausschnitt. „Gesamter Zeitraum“ setzt die Ansicht zurück. Tastatur bei fokussiertem
Diagramm: +/−, Links/Rechts, Home. Auf schmalen Displays ist das Diagramm zusätzlich
horizontal scrollbar. Die Preisachse bleibt beim Zoomen stabil. Höchstens vier
SVG-Linienpfade halten auch lange Zeiträume mit vielen Tarifintervallen bedienbar.
Live-Tarife überschreiben den abgefragten Verlauf nicht; eine neue Zeitraumabfrage
schließt die bisherige Grafik und verwirft die alte Auswahl.

`history/range/result` enthält zusätzlich `priceSeries` mit auf den Bereich
begrenzten `{from, to, priceCtKwh}`-Abschnitten (Zeitpunkte in Millisekunden seit
Unix-Epoche). Messwerte, Kostenberechnung und Datenbankschema bleiben erhalten.
Zur Aktivierung muss `npm run nodes:install` auch die aktualisierte
`nodes/energy-range.cjs` installieren; anschließend Flows laden/Node-RED neu starten.
Preise werden nur bei der Anzeige auf zwei Nachkommastellen gerundet.

## Slider-Korrektur · 0.18.1

Der Zeitraumschieber ist auch bei 1× bedienbar und aktiviert beim Verschieben
automatisch 2× Zoom. Er nutzt die volle Breite; Positionen werden auf gültige
ganzzahlige Schritte von 0 bis 1000 begrenzt. Vorheriges manuelles Zoomen entfällt.

## Cloud-Lückenfüllung · 0.19.0

SolarEdge-Cloud-Werte ergänzen erkannte lokale Erfassungslücken. Herkunft bleibt
getrennt ausgewiesen (lokal blau, Cloud violett); Preise behalten ihre bisherigen
Bewertungsfarben. Einrichtung, Grenzen, Nachladen und das neue Menü „SolarEdge
Vergleich“: [SOLAREDGE_CLOUD_RECONCILIATION.md](SOLAREDGE_CLOUD_RECONCILIATION.md).
