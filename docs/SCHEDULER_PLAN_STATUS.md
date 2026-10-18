# Zeitplananzeige 0.11.0

Jeder Plan zeigt Grün (bereit), Grau (deaktiviert, pausiert, abgeschlossen oder durch Priorität übersteuert), Rot (fehlender Empfänger, Zeitgeber, Termin oder fehlgeschlagener Befehl).
Die globale Ampel bleibt einschließlich Gelb unverändert.

Countdown: nächste vom Zeitgeber gemeldete zukünftige Ausführung; bei Zeitfenstern nächste Start-/Endgrenze. Browser aktualisiert jede Sekunde ohne Befehlsversand. Bei 60 Sekunden ohne Status wird die Plananzeige rot. Ein abgelaufener Countdown zeigt „Rückmeldung ausstehend“, keine behauptete Ausführung.

Zeitfenster: Prüfung alle 15 Sekunden durch den vorhandenen Watchdog. Befehle nur bei geänderter Vorgabe bzw. Wiederanmeldung. Intervallplan: Befehl je konfiguriertem Intervall. Keine neue zyklische Wiederholung durch die Anzeige.

Vorgabe und letzter Versand mit Ziel und Zeitpunkt sind getrennt. Live-Anzeigen werden nach Neustart neu ermittelt; Pläne, Pausen und Einstellungen bleiben im bestehenden Scheduler-Speicher erhalten. Grün ist keine elektrische Messung. Pro Plan wird der jüngste Versand gezeigt, bei mehreren Empfängern ist dies kein vollständiges Versandprotokoll.

Wartung: nodes/scheduler-core.cjs → planStatus; Template schedulers-dashboard.html → planHealth/countdown und CSS sc-lamp. Bestehende Link-Verbindungen unverändert. Ein Planname wie Kinderzimmer ersetzt nicht die Ziel-ID kitchen-light.
