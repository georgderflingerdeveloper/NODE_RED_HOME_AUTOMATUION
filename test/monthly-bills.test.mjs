import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const {saveBill,readBill,decimalUnits}=createRequire(import.meta.url)('../nodes/monthly-bills.cjs');
const schema=fs.readFileSync('nodes/home-automation-history.schema.sql','utf8');
test('Abrechnung bleibt nach Datenbank-Neustart erhalten; exakte Cent und Milli-kWh',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bills-')),file=path.join(dir,'test.sqlite');let db=new DatabaseSync(file);db.exec(schema);
 const input={month:'2026-09',kwh:'123,456',totalEur:'49,99',energyEur:'20,01',note:'Rechnung',revision:0};
 saveBill(db,input);db.close();db=new DatabaseSync(file);const b=readBill(db,input.month);assert.equal(b.kwh,'123.456');assert.equal(b.totalEur,'49.99');assert.equal(b.energyEur,'20.01');assert.equal(b.revision,1);
 assert.throws(()=>saveBill(db,input),/inzwischen/);assert.equal(readBill(db,input.month).revision,1);
 saveBill(db,{...input,revision:1,totalEur:'50.00'});assert.equal(readBill(db,input.month).revision,2);assert.equal(readBill(db,'2026-08').revision,0);db.close();fs.rmSync(dir,{recursive:true});
});
test('Ungültige Eingaben und zu viele Nachkommastellen werden nicht gerundet gespeichert',()=>{for(const v of ['','abc','NaN','-1','1.234','1.000,00'])assert.throws(()=>decimalUnits(v,2));assert.equal(decimalUnits('0,10',2),10);assert.equal(decimalUnits('',2,true),null);});
