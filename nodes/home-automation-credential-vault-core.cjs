'use strict';

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

// Abschnitt 1: Konfiguration und Grundwerte
// Diese Konstanten definieren das Dateiformat, die Schlüsselgröße und die
// Parameter der Schlüsselableitung. Die Werte sind bewusst fest, damit der
// Tresor über verschiedene Läufe hinweg konsistent verschlüsselt bleibt.
const FORMAT_VERSION = 1;
const KEY_BYTES = 32;
const SCRYPT = Object.freeze({ N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

// Abschnitt 2: Hilfsfunktionen für Base64 und Identitäten
// Diese kleinen Funktionen standardisieren den Umgang mit Binärdaten sowie mit
// eindeutigen Bezeichnern. Dadurch bleibt der Code für Verschlüsselung und
// Datensatz-Handling konsistent lesbar.
function b64(value) { return Buffer.from(value).toString("base64"); }
function unb64(value) { return Buffer.from(String(value || ""), "base64"); }
function idFor(record) { return String(record.id || record.ip || "").trim(); }

// Abschnitt 3: Validierung privater IPv4-Adressen
// Nur Adressen aus privaten Heim- und Intranet-Bereichen sind für diesen Tresor
// zulässig. Damit werden versehentliche Verbindungen zu öffentlichen Netzen
// verhindert und die Zugriffsgrenzen bleiben sauber.
function privateIpv4(value) {
  const parts = String(value || "").trim().split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

// Abschnitt 4: Sicherheitsprüfung von Passwörtern
// Passwörter werden bewusst mit einer Mindestlänge validiert, damit ein zu
// kurzes Secret nicht versehentlich den Tresor schwächen kann.
function validateSecret(value, label, minimum = 10) {
  if (typeof value !== "string" || value.length < minimum) {
    throw new Error(`${label} muss mindestens ${minimum} Zeichen lang sein`);
  }
}

// Abschnitt 5: Schlüsselableitung und Verschlüsselung
// Der Master-Key wird aus dem Geheimnis und einem Salt mit scrypt abgeleitet.
// Danach werden Daten mit AES-256-GCM verschlüsselt und zusätzlich mit einem
// Zweck-Tag versehen, damit dieselben Schlüssel nicht für verschiedene Kontexten
// missbraucht werden.
function deriveKey(secret, salt) {
  return crypto.scryptSync(secret, salt, KEY_BYTES, SCRYPT);
}

function encrypt(key, value, associatedData) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(associatedData));
  const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
  return { iv: b64(iv), tag: b64(cipher.getAuthTag()), ciphertext: b64(ciphertext) };
}

function decrypt(key, envelope, associatedData) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, unb64(envelope.iv));
  decipher.setAAD(Buffer.from(associatedData));
  decipher.setAuthTag(unb64(envelope.tag));
  return Buffer.concat([decipher.update(unb64(envelope.ciphertext)), decipher.final()]);
}

function wrapDataKey(dataKey, secret, purpose) {
  const salt = crypto.randomBytes(16);
  const key = deriveKey(secret, salt);
  try {
    return { salt: b64(salt), ...encrypt(key, dataKey, `home-automation-vault:${purpose}:v1`) };
  } finally {
    key.fill(0);
  }
}

function unwrapDataKey(wrapper, secret, purpose) {
  const key = deriveKey(secret, unb64(wrapper.salt));
  try {
    return decrypt(key, wrapper, `home-automation-vault:${purpose}:v1`);
  } finally {
    key.fill(0);
  }
}

// Abschnitt 6: Normalisierung von Einträgen
// Ein Datensatz wird vor dem Speichern auf ein konsistentes Format gebracht.
// Dabei werden IP, Nutzer und Passwort geprüft und bei bestehenden Einträgen
// vorhandene Werte für leere Felder beibehalten. So bleibt das Update-Verhalten
// nachvollziehbar, ohne dass alte Daten verloren gehen.
function normalizeRecord(record, previous = null) {
  const ip = String(record?.ip || "").trim();
  if (!privateIpv4(ip)) throw new Error("Nur private IPv4-Adressen sind erlaubt");
  const user = String(record?.user || "").trim();
  if (!user || user.length > 64) throw new Error("SSH-Benutzer fehlt oder ist zu lang");
  const password = typeof record?.password === "string" && record.password.length
    ? record.password
    : previous?.password;
  if (!password) throw new Error("SSH-Passwort fehlt");
  return {
    id: ip,
    name: String(record?.name || previous?.name || ip).trim().slice(0, 80),
    ip,
    user,
    password,
    updatedAt: new Date().toISOString(),
  };
}

// Abschnitt 7: Dateisystem und sichere Speicherung
// Das JSON-File wird atomar geschrieben, damit ein unvollständiger Schreibvorgang
// den Tresor nicht beschädigt. Der Schlüssel selbst wird ebenfalls atomar in einer
// separaten Datei abgelegt und mit restriktiven Dateirechten geschützt.
function atomicWriteJson(filePath, value) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  fs.renameSync(temporary, filePath);
  fs.chmodSync(filePath, 0o600);
}

// Betriebsschlüssel für den Tresor: Bei erstmaliger Verwendung wird ein zufälliger
// 32-Byte-Schlüssel erzeugt und mit strengen Dateirechten auf der Festplatte
// abgelegt. Danach wird derselbe Schlüssel wiederverwendet.
function machineKey(filePath) {
  const keyPath = `${filePath}.key`;
  if (fs.existsSync(keyPath)) {
    const key = fs.readFileSync(keyPath);
    if (key.length !== KEY_BYTES) throw new Error("Betriebsschlüssel ist ungültig");
    fs.chmodSync(keyPath, 0o600);
    return key;
  }
  const key = crypto.randomBytes(KEY_BYTES);
  const directory = path.dirname(keyPath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = `${keyPath}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  fs.writeFileSync(temporary, key, { mode: 0o600, flag: "wx" });
  fs.renameSync(temporary, keyPath);
  fs.chmodSync(keyPath, 0o600);
  return key;
}

// Abschnitt 8: SSH-Expect-Skript für Systemprobe
// Dieses Skript verbindet sich per SSH mit einem Zielsystem, loggt sich mit dem
// gespeicherten Passwort ein und liest dabei wichtige Temperatur-, Speicher- und
// Laufzeitdaten aus. Die Ausgabe wird in klaren Schlüssel-Wert-Formaten geparst.
const expectScript = String.raw`log_user 0
set timeout 12
spawn ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password,keyboard-interactive -o PubkeyAuthentication=no $env(SSH_USER)@$env(SSH_IP) {printf "HOST="; hostname; printf "TEMP="; (vcgencmd measure_temp 2>/dev/null || cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null); printf "MEM="; free -m | awk '/Mem:/ {printf "%s/%s", $3, $2}'; printf "DISK="; df -Pm / | awk 'NR==2 {printf "%s/%s", $3, $2}'; printf "UPTIME="; cut -d. -f1 /proc/uptime; printf "LOAD="; cut -d" " -f1 /proc/loadavg}
expect {
  -re {(?i)password:} { send -- "$env(SSH_PASSWORD)\r"; exp_continue }
  eof { puts -nonewline $expect_out(buffer) }
}`;

// Abschnitt 9: Live-Probe eines einzelnen Systems
// Die SSH-Abfrage liefert Rohdaten, die in saubere Werte wie Hostname,
// Temperatur und Speicherauslastung umgewandelt werden. Bei Fehlern wird der
// Eintrag trotzdem als offline markiert, damit das System sauber fortgesetzt
// werden kann.
function probe(record, spawnImpl = spawn) {
  return new Promise((resolve) => {
    const child = spawnImpl("/usr/bin/expect", ["-c", expectScript], {
      env: { ...process.env, SSH_USER: record.user, SSH_IP: record.ip, SSH_PASSWORD: record.password },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let errorOutput = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { errorOutput += chunk; });
    child.on("error", (error) => resolve({ ip: record.ip, online: false, error: error.message }));
    child.on("close", (code) => {
      const value = (key) => (output.match(new RegExp(`${key}=([^\\r\\n]+)`)) || [])[1]?.trim() || null;
      const temperature = value("TEMP")?.match(/(-?\d+(?:\.\d+)?)/);
      const memory = value("MEM")?.match(/(\d+)\/(\d+)/);
      const disk = value("DISK")?.match(/(\d+)\/(\d+)/);
      const online = code === 0 && Boolean(value("HOST"));
      resolve({
        ip: record.ip,
        online,
        hostname: value("HOST"),
        temperatureC: temperature ? Number(temperature[1]) : null,
        memoryUsedPercent: memory ? (Number(memory[1]) / Number(memory[2])) * 100 : null,
        diskUsedPercent: disk ? (Number(disk[1]) / Number(disk[2])) * 100 : null,
        uptimeSeconds: Number(value("UPTIME")) || null,
        loadAverage: Number(value("LOAD")) || null,
        observedAt: new Date().toISOString(),
        error: online ? null : (errorOutput.replace(/\s+/g, " ").trim().slice(0, 240) || `SSH-Abfrage fehlgeschlagen (Code ${code})`),
      });
    });
  });
}

// Abschnitt 10: Klasse für den verschlüsselten Tresor
// Der Tresor kapselt alle Zustände: Dateien, Schlüssel, Sperrzeiten und
// Datensätze. Dadurch bleibt der gesamte Zugriff auf vertrauliche SSH-Daten an
// einem zentralen Ort und kann konsistent geschützt werden.
class CredentialVault {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.autoLockMs = Math.max(60_000, Number(options.autoLockMs || 10 * 60_000));
    this.now = options.now || Date.now;
    this.spawn = options.spawn || spawn;
    this.dataKey = null;
    this.records = null;
    this.unlockedUntil = 0;
    this.failures = 0;
    this.blockedUntil = 0;
  }

  // Lesen des Tresor-Encapsulationsobjekts aus der JSON-Datei.
  readEnvelope() {
    const envelope = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    if (envelope.version !== FORMAT_VERSION || !envelope.master || !envelope.data) throw new Error("Tresorformat wird nicht unterstützt");
    return envelope;
  }

  // Statusabfrage für UI und Debugging: zeigt an, ob der Tresor aktiv, gesperrt
  // und mit Wiederherstellung konfiguriert ist.
  status() {
    this.autoLock();
    let question = null;
    if (fs.existsSync(this.filePath)) {
      try { question = this.readEnvelope().recovery?.question || null; } catch { question = null; }
    }
    return {
      initialized: fs.existsSync(this.filePath),
      locked: !this.dataKey,
      recoveryConfigured: Boolean(question),
      recoveryQuestion: question,
      entryCount: this.records ? this.records.length : null,
      unlockedUntil: this.dataKey ? new Date(this.unlockedUntil).toISOString() : null,
      retryAfterSeconds: Math.max(0, Math.ceil((this.blockedUntil - this.now()) / 1000)),
    };
  }

  // Automatisches Sperren nach Ablauf der Session-Zeit.
  autoLock() {
    if (this.dataKey && this.now() >= this.unlockedUntil) this.lock();
  }

  // Session-Zeit verlängern: Nach jeder erfolgreichen Nutzung wird der Lockout-Timeout
  // wieder auf das aktuelle Intervall gesetzt.
  touch() { this.unlockedUntil = this.now() + this.autoLockMs; }

  // Sperren des Tresors: Schlüssel aus dem Speicher entfernen und Datensätze
  // verwerfen, damit vertrauliche Werte nicht länger im RAM verbleiben.
  lock() {
    if (this.dataKey) this.dataKey.fill(0);
    this.dataKey = null;
    this.records = null;
    this.unlockedUntil = 0;
  }

  // Brute-Force-Schutz: nach mehreren Fehlversuchen wird der Zugriff kurz blockiert.
  checkRateLimit() {
    if (this.now() < this.blockedUntil) throw new Error("Zu viele Fehlversuche; bitte später erneut versuchen");
  }

  // Fehlversuch protokollieren: Nach mehreren falschen Versuchen wird der Zugriff
  // für kurze Zeit gesperrt, damit brute-force Angriffe erschwert werden.
  authFailed() {
    this.failures += 1;
    if (this.failures >= 5) {
      this.blockedUntil = this.now() + 30_000;
      this.failures = 0;
    }
  }

  // Erfolgreicher Login setzt den Fehlversuchs-Zähler zurück und hebt die
  // Sperre wieder auf.
  authSucceeded() { this.failures = 0; this.blockedUntil = 0; }

  // Entschlüsseln der Datensätze mit dem aktuellen Datenkey.
  decryptRecords(envelope, dataKey) {
    const plaintext = decrypt(dataKey, envelope.data, "home-automation-vault:data:v1");
    const parsed = JSON.parse(plaintext.toString("utf8"));
    plaintext.fill(0);
    if (!Array.isArray(parsed.records)) throw new Error("Tresorinhalt ist ungültig");
    return parsed.records;
  }

  // Erstinitialisierung des Tresors: Master-Key, Recovery-Key und Daten-Envelope
  // werden erzeugt und im lokalen JSON-Format abgesichert.
  initialize(masterPassword, question, recoveryAnswer) {
    if (fs.existsSync(this.filePath)) throw new Error("Tresor ist bereits eingerichtet");
    validateSecret(masterPassword, "Master-Passwort");
    validateSecret(recoveryAnswer, "Private Antwort", 12);
    if (!String(question || "").trim()) throw new Error("Private Sicherheitsfrage fehlt");
    const dataKey = crypto.randomBytes(KEY_BYTES);
    this.dataKey = dataKey;
    this.records = [];
    this.envelope = {
      version: FORMAT_VERSION,
      kdf: { name: "scrypt", N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p },
      cipher: "aes-256-gcm",
      master: wrapDataKey(dataKey, masterPassword, "master"),
      recovery: {
        question: String(question).trim().slice(0, 180),
        ...wrapDataKey(dataKey, recoveryAnswer, "recovery"),
      },
      machine: null,
      data: null,
    };
    const localKey = machineKey(this.filePath);
    try { this.envelope.machine = encrypt(localKey, dataKey, "home-automation-vault:machine:v1"); }
    finally { localKey.fill(0); }
    this.touch();
    this.persist();
    return this.status();
  }

  // Entsperren mit Master-Passwort. Dabei wird der Schlüssel wiederhergestellt,
  // die Datensätze entschlüsselt und der aktive Tresor in den gelockten Zustand
  // übernommen.
  unlock(masterPassword) {
    this.checkRateLimit();
    if (!fs.existsSync(this.filePath)) throw new Error("Tresor ist noch nicht eingerichtet");
    let key;
    try {
      const envelope = this.readEnvelope();
      key = unwrapDataKey(envelope.master, String(masterPassword || ""), "master");
      const records = this.decryptRecords(envelope, key);
      this.lock();
      this.dataKey = key;
      this.records = records;
      this.envelope = envelope;
      this.authSucceeded();
      this.touch();
      return this.status();
    } catch {
      if (key) key.fill(0);
      this.authFailed();
      throw new Error("Master-Passwort ist falsch");
    }
  }

  // Recovery-Pfad: Ein vertrauliches Wiederherstellungsgeheimnis kann das
  // Master-Passwort ersetzen, ohne die gespeicherten Datensätze zu verlieren.
  recover(recoveryAnswer, newMasterPassword) {
    this.checkRateLimit();
    validateSecret(newMasterPassword, "Neues Master-Passwort");
    let key;
    try {
      const envelope = this.readEnvelope();
      if (!envelope.recovery) throw new Error("Keine Wiederherstellung eingerichtet");
      key = unwrapDataKey(envelope.recovery, String(recoveryAnswer || ""), "recovery");
      const records = this.decryptRecords(envelope, key);
      envelope.master = wrapDataKey(key, newMasterPassword, "master");
      this.lock();
      this.dataKey = key;
      this.records = records;
      this.envelope = envelope;
      this.touch();
      this.persist();
      this.authSucceeded();
      return this.status();
    } catch (error) {
      if (key) key.fill(0);
      this.authFailed();
      if (error.message === "Keine Wiederherstellung eingerichtet") throw error;
      throw new Error("Private Antwort ist falsch");
    }
  }

  // Vor jeder Operation wird geprüft, ob der Tresor noch aktiv ist.
  requireUnlocked() {
    this.autoLock();
    if (!this.dataKey || !this.records) throw new Error("Tresor ist gesperrt");
    this.touch();
  }

  // Speichern der aktiven Datensätze im verschlüsselten Format. Dabei wird nur
  // das vollständige, aktualisierte Record-Set atomar auf die Datei geschrieben.
  persist() {
    this.requireUnlocked();
    const plaintext = Buffer.from(JSON.stringify({ records: this.records }), "utf8");
    try { this.envelope.data = encrypt(this.dataKey, plaintext, "home-automation-vault:data:v1"); }
    finally { plaintext.fill(0); }
    atomicWriteJson(this.filePath, this.envelope);
  }

  // Lesen aller Einträge ohne Passwörter im Klartext.
  list() {
    this.requireUnlocked();
    return this.records.map(({ password, ...record }) => ({ ...record, hasPassword: Boolean(password) }));
  }

  // Ein einzelner Eintrag kann genau identifiziert und im Klartext zurückgegeben
  // werden, solange der Tresor entsperrt ist. Das Passwort wird dabei nicht
  // verborgen, sondern ausdrücklich mit dem vollständigen Record mitgeliefert.
  reveal(id) {
    this.requireUnlocked();
    const record = this.records.find((entry) => entry.id === String(id));
    if (!record) throw new Error("System wurde nicht gefunden");
    return { ...record };
  }

  // Speichern oder Aktualisieren eines Systems: Validierung, Duplikatprüfung
  // und Sortierung nach IP sorgen für einen konsistenten Tresor-Zustand.
  upsert(record) {
    this.requireUnlocked();
    const requestedId = idFor(record);
    const index = this.records.findIndex((entry) => entry.id === requestedId || entry.ip === String(record?.ip || ""));
    const normalized = normalizeRecord(record, index >= 0 ? this.records[index] : null);
    const duplicate = this.records.findIndex((entry, candidate) => candidate !== index && entry.ip === normalized.ip);
    if (duplicate >= 0) throw new Error("Diese IP-Adresse ist bereits vorhanden");
    if (index >= 0) this.records[index] = normalized;
    else this.records.push(normalized);
    this.records.sort((left, right) => left.ip.localeCompare(right.ip, undefined, { numeric: true }));
    this.persist();
    return this.list();
  }

  // Ein einzelnes System wird aus dem Tresor entfernt, nachdem es eindeutig
  // identifiziert wurde und der aktive Zustand noch entsperrt ist.
  remove(id) {
    this.requireUnlocked();
    const before = this.records.length;
    this.records = this.records.filter((entry) => entry.id !== String(id));
    if (this.records.length === before) throw new Error("System wurde nicht gefunden");
    this.persist();
    return this.list();
  }

  // Master-Passwort und Recovery-Informationen können später aktualisiert werden,
  // ohne die vorhandenen Datensätze neu zu erzeugen.
  changeMaster(newMasterPassword) {
    this.requireUnlocked();
    validateSecret(newMasterPassword, "Neues Master-Passwort");
    this.envelope.master = wrapDataKey(this.dataKey, newMasterPassword, "master");
    this.persist();
    return this.status();
  }

  // Recovery-Informationen werden hier aktualisiert, damit die Wiederherstellung
  // auch nach einem Passwortwechsel noch konsistent und sicher bleibt.
  changeRecovery(question, recoveryAnswer) {
    this.requireUnlocked();
    validateSecret(recoveryAnswer, "Private Antwort", 12);
    if (!String(question || "").trim()) throw new Error("Private Sicherheitsfrage fehlt");
    this.envelope.recovery = {
      question: String(question).trim().slice(0, 180),
      ...wrapDataKey(this.dataKey, recoveryAnswer, "recovery"),
    };
    this.persist();
    return this.status();
  }

  // Massenprüfung aller registrierten Systeme per SSH. Dabei werden entweder die
  // bereits geladenen Einträge genutzt oder der Tresor aus dem Dateisystem
  // entschlüsselt und danach wieder sauber bereinigt.
  async probeAll() {
    let records;
    let temporaryKey = null;
    if (this.dataKey && this.records) {
      this.touch();
      records = this.records.map((record) => ({ ...record }));
    } else {
      const envelope = this.readEnvelope();
      if (!envelope.machine) throw new Error("Betriebsschlüssel ist nicht eingerichtet");
      const localKey = machineKey(this.filePath);
      try { temporaryKey = decrypt(localKey, envelope.machine, "home-automation-vault:machine:v1"); }
      finally { localKey.fill(0); }
      records = this.decryptRecords(envelope, temporaryKey).map((record) => ({ ...record }));
    }
    try {
      const devices = await Promise.all(records.map((record) => probe(record, this.spawn)));
      return { source: "encrypted-vault", observedAt: new Date().toISOString(), devices };
    } finally {
      if (temporaryKey) temporaryKey.fill(0);
      for (const record of records) record.password = "";
    }
  }
}

// Abschnitt 11: Standardpfad und Export
// Der Standardlokationspfad liegt im Node-RED-Userdir, damit der Tresor vom
// Projekt konsistent verwendet und an einem definierten Ort verwaltet wird.
function defaultVaultPath(userDir = path.join(os.homedir(), ".node-red")) {
  return path.join(userDir, "system-credentials.vault.json");
}

module.exports = { CredentialVault, defaultVaultPath, privateIpv4 };
