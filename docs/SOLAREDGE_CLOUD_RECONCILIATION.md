# SolarEdge Monitoring: Lückenfüllung und Quellenvergleich · 0.19.0

## Einrichtung

Im Flow DATENBANK den Knoten **Home Automation Historie** öffnen:

- **Anlagen-ID**: Site ID des SolarEdge-Monitoringportals.
- **API-Schlüssel**: Site API Key aus dem Monitoringportal (Anlagenverwaltung →
  Site Access / Access Control → API Access). API-Zugriff im Portal freigeben.
- **Automatisch**: aktiviert periodische Abfragen und das Nachladen für die
  normale Tag-/Monat-/Jahresanzeige.
- **Rückblick Tage**: 1–366, standardmäßig 7. Alle sechs Stunden wird dieser
  Zeitraum nachgeladen; erster Abruf 15 Sekunden nach Node-Start.

Alternativ serverseitig `SOLAREDGE_SITE_ID` und `SOLAREDGE_API_KEY` verwenden.
Explizite Knotenwerte haben Vorrang. API-Schlüssel ausschließlich im
Node-RED-Credential-Feld oder in der Serverumgebung hinterlegen, niemals in
Flows, Templates, Git oder Dashboard-Nachrichten. Der bestehende SSH-Tresor
bleibt unabhängig; seine Schnittstelle ist nicht für Cloud-API-Schlüssel gedacht.
Node-RED verwaltet das Credential-Feld mit den vorhandenen Sicherheitsregeln.

Die Anlage muss `Europe/Vienna` als Zeitzone melden. Der Client prüft dies über
`/site/{siteId}/details` vor dem ersten Energieimport. Site-ID und API-Schlüssel
sind nicht im Projekt vorkonfiguriert. Ohne Zugang erfolgen keine Netzabfragen;
Dashboard und lokale Aufzeichnung bleiben bedienbar.

## Nachladen und Berechnung

Quelle ist `https://monitoringapi.solaredge.com/site/{siteId}/energyDetails`,
`timeUnit=HOUR`, `unit=Wh`; Messgrößen `Consumption`, `Purchased`, `Production`
und `FeedIn`. Das sind Daten aus derselben Monitoring-Datenquelle wie mySolarEdge.
Es werden Energiemengen verwendet, keine geschätzte Integration von Cloud-Leistung.
Einheit wird geprüft, Wh werden ohne Rundung in kWh umgerechnet.

Abfragen laufen ausschließlich auf dem Server, seriell, mit 30 Sekunden Timeout.
Anfragen werden in höchstens 28 Tage geteilt und sechs Stunden zwischengespeichert.
Ein persistiertes lokales Limit von 250 Anfragen pro UTC-Tag lässt Abstand zum
SolarEdge-Limit. Andere Programme mit demselben Schlüssel können dessen Restbudget
verringern. Authentifizierungs-, Netzwerk- und Formatfehler lösen 15 Minuten
Wartezeit aus. Fehlertexte enthalten keine API-URL, Schlüssel oder Serverantwort.

Normalansichten laden bei aktivierter Automatik ihren angezeigten Zeitraum nach;
„Zeitraum auswerten“, Monatsabrechnung und „SolarEdge Vergleich“ laden ihren
gewählten Bereich ebenfalls. Letzte zwei Stunden werden wegen möglicher
Cloud-Verzögerung ausgespart. Fehlende Cloud-Werte bleiben Lücken; Null ist ein
gültiger Messwert. Tages-/Monatssummen werden niemals künstlich auf Stunden verteilt.

Lokale Originale in `hourly_snapshots` werden nicht verändert. Separat gespeicherte
Cloud-Werte füllen bei der Abfrage nur Stunden, deren lokale Energie offline,
fehlend, ungültig oder unzureichend erfasst ist. Die Auswahl erfolgt je Messgröße:
beispielsweise kann Netzbezug aus der Cloud und Hausverbrauch aus der lokalen
Aufzeichnung stammen. Eine gültige lokale Messung hat Vorrang.

Ab dieser Version dokumentiert `local_energy_coverage` zusätzlich die tatsächlich
integrierte Messdauer je neuer Stunde. Unter 98 % der Stunde gilt die lokale
Erfassung als unzureichend; eine vollständige Cloud-Stunde ersetzt sie in der
Auswertung. Die ursprüngliche Teilerfassung bleibt für den Vergleich sichtbar.
Bei älteren Stunden ohne Zeitabdeckung lässt sich eine interne Messlücke nicht
nachträglich beweisen. Diese bleiben bei bisher gültigem Status lokal und werden
im Vergleich als „Abdeckung unbekannt“ gekennzeichnet.

SolarEdge-Zeitstempel enthalten keinen UTC-Offset. Bei der Herbstumstellung ist
02:00 doppeldeutig. Solche Zeitstempel werden bewusst ausgelassen und gezählt;
keine willkürliche Zuordnung oder doppelte Übernahme. Nicht existente Zeiten,
Dubletten, negative/fehlende Energiemengen oder unerwartete Einheiten werden
nicht als gültige Verbrauchsdaten verwendet. Sommer-/Winterstunden außerhalb
dieses mehrdeutigen Bereichs werden eindeutig zu UTC konvertiert.

Kosten berechnet das vorhandene Verfahren anhand gespeicherter historischer
Tarifintervalle neu. Bei Tarifwechseln innerhalb einer Cloud-Stunde wird die
Stundenenergie zeitanteilig verteilt und als Schätzung ausgewiesen. Fehlende
Tarife werden nicht aus aktuellen Preisen ersetzt. Preise bleiben reine
Energiepreise ohne Netzgebühren, Steuern und Zuschläge.

## Vergleichsmenü

Neuer Dashboard-Menüpunkt **SolarEdge Vergleich**:

- Datumsbereich in Wiener Ortszeit (Bis exklusiv), Vorschläge gestern / 7 Tage.
- **Blau**: lokale Modbus-Aufzeichnung; **Violett**: SolarEdge-Cloud.
- Summen und Verfügbarkeit je Quelle sowie gesonderte Summen ausschließlich
  über deckungsgleiche gültige volle Stunden.
- Differenzen lokal minus Cloud, relativ nur bei positiver Cloud-Vergleichsbasis.
  Plausibilitätstoleranz: maximal 0,05 kWh oder 5 % der gemeinsamen Cloud-Energie.
- Kostenvergleich für Hausverbrauch und Netzbezug auf denselben Stunden und
  denselben gespeicherten Tarifen, daneben Berechnung mit ergänzten Lücken.
- Vergleichsdiagramm für Netzbezug, Hausverbrauch, Erzeugung oder Einspeisung;
  Cursor, Zoom bis 128×, Schieberegler und Zeitnavigation.
- Stundentabelle in Seiten zu 100 Einträgen; unvollständige lokale Werte bleiben
  sichtbar, werden aber nicht als gültige gemeinsame Messung verglichen.

Übereinstimmung bestätigt die Plausibilität, nicht die absolute Messgenauigkeit.
Teilintervalle, unbekannte Erfassungslücken und fehlende Tarife begrenzen die
Aussage. Ergänzte Anteile sind auch in der Kosten-Zeitraumauswertung und den
Stundenkarten gekennzeichnet; die vorhandenen Grün/Gelb/Orange/Rot-Preisfarben
bleiben unabhängig von den Blau/Violett-Quellenfarben erhalten.

## Speicherung, Transport, Wartung

Additive SQLite-Tabellen:
`solaredge_cloud_energy` (Site-ID, Intervall, Messgröße, kWh, Abrufzeit),
`solaredge_cloud_state` (Cache/Limit/Status ohne Schlüssel) und
`local_energy_coverage`. Cloud-Werte sind nach Site-ID getrennt. Wiederholte
Abrufe sind idempotent; ein vollständiger Antwortbereich wird transaktional
ersetzt. Bestehende SQLite-Backups enthalten auch die neuen Tabellen.

`history/dashboard` akzeptiert zusätzlich:

- `action: solar-status`: öffentlicher Zustand.
- `action: solar-compare`, `from`, `to`, `requestId`: Nachladen und Vergleich.
- `action: solar-sync`: gleiche serverseitige Auswertung für externe Flow-Anbindung.

Antwort: `history/solar/result`, mit erhaltener `socketid` und `requestId`.
Bereichsformate und maximal 366 Tage entsprechen der Zeitraumabfrage.
`history/range/result.metrics.*.sources` nennt lokale und Cloud-Energie sowie
jeweilige Intervallabdeckung. `cloud` enthält den öffentlichen Verbindungszustand.

Dateien: `nodes/solaredge-cloud.cjs`, History-Knoten/Schema, `nodes/energy-range.cjs`,
`solaredge-comparison.html`, Kosten-Template. Tests verwenden simulierte Antworten
und temporäre Datenbanken; keine Hardware-/Cloud-Zugriffe oder Live-DB-Änderungen.

Installation: `npm run nodes:install` installiert den neuen Cloud-Kern und alle
aktualisierten Laufzeitdateien. `package.json` gehört zum ausgelieferten Projekt.
Dann geprüfte Flows laden / Node-RED neu starten.

Herstellerreferenz: [SolarEdge Monitoring API, März 2026](https://knowledge-center.solaredge.com/sites/kc/files/se_monitoring_api.pdf).
