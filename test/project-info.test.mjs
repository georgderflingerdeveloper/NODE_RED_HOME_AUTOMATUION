import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { activeProjectName, projectInfo, resolveProjectRoot } = require("../nodes/home-automation-project-info-core.cjs");

function repositoryFixture() {
  const userDir = mkdtempSync(join(tmpdir(), "home-automation-info-"));
  const projectRoot = join(userDir, "projects", "GEORGSHOME");
  mkdirSync(projectRoot, { recursive: true });
  writeFileSync(join(userDir, ".config.projects.json"), JSON.stringify({ active: "GEORGSHOME" }));
  writeFileSync(join(projectRoot, "package.json"), JSON.stringify({ name: "home-automation", description: "Georgs Home Automation", version: "0.1.0" }));
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
  assert.match(info.source.commit, /^[0-9a-f]{8}$/);
  assert.equal(info.source.dirty, false);
  assert.equal(info.runtime.nodeRedVersion, "5.0.6");
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
