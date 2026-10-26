# Wartung: System-Zugangstresor

## Zweck und Grenzen

Der SYSTEM-Bereich verwaltet SSH-Zugangsdaten für lokale Raspberry Pis und andere
Linux-Systeme. Er verändert **nicht** selbstständig das Passwort auf einem
Teilnehmer. Eine Änderung im Dashboard aktualisiert ausschließlich den lokal
gespeicherten Zugang.

Die Tresordatei liegt unter
`~/.node-red/system-credentials.vault.json`, außerhalb von `flows.json` und Git.
Sie darf gesichert, aber nicht manuell bearbeitet werden.

## Aufteilung

| Bestandteil | Aufgabe |
|---|---|
| `nodes/home-automation-credential-vault-core.cjs` | Verschlüsselung, Datensätze, Sperrlogik und SSH-Abfrage |
| `nodes/home-automation-credential-vault.js` | Übersetzt Node-RED-Nachrichten in klar definierte Tresorbefehle |
| `nodes/home-automation-credential-vault.html` | Konfiguration und Hilfe des eigenen Node-RED-Knotens |
| `flow-src/flows/system--system_dashboard_flow/templates/technisches-hausnetz.html` | Technische Geräte- und Messwertanzeige |
| `flow-src/flows/system--system_dashboard_flow/templates/zugangsdaten-tresor.html` | Bedienoberfläche des Tresors, keine Verschlüsselungslogik |
| `test/system-credential-vault.test.mjs` | Ausführbare Spezifikation der Sicherheits- und Wartungsregeln |

## Zustände

| Zustand | Bedeutung | Erlaubte Aktionen |
|---|---|---|
| Nicht eingerichtet | Keine Tresordatei vorhanden | Master-Passwort und Sicherheitsfrage festlegen |
| Gesperrt | Bedien-Schlüssel ist nicht im Arbeitsspeicher | Entsperren, Wiederherstellung; automatische SSH-Messung bleibt aktiv |
| Entsperrt | Bedien-Schlüssel liegt zeitlich begrenzt im RAM | Anzeigen, Anlegen, Bearbeiten, Löschen, SSH-Livewerte |
| Wartezeit | Fünf falsche Versuche | Nach 30 Sekunden erneut versuchen |

Nach spätestens fünf Minuten ohne Tresorzugriff oder beim Stoppen des Node-RED-Knotens wird
der Schlüssel aus dem Arbeitsspeicher gelöscht.

Die automatische SSH-Abfrage bleibt auch im gesperrten Zustand möglich. Sie
verwendet den lokalen Betriebsschlüssel
`~/.node-red/system-credentials.vault.json.key` mit Dateirechten `0600`. Dieser
Schlüssel wird niemals an das Dashboard ausgegeben. Anzeigen und Bearbeiten der
Passwörter bleiben ausschließlich mit Master-Passwort möglich.

## Nachrichtenschnittstelle

Alle Bedienbefehle werden über `msg.topic` übertragen. Geheimnisse dürfen nie in
einem Debug-Knoten protokolliert werden.

| `msg.topic` | Benötigte Nutzdaten | Ergebnis |
|---|---|---|
| `system/vault/status` | keine | öffentlicher Zustand |
| `system/vault/setup` | `masterPassword`, `recoveryQuestion`, `recoveryAnswer` | neuer leerer Tresor |
| `system/vault/unlock` | `masterPassword` | entsperrter Zustand |
| `system/vault/lock` | keine | gesperrter Zustand |
| `system/vault/recover` | `recoveryAnswer`, `newMasterPassword` | neues Master-Passwort |
| `system/vault/save` | `record: {id?, name, ip, user, password?}` | aktualisierte Liste |
| `system/vault/reveal-list` | `masterPassword`, Dashboard-Client | maskierte Zugangsliste |
| `system/vault/reveal` | `id` | genau ein Zugang, 15 Sekunden im Dashboard sichtbar |
| `system/vault/delete` | `id` | aktualisierte Liste |
| `system/vault/change-master` | `newMasterPassword` | neu verschlüsselter Schlüsselumschlag |
| `system/vault/change-recovery` | `recoveryQuestion`, `recoveryAnswer` | neue Wiederherstellung |
| `system/vault/probe` | keine | SSH-Livewerte auf Ausgang 2 |

## Verschlüsselungsformat

- zufälliger 256-Bit-Datenschlüssel;
- AES-256-GCM für die Zugangsdaten;
- `scrypt` für Master-Passwort und private Antwort;
- getrennte Schlüsselumschläge für Master-Passwort und Wiederherstellung;
- separater lokaler Schlüsselumschlag für den unbeaufsichtigten Messbetrieb;
- zufällige Salts und Nonces bei jeder Änderung;
- atomisches Schreiben mit Dateirechten `0600`.

Die Sicherheitsfrage steht lesbar in der Datei, die Antwort nicht. Eine private
Antwort muss mindestens zwölf Zeichen lang und schwer zu erraten sein. Wer weder
Master-Passwort noch Antwort kennt, kann den Tresor absichtlich nicht entschlüsseln.

### Schutzgrenze

Der Master-Schutz verhindert Anzeigen und Ändern über das Dashboard. Ein
Angreifer mit Root-Zugriff auf das Node-RED-Gerät kann Betriebsschlüssel und
Tresor gemeinsam kopieren. Diese Einschränkung ist notwendig, damit Node-RED
nach einem Neustart ohne menschliche Passworteingabe Messwerte abrufen kann. Für
höheren Schutz wäre ein externer Hardware-Schlüsselspeicher erforderlich.

## System hinzufügen oder erweitern

Neue Systeme werden im Dashboard angelegt. Der Kern akzeptiert die privaten
IPv4-Bereiche `10.0.0.0/8`, `172.16.0.0/12` und `192.168.0.0/16`. Dadurch sind
auch andere Heimnetzsegmente wie `192.168.2.x` möglich.

Weitere Systemwerte werden ausschließlich in der Funktion `probe()` des Kerns
ergänzt. Dabei gelten drei Regeln:

1. Kein Passwort in Kommandozeile, Flow, Log oder Fehlertext.
2. Ein nicht unterstützter Messwert ergibt `null`, nicht einen erfundenen Wert.
3. Jede neue Auswertung erhält mindestens einen Unit-Test.

## Prüfung und Installation

```bash
npm test
npm run flow:import
npm run flow:check
npm run flow:roundtrip
npm run flow:deploy
```

`flow:deploy` installiert den eigenen Tresorknoten nach `~/.node-red/nodes/` und
startet die validierte Flow-Datei. Das Paket `expect` muss auf dem Node-RED-Gerät
installiert sein.

Verwendet Node-RED einen anderen Benutzerordner, kann er bei der Installation
explizit angegeben werden: `NODE_RED_USER_DIR=/pfad npm run nodes:install`.

## Betriebssicherheit

Der Master-Schutz des Tresors ersetzt nicht den Schutz von Node-RED. Editor und
Dashboard sollten nur im vertrauenswürdigen Heimnetz erreichbar und zusätzlich
mit Node-RED-Anmeldung beziehungsweise HTTPS geschützt sein. Die offizielle
Node-RED-Sicherheitskonfiguration ist unter
<https://nodered.org/docs/user-guide/runtime/securing-node-red> beschrieben.


## Zugangsliste und Sitzungsregeln · v0.20.3

„Zugangsliste anzeigen“ fragt das bestehende Master-Passwort erneut ab und zeigt
Name, IP und SSH-Benutzer der gespeicherten Systeme. Passwörter bleiben maskiert
und werden nur einzeln auf ausdrücklichen Klick für 15 Sekunden angezeigt.
Es gibt kein fest eingebautes Standardpasswort. Ein leerer Tresor wird als leer
angezeigt; frühere Chat-Inhalte werden nicht rekonstruiert.

Jeder Dashboard-Client hat einen getrennten Tresorschlüssel im Arbeitsspeicher.
Entsperren gilt ausschließlich für diesen Client. Änderungen sperren andere
Sitzungen, um veraltete Schreibstände zu verhindern. Antworten sind an socketid
gebunden. Bedienbefehle ohne Client-ID werden abgewiesen. Die automatische
SSH-Messung verwendet weiterhin ihren separaten Betriebsschlüssel.

Nach spätestens fünf Minuten Inaktivität beziehungsweise zehn Minuten absoluter
Sitzungsdauer wird serverseitig gesperrt. Statusabfragen verlängern die Frist
nicht. Fehlversuche werden auch über wechselnde Browser-Sitzungen gezählt:
fünf falsche Anmeldungen führen zu 30 Sekunden Wartezeit. Sicherheitsereignisse
werden ohne Passwörter oder Sitzungskennungen protokolliert.

Anfragen mit Geheimnissen sind nur über direktes TLS oder vom lokalen Rechner
über Loopback zulässig. Die Transportprüfung verwendet tatsächliche
Socket-Adressen, keine vom Client gesetzten Forwarded-Header. Remote-Aufrufe
über unverschlüsseltes HTTP werden serverseitig und im Dashboard abgewiesen.
Für Fernzugriff muss Node-RED mit HTTPS konfiguriert werden; TLS-Terminierung
an einem vorgeschalteten Proxy ist hier nicht automatisch freigegeben.
Die Rechte des Betriebsschlüssels und die Verschlüsselung ersetzen diesen
Transportschutz nicht.

Der Dashboard-Bereich reserviert zwölf Rasterzeilen und hat einen eigenen
Scrollbereich für längere Formulare. Die Darstellung auf kleinen Displays
bleibt einspaltig; Eingaben und Schaltflächen werden nicht abgeschnitten.

Die Umsetzung orientiert sich an den OWASP-Empfehlungen für Sitzungsverwaltung
und Geheimnisverwaltung. Dies ist keine Zertifizierung oder vollständige
ASVS-Konformitätsprüfung des gesamten Node-RED-Systems.

- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html

## Bekannte Systeme übernehmen

Nach dem Entsperren übernimmt „Bekannte Systeme übernehmen“ die aktuellen
Hausgeräte `pieast`, `piwest`, `PIANTE_`, `PICENTER2` und `pientry` mit ihren
festen Hausnetzadressen. Das Passwort wird ausschließlich im dafür vorgesehenen
Passwortfeld eingegeben und verschlüsselt gespeichert; es ist weder fest im
Flow hinterlegt noch Teil der Geräte- oder Projektdaten. Vorhandene Einträge
werden dabei auf das bewusst eingegebene Standardpasswort aktualisiert.
