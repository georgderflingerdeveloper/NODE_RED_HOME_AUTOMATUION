import { existsSync } from "node:fs";
import { copyFile, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const fromIndex = process.argv.indexOf("--from");
const source = fromIndex >= 0 ? resolve(process.argv[fromIndex + 1] || "") : "";
const dryRun = process.argv.includes("--dry-run");
if (!source) throw new Error("Verwendung: npm run history:restore -- --from <backup.sqlite> [--dry-run]");
if (!existsSync(source)) throw new Error(`Backup nicht gefunden: ${source}`);

const databasePath = join(homedir(), ".node-red", "projects", "NODE_RED_HOME_AUTOMATION_SOLAR", "data", "home-automation.sqlite");
const directory = dirname(databasePath);
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const tempPath = join(directory, `.home-automation-restore-${stamp}.sqlite`);
const previousPath = join(directory, `home-automation-before-restore-${stamp}.sqlite`);

console.log(`Quelle: ${source}`);
console.log(`Ziel:   ${databasePath}`);
if (dryRun) {
  console.log("Prüflauf – keine Dateien wurden verändert.");
  process.exit(0);
}

await copyFile(source, tempPath);
if (existsSync(databasePath)) await rename(databasePath, previousPath);
await rename(tempPath, databasePath);
await Promise.all([
  rm(`${databasePath}-wal`, { force: true }),
  rm(`${databasePath}-shm`, { force: true })
]);
console.log(`Wiederhergestellt. Die vorherige Datenbank liegt zur Sicherheit hier: ${previousPath}`);
