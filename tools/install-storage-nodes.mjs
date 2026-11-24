import { copyFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const nodeRedUserDirectory = process.env.NODE_RED_USER_DIR || join(homedir(), ".node-red");
const targetDirectory = join(nodeRedUserDirectory, "nodes");
const files = [
  "home-automation-light-profile.js",
  "home-automation-light-profile.html",
  "light-profile-curve.cjs",
  "light-output-http.cjs",
  "light-output-browser.mjs",
  "home-automation-living-room.js",
  "home-automation-living-room.html",
  "living-room-io.cjs",
  "living-room-windows.cjs",
  "living-room-report.py",
  "home-automation-tariff.js",
  "home-automation-tariff.html",
  "loyal-tariff.cjs",
  "solaredge-reconnect-countdown.js",
  "solaredge-reconnect-countdown.html",
  "home-automation-homematic-ip.js",
  "home-automation-homematic-ip.html",
  "homematic-ip-core.cjs",
  "homematic-ip-history.cjs",
  "homematic-ip-polling.cjs",
  "homematic-ip-bridge.py",
  "home-automation-phidget-discovery.js",
  "home-automation-phidget-discovery.html",
  "phidget-discovery-core.cjs",
  "phidget-io-core.cjs",
  "phidget-room-history.cjs",
  "home-automation-phidget-io.js",
  "home-automation-phidget-io.html",
  "energy-range.cjs",
  "home-automation-daily-analysis.js",
  "home-automation-daily-analysis.html",
  "daily-analysis.cjs",
  "temperature-analysis.cjs",
  "analysis-periods.cjs",
  "day-load-patterns.cjs",
  "skills/georgshome-tagesanalyse/SKILL.md",
  "solaredge-cloud.cjs",
  "monthly-bills.cjs",
  "home-automation-history.js",
  "home-automation-motion.js",
  "home-automation-motion.html",
  "solar-history-export.cjs",
  "solar-trend.cjs",
  "home-automation-history.html",
  "home-automation-history.schema.sql",
  "reconcile-solaredge-daily-energy.cjs",
  "home-automation-credential-vault-core.cjs",
  "home-automation-credential-vault.js",
  "home-automation-credential-vault.html",
  "home-automation-project-info-core.cjs",
  "home-automation-project-info.js",
  "home-automation-project-info.html"
];

await mkdir(targetDirectory, { recursive: true });
for (const file of files) {
  await mkdir(dirname(join(targetDirectory, file)), { recursive: true });
  await copyFile(join(projectRoot, "nodes", file), join(targetDirectory, file));
}
console.log(`Home-Automation-Speicherknoten installiert: ${targetDirectory}`);
