import assert from "node:assert/strict";
import test from "node:test";
import { runFunctionNode } from "./helpers/function-node-harness.mjs";

test("aWATTar-Payload enthält aktuelle und zukünftige Stundenpreise", async () => {
  const hourStart = new Date();
  hourStart.setMinutes(0, 0, 0);
  const slots = [0, 1, 2].map((offset) => ({
    start_timestamp: hourStart.getTime() + offset * 60 * 60 * 1000,
    end_timestamp: hourStart.getTime() + (offset + 1) * 60 * 60 * 1000,
    marketprice: 50 + offset * 10,
  }));
  const { result } = await runFunctionNode("kosten_aktuellen_tarif_aufbereiten", {
    msg: { payload: { data: slots } },
  });

  assert.equal(result.topic, "aWATTar/tariff/current");
  assert.equal(result.payload.priceCtPerKWh, 5);
  assert.equal(result.payload.slots.length, 3);
  assert.equal(result.payload.slots[1].priceCtPerKWh, 6);
  assert.match(result.payload.slots[2].validFrom, /T/);
});
