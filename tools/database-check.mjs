import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const dataDirectory = join(process.cwd(), "data");
const databasePath = join(dataDirectory, "home-automation.sqlite");
const backupPath = join(dataDirectory, "backups", "verification.sqlite");
mkdirSync(join(dataDirectory, "backups"), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(readFileSync(join(process.cwd(), "nodes", "home-automation-history.schema.sql"), "utf8"));
const tables = database.prepare(`
  SELECT name FROM sqlite_master
  WHERE type = 'table' AND name IN ('telemetry_events', 'tariff_slots', 'source_state', 'hourly_snapshots')
  ORDER BY name
`).all().map((row) => row.name);
if (tables.length !== 4) throw new Error(`SQLite-Schema unvollständig: ${tables.join(", ")}`);
database.prepare("VACUUM INTO ?").run(backupPath);
database.close();
if (!existsSync(backupPath)) throw new Error("SQLite-Backup wurde nicht erzeugt.");
rmSync(backupPath);
console.log(`SQLite-Schema und Backup geprüft: ${databasePath}`);
