const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");
const fs = require("node:fs");

const HOUR = 3600000;
const ENTRY = "DetectorEntryRoom";
const EAST = "DetectorPiEast";
const WEST = "DetectorPiWest";
const { randomUUID } = require("node:crypto");
const eastInput = /^(\d{2})(\d{2})(\d{4})_(\d{2})h(\d{2})m(\d{2})s(\d{3})ms Device digital input\s+\(5\)\s+is: (True|False)\s*$/;
const dateTime = new Intl.DateTimeFormat("de-AT", {
  timeZone: "Europe/Vienna", dateStyle: "short", timeStyle: "medium"
});
const hourLabel = new Intl.DateTimeFormat("de-AT", {
  timeZone: "Europe/Vienna", hour: "2-digit", minute: "2-digit"
});

function readMotion(msg, received, detector) {
  const ip = detector === EAST ? "192.168.0.104" : "192.168.0.190";
  if (msg.ip !== ip || typeof msg.payload !== "string" || msg.payload.length > 1024) return;
  let e;
  try { e = JSON.parse(msg.payload); } catch { return; }
  if (!e || e.v !== 1 || e.detector !== detector || e.kind !== "motion" || e.state !== "Active") return;
  if (typeof e.boot !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(e.boot) ||
      !Number.isSafeInteger(e.seq) || e.seq < 1 || typeof e.ts !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(e.ts)) return;
  const time = Date.parse(e.ts);
  if (!Number.isFinite(time) || time > received + 30000) return;
  return { ...e, time };
}

// A motion event ends when the normally closed input returns to rest.
function detectCycle() {
  let last;
  let armed = false;
  return function change(state) {
    if (state === last) return false;
    const completed = armed && state === true;
    armed = last === true && state === false;
    last = state;
    return completed;
  };
}

function eastEvents(payload, now) {
  const events = [];
  const change = detectCycle();
  for (const line of payload.split("\n")) {
    const m = eastInput.exec(line);
    if (!m || !change(m[8] === "True")) continue;
    // The East log and the Home-PC both use Europe/Vienna local time.
    const time = new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6], +m[7]).getTime();
    if (Number.isFinite(time) && time <= now + 30000) {
      events.push({ boot: "east-log", seq: time, time });
    }
  }
  return events;
}

function westReader(recordInput) {
  let counter;
  let lastReceived = 0;
  let change = detectCycle();
  let session = randomUUID();
  return function readWest(msg, time) {
    if (msg.ip !== "192.168.0.105" || typeof msg.payload !== "string") return;
    const packet = /^(\d{1,15})_(\d{1,2})_(True|False)$/.exec(msg.payload.trim());
    if (!packet) return;
    const seq = Number(packet[1]);
    if (seq === counter) return;
    // Ignore delayed old datagrams. A reset counter or a long silence starts a new sequence.
    if (seq < counter && seq > 1 && time - lastReceived < 600000) return;
    lastReceived = time;
    if (seq !== counter + 1) {
      change = detectCycle();
      if (counter !== undefined && seq < counter) session = randomUUID();
    }
    counter = seq;
    recordInput(time, seq, Number(packet[2]), packet[3]);
    if (packet[2] === "5" && change(packet[3] === "True")) {
      return { boot: session, seq, time };
    }
  };
}

module.exports = function registerMotion(RED) {
  function MotionHistory(config) {
    RED.nodes.createNode(this, config);
    const detector = config.detector || ENTRY;
    let eastReadStatus;
    const file = path.resolve(RED.settings.userDir, config.databasePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const db = new DatabaseSync(file);
    db.exec(`PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS presence_event (
        detector TEXT NOT NULL, boot TEXT NOT NULL, seq INTEGER NOT NULL,
        event_ms INTEGER NOT NULL, received_ms INTEGER NOT NULL,
        PRIMARY KEY(detector, boot, seq)
      );
      CREATE INDEX IF NOT EXISTS presence_event_time ON presence_event(detector, event_ms);
      CREATE INDEX IF NOT EXISTS presence_event_received ON presence_event(detector, received_ms, seq);
      CREATE TABLE IF NOT EXISTS presence_broadcast_observation (
        id INTEGER PRIMARY KEY CHECK (id=1),
        started_ms INTEGER NOT NULL, ended_ms INTEGER NOT NULL, sender_rows TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS presence_input_latest (
        detector TEXT PRIMARY KEY, received_ms INTEGER NOT NULL, seq INTEGER NOT NULL,
        channel INTEGER NOT NULL, state TEXT NOT NULL
      );`);
    const observation = db.prepare("SELECT started_ms, ended_ms, sender_rows FROM presence_broadcast_observation WHERE id=1");
    let capture;
    const saveInput = db.prepare("INSERT OR REPLACE INTO presence_input_latest VALUES (?, ?, ?, ?, ?)");
    const inputLatest = db.prepare("SELECT * FROM presence_input_latest WHERE detector=?");
    const readWest = westReader((time, seq, channel, state) => saveInput.run(WEST, time, seq, channel, state));
    const lastEntryPacket = db.prepare("SELECT received_ms, seq FROM presence_event WHERE detector=? ORDER BY received_ms DESC, seq DESC LIMIT 1");
    const eastUdpLatest = db.prepare("SELECT received_ms, seq FROM presence_event WHERE detector=? AND boot <> 'east-log' ORDER BY received_ms DESC, seq DESC LIMIT 1");
    // Both transports report the closing edge of the same roughly three-second PIR pulse.
    // Prefer the sender's identifiable UDP event when its time matches a log edge within one second.
    const nearbyUdp = db.prepare("SELECT 1 FROM presence_event WHERE detector=? AND boot <> 'east-log' AND event_ms BETWEEN ? AND ? LIMIT 1");
    const removeMatchingLog = db.prepare("DELETE FROM presence_event WHERE detector=? AND boot='east-log' AND seq=(SELECT seq FROM presence_event WHERE detector=? AND boot='east-log' AND event_ms BETWEEN ? AND ? ORDER BY abs(event_ms-?) LIMIT 1)");
    function reception() {
      if (detector === EAST) {
        const row = eastUdpLatest.get(EAST);
        return { source: "192.168.0.104 · UDP 10001", detail: row
          ? dateTime.format(row.received_ms) + " · Bewegung (Active) · Nr. " + row.seq
          : "Noch kein bestätigtes UDP-Bewegungstelegramm", log: eastReadStatus || "Erster Abruf steht aus" };
      }
      if (detector === WEST) {
        const row = inputLatest.get(WEST);
        return { source: "192.168.0.105 · UDP 5020", detail: row
          ? dateTime.format(row.received_ms) + " · Eingang " + row.channel + " = " + row.state + " · Nr. " + row.seq
          : "Wartet auf ein Eingangstelegramm" };
      }
      const row = lastEntryPacket.get(ENTRY);
      return { source: "192.168.0.190 · UDP 10001", detail: row
        ? dateTime.format(row.received_ms) + " · Bewegung (Active) · Nr. " + row.seq
        : "Wartet auf ein Bewegungstelegramm" };
    }
    const insert = db.prepare("INSERT INTO presence_event VALUES (?, ?, ?, ?, ?) ON CONFLICT(detector,boot,seq) DO NOTHING");
    const latest = db.prepare("SELECT event_ms FROM presence_event WHERE detector=? ORDER BY event_ms DESC LIMIT 1");
    const counts = db.prepare(`SELECT event_ms / 3600000 AS hour, count(*) AS count
      FROM presence_event WHERE detector=? AND event_ms>=? AND event_ms<? GROUP BY hour`);
    this.on("input", (msg, send, done) => {
      try {
        const now = Date.now();
        if (msg.topic !== "presence/refresh" || msg.ip) {
          let events;
          if (detector === EAST && !msg.ip) {
            if (msg.topic !== "presence/east-log" || typeof msg.payload !== "string") return done();
            eastReadStatus = dateTime.format(now) + (msg.rc && msg.rc.code !== 0
              ? " · Abruf fehlgeschlagen" : " · Protokoll gelesen");
            events = eastEvents(msg.payload, now);
          } else {
            const event = detector === WEST ? readWest(msg, now) : readMotion(msg, now, detector);
            if (event && detector === EAST) event.boot = "east-udp:" + event.boot;
            events = event ? [event] : [];
          }
          if (!events.length) return done();
          let inserted = 0;
          db.exec("BEGIN");
          try {
            for (const event of events) {
              if (detector === EAST) {
                const low = event.time - 1000;
                const high = event.time + 1000;
                if (event.boot === "east-log") {
                  if (nearbyUdp.get(EAST, low, high)) continue;
                } else {
                  removeMatchingLog.run(EAST, EAST, low, high, event.time);
                }
              }
              inserted += insert.run(detector, event.boot, event.seq, event.time, now).changes;
            }
            db.exec("COMMIT");
          } catch (error) {
            db.exec("ROLLBACK");
            throw error;
          }
          if (!inserted) return done();
        }
        if (detector === ENTRY && (capture === undefined || msg.topic === "presence/refresh")) {
          const row = observation.get();
          capture = row ? { start: dateTime.format(row.started_ms), end: dateTime.format(row.ended_ms),
            rows: JSON.parse(row.sender_rows) } : null;
        }
        const end = Math.floor(now / HOUR) + 1;
        const start = end - 24;
        const rows = new Map(counts.all(detector, start * HOUR, end * HOUR).map(row => [row.hour, row.count]));
        const bins = Array.from({ length: 24 }, (_, i) => {
          const time = (start + i) * HOUR;
          return { time, label: hourLabel.format(time), count: rows.get(start + i) || 0 };
        });
        const last = latest.get(detector);
        send({ payload: { detector, capture, reception: reception(), last: last ? dateTime.format(last.event_ms) : null,
          bins, peak: Math.max(1, ...bins.map(b => b.count)), total: bins.reduce((sum, b) => sum + b.count, 0) } });
        done();
      } catch (error) { done(error); }
    });
    this.on("close", () => db.close());
  }
  RED.nodes.registerType("home-automation-motion", MotionHistory);
};
