# Projektanweisungen

Vor jeder Änderung oder Generierung im Projekt muss `docs/DEVELOPMENT.md`
vollständig gelesen und befolgt werden.

Vor jedem Commit, Patch oder anderen ausgelieferten Änderungspaket muss die
Version in `package.json` gemäß `docs/DEVELOPMENT.md` erhöht werden. Jedes
Installationspaket muss die aktualisierte `package.json` mit installieren.

## Deployment und Neustart

Nach beauftragten Projektänderungen die erforderlichen Tests und Flow-Prüfungen
abschließen, den geprüften Stand in die aktive Node-RED-Instanz deployen und
Node-RED anschließend neu starten. Deployment und Neustart gehören zur Aufgabe
und benötigen keine erneute Rückfrage, sofern der Benutzer nichts anderes vorgibt.

Auf diesem Home-PC ist die Zielinstanz Port `1880` mit dem Benutzerordner
`/home/georgshomepc/.node-red-instances/1880`. Sie läuft als systemd-Benutzerdienst
`node-red.service`; Neustart mit `systemctl --user restart node-red.service`.
Vor dem Deployen laufende Flows mit dem Projekt abgleichen und konkurrierende
Änderungen erhalten. Nach dem Neustart Dienststatus, Editor, Dashboard und die
aktive Projektversion prüfen. Erfolg erst nach diesen Prüfungen melden.

Der Benutzerordner kann von `~/.node-red` abweichen. Bibliotheken und eigene
Knoten nur gezielt für die aktive Instanz installieren; bestehende Verknüpfungen
und Tresordateien erhalten. Auf anderen Rechnern deren tatsächliche Instanz und
Dienstkonfiguration verwenden.
