import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const register = new Function('msg', fs.readFileSync('flow-src/flows/flow-kidroom--c28cf7ba.34de98/functions/plc-status-und-scheduler-bestatigung.js','utf8'));
test('Georgszimmer registriert Kanalwerte und trennt eigene Szenen von eingebauten Lichtprogrammen',()=>{
    const levels={Abend:[25,25,30,40,5],Lesen:[0,0,70,40,0]};
    const [,messages]=register({statusCode:200,payload:{on:false,brightness:80,scenario:'Abend',
        scenarios:['Abend','Morgenwecker','Lesen'],sceneLevels:levels,routines:{Morgenwecker:1}}});
    assert.equal(messages[0].payload.channels,5);
    assert.deepEqual(messages[0].payload.sceneLevels,levels);
    assert.deepEqual(messages[0].payload.editableScenes,['Lesen']);
});
