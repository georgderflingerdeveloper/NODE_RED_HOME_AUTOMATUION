import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {preparedRoomNodes} from '../tools/scheduler-flow.mjs';
test('Drei Raum-Erweiterungen sind vorbereitet, außen unverbunden und intern korrekt geroutet',()=>{
 const flow=JSON.parse(fs.readFileSync('flows.json'));
 for(const expected of preparedRoomNodes()) assert.deepEqual(flow.find(n=>n.id===expected.id),expected);
 const router=flow.find(n=>n.id==='scheduler_room_router');
 assert.equal(router.property,'payload.roomId');
 assert.deepEqual(router.rules.map(r=>r.v),['kinderzimmer','bad','wohnzimmer']);
 assert.ok(flow.find(n=>n.id==='scheduler_engine').wires[0].includes(router.id));
 for(const room of ['kinderzimmer','bad','wohnzimmer']) {
  assert.deepEqual(flow.find(n=>n.id===`scheduler_${room}_out`).links,[]);
  assert.deepEqual(flow.find(n=>n.id===`scheduler_${room}_in`).links,[]);
 }
});
