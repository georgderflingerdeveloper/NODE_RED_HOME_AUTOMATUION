# JavaScript-Unit-Tests

Jede Datei mit der Endung `.test.mjs` wird durch `npm test` automatisch ausgeführt.

Ein neuer Test für einen Function-Node benötigt nur dessen Node-ID:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { runFunctionNode } from "./helpers/function-node-harness.mjs";

test("mein Function-Node", async () => {
  const { result, statuses, global } = await runFunctionNode("NODE_ID", {
    msg: { payload: 123 },
    globalValues: { Beispiel: true },
  });

  assert.equal(result.payload, 123);
});
```

Der Harness stellt `msg`, `node`, `context`, `flow`, `global` und `env` wie in einem
Node-RED-Function-Node bereit. Externe Geräte und Netzwerkzugriffe sollten in Unit-Tests
nicht angesprochen werden.
