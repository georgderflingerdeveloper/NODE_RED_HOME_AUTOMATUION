#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const credentialsFile = process.env.SYSTEM_CREDENTIALS_FILE
  || path.join(homedir(), "Desktop", "Raspberry-Pi-Zugangsdaten.html");

function htmlText(value) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function sshCredentials(html) {
  const body = (html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i) || [])[1] || "";
  return [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((row) => [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => htmlText(cell[1])))
    .filter((row) => /^192\.168\.0\.\d{1,3}$/.test(row[1] || "") && /ssh/i.test(row[2] || ""))
    .map((row) => ({ ip: row[1], user: row[3], password: row[4] }));
}

const expectScript = String.raw`log_user 0
set timeout 12
spawn ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password,keyboard-interactive -o PubkeyAuthentication=no $env(SSH_USER)@$env(SSH_IP) {printf "HOST="; hostname; printf "TEMP="; (vcgencmd measure_temp 2>/dev/null || cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null); printf "MEM="; free -m | awk '/Mem:/ {printf "%s/%s", $3, $2}'; printf "DISK="; df -Pm / | awk 'NR==2 {printf "%s/%s", $3, $2}'; printf "UPTIME="; cut -d. -f1 /proc/uptime; printf "LOAD="; cut -d" " -f1 /proc/loadavg}
expect {
  -re {(?i)password:} { send -- "$env(SSH_PASSWORD)\r"; exp_continue }
  eof { puts -nonewline $expect_out(buffer) }
}`;

function probe({ ip, user, password }) {
  return new Promise((resolve) => {
    const child = spawn("/usr/bin/expect", ["-c", expectScript], {
      env: { ...process.env, SSH_USER: user, SSH_IP: ip, SSH_PASSWORD: password },
      stdio: ["ignore", "pipe", "ignore"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.on("error", () => resolve({ ip, online: false }));
    child.on("close", (code) => {
      const value = (key) => (output.match(new RegExp(`${key}=([^\\r\\n]+)`)) || [])[1]?.trim() || null;
      const temperatureText = value("TEMP");
      const temperatureMatch = temperatureText?.match(/(-?\d+(?:\.\d+)?)/);
      const memoryMatch = value("MEM")?.match(/(\d+)\/(\d+)/);
      const diskMatch = value("DISK")?.match(/(\d+)\/(\d+)/);
      resolve({
        ip,
        online: code === 0 && Boolean(value("HOST")),
        hostname: value("HOST"),
        temperatureC: temperatureMatch ? Number(temperatureMatch[1]) : null,
        memoryUsedPercent: memoryMatch ? (Number(memoryMatch[1]) / Number(memoryMatch[2])) * 100 : null,
        diskUsedPercent: diskMatch ? (Number(diskMatch[1]) / Number(diskMatch[2])) * 100 : null,
        uptimeSeconds: Number(value("UPTIME")) || null,
        loadAverage: Number(value("LOAD")) || null,
        observedAt: new Date().toISOString(),
      });
    });
  });
}

try {
  const credentials = sshCredentials(readFileSync(credentialsFile, "utf8"));
  const results = await Promise.all(credentials.map(probe));
  process.stdout.write(JSON.stringify({ source: "ssh", observedAt: new Date().toISOString(), devices: results }));
} catch {
  process.stdout.write(JSON.stringify({ source: "ssh", observedAt: new Date().toISOString(), devices: [] }));
}
