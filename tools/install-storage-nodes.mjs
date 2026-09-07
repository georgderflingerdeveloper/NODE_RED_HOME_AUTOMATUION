import { copyFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const nodeRedUserDirectory = process.env.NODE_RED_USER_DIR || join(homedir(), ".node-red");
const targetDirectory = join(nodeRedUserDirectory, "nodes");
const files = [
  "home-automation-history.js",
  "home-automation-history.html",
  "home-automation-history.schema.sql",
  "home-automation-credential-vault-core.cjs",
  "home-automation-credential-vault.js",
  "home-automation-credential-vault.html",
  "home-automation-project-info-core.cjs",
  "home-automation-project-info.js",
  "home-automation-project-info.html"
];

await mkdir(targetDirectory, { recursive: true });
for (const file of files) {
  await copyFile(join(projectRoot, "nodes", file), join(targetDirectory, file));
}
console.log(`Home-Automation-Speicherknoten installiert: ${targetDirectory}`);
