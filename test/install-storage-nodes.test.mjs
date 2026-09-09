import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("storage node installer includes SolarEdge daily energy reconciliation module", async () => {
  const installer = await readFile(
    new URL("../tools/install-storage-nodes.mjs", import.meta.url),
    "utf8"
  );

  assert.match(installer, /"reconcile-solaredge-daily-energy\.cjs"/);
});
