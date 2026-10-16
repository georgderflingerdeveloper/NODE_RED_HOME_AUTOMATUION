import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const {SchedulerStore}=createRequire(import.meta.url)('../nodes/scheduler-store.cjs');
test('Zeitpläne überleben eine neue Store-Instanz; temporäre Dateien werden entfernt',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scheduler-store-'));
    try {const file=path.join(dir,'state.json');const store=new SchedulerStore(file);assert.equal(store.load(),undefined);store.save({plans:[{name:'Nacht'}]});assert.deepEqual(new SchedulerStore(file).load(),{plans:[{name:'Nacht'}]});assert.deepEqual(fs.readdirSync(dir),['state.json']);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Beschädigte Persistenz wird nicht als leerer Zeitplan behandelt',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scheduler-store-'));try{const file=path.join(dir,'state.json');fs.writeFileSync(file,'kaputt');assert.throws(()=>new SchedulerStore(file).load());assert.equal(fs.readFileSync(file,'utf8'),'kaputt');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
