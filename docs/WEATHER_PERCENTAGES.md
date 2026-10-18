# Wetterauswertung 0.10.2

Sonnenscheindauer ist ein Zeitanteil, Wolkenbedeckung ein Flächenanteil.
Beide ergänzen sich nicht zu 100 %. Auch hohe Wolken können Sonnenlicht durchlassen.
Open-Meteo sunshine_duration: Sekunden in der vorangegangenen Stunde,
Schwelle direkte Normalstrahlung >120 W/m². cloud_cover: Momentanwert am Zeitstempel.
Quelle: https://open-meteo.com/en/docs
Erklärung des Providers: https://github.com/open-meteo/open-meteo/issues/467

Bisher: Sonnensekunden / Tageslichtsekunden im Intervall. Bei nur 20 Minuten
Tageslicht ergaben 20 Minuten Sonne 100 %. Das war als Anteil einer ganzen Stunde
missverständlich. Jetzt: begrenzte Sonnensekunden / 3600 * 100 = 33 %.
Die Tageslichtbegrenzung und Nacht=0 bleiben bestehen. Fehlende, negative oder
über 3600 liegende Sonnendauern führen in den vorhandenen Fehler-/Fallbackpfad.
Keine Schätzung 100 minus Wolken; Wolken- und Regenwerte werden nicht verändert.

Dashboard zeigt Minuten plus Prozent, Wolken/Temperatur am Stundenende und das
aktuelle Stundenintervall statt „nächste Stunde“. Um 17:35 heißt es 17:00–18:00.
Die erste Zeile ist keine Prognose für die nächsten 60 Minuten ab jetzt.
Der Mittelwert bezieht sich auf die tatsächlich angezeigten Stundenintervalle,
inklusive Nacht und berechnet aus Sekunden vor Rundung. Sonnenwerte sind
Modellwerte, auch für die vorhergehende Stunde. Keine PV-Leistungsprognose.

Bestehende Automationsfelder (auch der historische Schreibfehler Expectet...)
bleiben erhalten und verwenden nun Prozent der vollen Stunde. Dadurch kann die
10-%-Schwelle in Dämmerungsstunden anders entscheiden. SunPowerExpected bleibt
aus Kompatibilität erhalten, ist weiterhin nur ein Sonnenscheinindikator.
Neue Metadaten: SunshinePercentageBasis, CloudCoverTimeBasis,
CurrentForecastIntervalLabel, ForecastIntervalCount; Zeilen enthalten zusätzlich
SunshineSeconds und SunshineMinutes.

Wartung: Function weather_parse (Wetterdaten prüfen und Payload aufbauen),
Template im Flow WETTER. Berechnung in sunshineSeconds/sunshinePercent.
Tests: test/wetterdaten-prufen-und-payload-aufbauen.test.mjs.
Diese Korrektur betrifft Prozentbasis und Beschriftung; sie ersetzt weder das
Wettermodell noch die vorhandene Zeitzonenverarbeitung.
