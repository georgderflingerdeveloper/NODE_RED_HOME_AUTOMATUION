import assert from "node:assert/strict";
import test from "node:test";
import { bumpVersion } from "../tools/bump-version.mjs";

test("bump-version increments patch, minor and major releases consistently", () => {
  assert.equal(bumpVersion("0.2.0", "patch"), "0.2.1");
  assert.equal(bumpVersion("0.2.7", "minor"), "0.3.0");
  assert.equal(bumpVersion("2.8.4", "major"), "3.0.0");
});

test("bump-version rejects invalid versions and release types", () => {
  assert.throws(() => bumpVersion("0.2", "patch"), /Ungültige Projektversion/);
  assert.throws(() => bumpVersion("0.2.0", "feature"), /Unbekannter Versionstyp/);
});
