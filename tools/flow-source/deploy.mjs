#!/usr/bin/env node
import { DEFAULT_FLOW_FILE, readFlowFile, validateFlow } from "./lib.mjs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const endpoint = new URL("/flows", process.env.NODE_RED_URL || "http://127.0.0.1:1880");
const { raw, nodes } = readFlowFile(DEFAULT_FLOW_FILE);
validateFlow(nodes);

let accessToken = process.env.NODE_RED_ACCESS_TOKEN || "";
let username = process.env.NODE_RED_USERNAME || "";
let password = process.env.NODE_RED_PASSWORD || "";
if (!accessToken && (!username || !password)) {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error("Node-RED-Zugangsdaten fehlen. Bitte flow:deploy in einem interaktiven Terminal starten.");
  }
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    username ||= (await prompt.question("Node-RED-Benutzername: ")).trim();
  } finally {
    prompt.close();
  }
  if (!password) password = await readHiddenPassword("Node-RED-Passwort: ");
}

async function readHiddenPassword(label) {
  stdout.write(label);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  let value = "";
  try {
    for await (const chunk of stdin) {
      for (const character of chunk) {
        if (character === "\u0003") throw new Error("Eingabe abgebrochen.");
        if (character === "\r" || character === "\n") {
          stdout.write("\n");
          return value;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += character;
      }
    }
    throw new Error("Terminal-Eingabe wurde beendet.");
  } finally {
    stdin.setRawMode(false);
  }
}
if (!accessToken && (username || password)) {
  if (!username || !password) {
    throw new Error("Für Node-RED-Login müssen NODE_RED_USERNAME und NODE_RED_PASSWORD gemeinsam gesetzt sein.");
  }
  const authResponse = await fetch(new URL("/auth/token", endpoint), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: "node-red-admin",
      grant_type: "password",
      scope: "*",
      username,
      password,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!authResponse.ok) {
    throw new Error(`Node-RED-Anmeldung fehlgeschlagen: HTTP ${authResponse.status}`);
  }
  const auth = await authResponse.json();
  accessToken = auth.access_token || "";
  if (!accessToken) throw new Error("Node-RED-Anmeldung lieferte kein Zugriffstoken.");
}

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
  },
  body: raw,
  signal: AbortSignal.timeout(15_000),
});

if (!response.ok) {
  throw new Error(`Node-RED-Deployment fehlgeschlagen: HTTP ${response.status} ${await response.text()}`);
}
console.log(`Node-RED-Deployment erfolgreich: HTTP ${response.status}, ${nodes.length} Nodes.`);
