import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import test from "node:test";

async function runDeploy(handler, variables = {}) {
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    await handler({ request, response, body: Buffer.concat(chunks).toString("utf8") });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const env = { ...process.env, NODE_RED_URL: `http://127.0.0.1:${address.port}` };
  delete env.NODE_RED_ACCESS_TOKEN;
  delete env.NODE_RED_USERNAME;
  delete env.NODE_RED_PASSWORD;
  Object.assign(env, variables);

  try {
    const child = spawn(process.execPath, ["tools/flow-source/deploy.mjs"], {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    const exitCode = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    return { exitCode, stdout, stderr };
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("Deployment tauscht lokale Zugangsdaten gegen ein kurzlebiges Node-RED-Token", async () => {
  const requests = [];
  const result = await runDeploy(async ({ request, response, body }) => {
    requests.push({ method: request.method, url: request.url, headers: request.headers, body });
    if (request.url === "/auth/token") {
      assert.equal(request.headers["content-type"], "application/json");
      assert.deepEqual(JSON.parse(body), {
        client_id: "node-red-admin",
        grant_type: "password",
        scope: "*",
        username: "deploy-user",
        password: "local-only-test-password",
      });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ access_token: "temporary-test-token" }));
      return;
    }
    assert.equal(request.url, "/flows");
    assert.equal(request.headers.authorization, "Bearer temporary-test-token");
    assert.ok(Array.isArray(JSON.parse(body)));
    response.writeHead(204);
    response.end();
  }, { NODE_RED_USERNAME: "deploy-user", NODE_RED_PASSWORD: "local-only-test-password" });

  assert.equal(result.exitCode, 0, result.stderr);
  assert.deepEqual(requests.map((item) => item.url), ["/auth/token", "/flows"]);
  assert.match(result.stdout, /Deployment erfolgreich/);
  assert.doesNotMatch(result.stdout + result.stderr, /local-only-test-password|temporary-test-token/);
});

test("Deployment kann ein bereits ausgestelltes Zugriffstoken verwenden", async () => {
  const result = await runDeploy(async ({ request, response, body }) => {
    assert.equal(request.url, "/flows");
    assert.equal(request.headers.authorization, "Bearer pre-issued-test-token");
    assert.ok(Array.isArray(JSON.parse(body)));
    response.writeHead(204);
    response.end();
  }, { NODE_RED_ACCESS_TOKEN: "pre-issued-test-token" });

  assert.equal(result.exitCode, 0, result.stderr);
  assert.match(result.stdout, /Deployment erfolgreich/);
  assert.doesNotMatch(result.stdout + result.stderr, /pre-issued-test-token/);
});
