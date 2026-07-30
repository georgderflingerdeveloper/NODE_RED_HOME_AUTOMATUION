import { copyFile, chmod, mkdir, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (platform() !== "darwin") {
  throw new Error("Der Desktop-Starter wird nur unter macOS unterstützt.");
}

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const appPath = join(homedir(), "Desktop", "Node-RED Solar Dashboard.app");
const contentsPath = join(appPath, "Contents");
const resourcesPath = join(contentsPath, "Resources");
const executablePath = join(contentsPath, "MacOS", "open-node-red-dashboard");

const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleDisplayName</key><string>Node-RED Solar Dashboard</string>
  <key>CFBundleExecutable</key><string>open-node-red-dashboard</string>
  <key>CFBundleIconFile</key><string>NodeRedDashboard</string>
  <key>CFBundleIdentifier</key><string>local.node-red.solar-dashboard</string>
  <key>CFBundleName</key><string>Node-RED Solar Dashboard</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
</dict></plist>
`;

const launcher = `#!/bin/zsh
set -euo pipefail

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"
dashboard_url="http://127.0.0.1:1880/ui"
user_dir="\${HOME}/.node-red"

if ! /usr/bin/curl -fsSL --max-time 2 "$dashboard_url" >/dev/null; then
  node-red --userDir "$user_dir" > /tmp/node-red-solar-dashboard.log 2>&1 &
  for attempt in {1..30}; do
    if /usr/bin/curl -fsSL --max-time 2 "$dashboard_url" >/dev/null; then
      break
    fi
    /bin/sleep 1
  done
fi

/usr/bin/open "$dashboard_url"
`;

await mkdir(resourcesPath, { recursive: true });
await mkdir(dirname(executablePath), { recursive: true });
await copyFile(
  join(projectRoot, "assets", "home-automation-dashboard.icns"),
  join(resourcesPath, "NodeRedDashboard.icns"),
);
await writeFile(join(contentsPath, "Info.plist"), infoPlist);
await writeFile(executablePath, launcher);
await chmod(executablePath, 0o755);

console.log(`Desktop-Starter installiert: ${appPath}`);
