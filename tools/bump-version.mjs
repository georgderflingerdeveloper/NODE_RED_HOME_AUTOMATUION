import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function bumpVersion(version, releaseType) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version));
  if (!match) throw new Error(`Ungültige Projektversion: ${version}`);
  if (!new Set(["patch", "minor", "major"]).has(releaseType)) {
    throw new Error(`Unbekannter Versionstyp: ${releaseType}`);
  }

  let [, major, minor, patch] = match.map(Number);
  if (releaseType === "patch") patch += 1;
  if (releaseType === "minor") {
    minor += 1;
    patch = 0;
  }
  if (releaseType === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  }
  return `${major}.${minor}.${patch}`;
}

function updatePackageVersion(releaseType, packagePath = "package.json") {
  const resolvedPath = path.resolve(packagePath);
  const packageData = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  const previousVersion = packageData.version;
  packageData.version = bumpVersion(previousVersion, releaseType);
  fs.writeFileSync(resolvedPath, `${JSON.stringify(packageData, null, 4)}\n`);
  console.log(`Projektversion: ${previousVersion} -> ${packageData.version}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  updatePackageVersion(process.argv[2] || "patch", process.argv[3]);
}
