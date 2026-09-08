import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { activeProjectName, branchPurpose, projectInfo, resolveProjectRoot } = require("../nodes/home-automation-project-info-core.cjs");
const registerProjectInfo = require("../nodes/home-automation-project-info.js");

function repositoryFixture() {
  const userDir = mkdtempSync(join(tmpdir(), "home-automation-info-"));
  const projectRoot = join(userDir, "projects", "GEORGSHOME");
  mkdirSync(projectRoot, { recursive: true });
  writeFileSync(join(userDir, ".config.projects.json"), JSON.stringify({ active: "GEORGSHOME" }));
  writeFileSync(join(projectRoot, "package.json"), JSON.stringify({
    name: "home-automation",
    description: "Georgs Home Automation",
    version: "0.1.0",
    homeAutomation: { branchPurposes: { "test-branch": "Testzweck des Branches" } },
  }));
  writeFileSync(join(projectRoot, "flows.json"), "[]\n");
  execFileSync("git", ["init", "-b", "test-branch"], { cwd: projectRoot });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: projectRoot });
  execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: projectRoot });
  execFileSync("git", ["add", "."], { cwd: projectRoot });
  execFileSync("git", ["commit", "-m", "Initial"], { cwd: projectRoot });
  return { userDir, projectRoot, dispose: () => rmSync(userDir, { recursive: true, force: true }) };
}

test("aktive Node-RED-Projektkonfiguration bestimmt das angezeigte Projekt", (t) => {
  const fixture = repositoryFixture(); t.after(fixture.dispose);
  const settings = { userDir: fixture.userDir, flowFile: "flows.json" };
  assert.equal(activeProjectName(fixture.userDir), "GEORGSHOME");
  assert.equal(resolveProjectRoot(settings), fixture.projectRoot);

  const info = projectInfo(settings, { nodeRedVersion: "5.0.6" });
  assert.equal(info.application.version, "0.1.0");
  assert.equal(info.source.project, "GEORGSHOME");
  assert.equal(info.source.branch, "test-branch");
  assert.equal(info.source.branchPurpose, "Testzweck des Branches");
  assert.match(info.source.commit, /^[0-9a-f]{8}$/);
  assert.equal(info.source.dirty, false);
  assert.equal(info.runtime.nodeRedVersion, "5.0.6");
});

test("unbekannter Branch erhält eine verständliche neutrale Kurzinfo", () => {
  assert.match(branchPurpose({}, "eigener-branch"), /Arbeitsstand der Hausautomation/);
});

test("Versionsinfo wird in der obersten Dashboard-Statusleiste installiert", () => {
  const template = readFileSync(join(
    process.cwd(),
    "flow-src/flows/system--system_dashboard_flow/templates/version-branch-und-kurzinfo.html",
  ), "utf8");
  assert.match(template, /querySelector\("\.md-toolbar-tools"\)/);
  assert.match(template, /Was macht dieser Branch\?/);
  assert.match(template, /fetch\("\/home-automation\/project-info"/);
});

test("Dashboard kann Projektinformation über einen nur lesenden Endpunkt laden", () => {
  let route = "";
  let handler = null;
  let payload = null;
  let cacheControl = "";
  registerProjectInfo({
    settings: { userDir: process.cwd(), flowFile: join(process.cwd(), "flows.json") },
    version: () => "5.0.6",
    httpNode: { get(path, callback) { route = path; handler = callback; } },
    nodes: { registerType() {} },
  });

  assert.equal(route, "/home-automation/project-info");
  assert.equal(typeof handler, "function");
  handler({}, {
    set(name, value) { if (name === "Cache-Control") cacheControl = value; },
    json(value) { payload = value; },
    status() { throw new Error("Der Endpunkt darf im Test nicht fehlschlagen"); },
  });
  assert.equal(cacheControl, "no-store");
  assert.equal(payload.runtime.nodeRedVersion, "5.0.6");
  assert.equal(typeof payload.source.branchPurpose, "string");
});

test("nicht committete Änderungen werden in der Versionsinfo sichtbar", (t) => {
  const fixture = repositoryFixture(); t.after(fixture.dispose);
  writeFileSync(join(fixture.projectRoot, "README.md"), "geändert\n");
  const info = projectInfo({ userDir: fixture.userDir, flowFile: join(fixture.projectRoot, "flows.json") });
  assert.equal(info.source.dirty, true);
  assert.equal(info.source.changedFiles, 1);
});

test("absolute Flow-Datei hat Vorrang vor einer veralteten Projektkonfiguration", (t) => {
  const fixture = repositoryFixture(); t.after(fixture.dispose);
  writeFileSync(join(fixture.userDir, ".config.projects.json"), JSON.stringify({ active: "FALSCHES_PROJEKT" }));
  const root = resolveProjectRoot({ userDir: fixture.userDir, flowFile: join(fixture.projectRoot, "flows.json") });
  assert.equal(root, fixture.projectRoot);
});
