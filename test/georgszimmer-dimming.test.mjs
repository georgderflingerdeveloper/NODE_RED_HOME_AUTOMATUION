import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const run = new Function('msg','context','global',readFileSync('tools/georgszimmer/room-controller.js','utf8'));
test('Georgszimmer maps combined lightness to PWM once and preserves black and full scale',()=>{
    const plc = new Map([['FF0',[true,false,false]],['M0',[false,false]],['M1',[true,false]]]);
    const context = new Map();
    function apply(type,value) {
        run({req:{method:'POST',socket:{remoteAddress:'192.168.0.149'},is:()=>true},payload:{type,value}},context,plc);
        return plc.get('georgszimmerPower');
    }
    for(const [level,duty] of [[0,0],[5,0.005535],[8,0.008856],[50,0.184187],[100,1]]) {
        for(const out of apply('brightness',level)) assert.ok(Math.abs(out-duty)<0.000001);
    }
    apply('scenario','Abend');
    const [first,,third] = apply('brightness',50);
    assert.ok(Math.abs(first-((17.5+16)/116)**3)<1e-10);
    assert.ok(Math.abs(third-((10+16)/116)**3)<1e-10);
});
