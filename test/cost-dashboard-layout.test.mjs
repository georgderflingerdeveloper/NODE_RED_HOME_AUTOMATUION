import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const templatePath = new URL(
  "../flow-src/flows/kosten--kosten_flow/templates/kostenubersicht.html",
  import.meta.url,
);
const nodesPath = new URL(
  "../flow-src/flows/kosten--kosten_flow/nodes.json",
  import.meta.url,
);

test("Kosten-Dashboard berechnet seine Größe nach Verbindung und Tab-Wechsel neu", () => {
  const template = fs.readFileSync(templatePath, "utf8");
  const nodes = JSON.parse(fs.readFileSync(nodesPath, "utf8"));
  const uiControl = nodes.find((node) => node.id === "kosten_dashboard_ui_control");

  assert.ok(uiControl);
  assert.equal(uiControl.type, "ui_ui_control");
  assert.deepEqual(uiControl.wires, [["kosten_dashboard_template"]]);
  assert.match(template, /msg\.payload === "connect"/);
  assert.match(template, /msg\.name === "KOSTEN"/);
  assert.match(template, /window\.dispatchEvent\(new Event\("resize"\)\)/);
  assert.match(template, /\[0, 100, 350, 800\]/);
});
