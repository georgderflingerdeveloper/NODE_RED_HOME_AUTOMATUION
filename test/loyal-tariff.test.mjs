import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {openPlan, project, parseOffer, START, HOUR} from '../nodes/loyal-tariff.cjs';

test('Wiener Vertragsbeginn, Preisbestätigung, Rückschalten und Versionskonflikt', () => {
    const db = new DatabaseSync(':memory:');
    const plan = openPlan(db);
    const input = {revision:1,mode:'loyal',work:15,base:5,confirmed:true};
    const slots = [-1,0,1].map(i=>({validFrom:new Date(START+i*HOUR).toISOString(),
        validUntil:new Date(START+(i+1)*HOUR).toISOString(),priceCtPerKWh:0,marketPriceEurPerMWh:0}));
    const market = {slots};
    const before = project(plan.all(), market, START-1);
    assert.equal(before.priceCtPerKWh,0);
    assert.equal(before.slots[1].priceCtPerKWh,14.9);
    assert.equal(project(plan.all(), null, START).priceCtPerKWh,14.9);
    assert.throws(()=>plan.confirm({...input,confirmed:false}, START));
    plan.confirm(input, START+1);
    assert.throws(()=>plan.confirm(input, START+2));
    assert.equal(project(plan.all(), null, START+HOUR-1).priceCtPerKWh,14.9);
    assert.equal(project(openPlan(db).all(), null, START+HOUR).priceCtPerKWh,15);
    plan.confirm({...input,revision:2,mode:'market'}, START+HOUR+1);
    assert.equal(project(plan.all(), null, START+2*HOUR).online,false);
    db.close();
});

test('Onlineangebot erfordert eindeutiges Produkt, Einheit und Bruttokennzeichnung', () => {
    const page = '<title>Ökostrom Loyal - Energie AG</title><b>Arbeitspreis</b> 14,90 ct/kWh BRUTTO Grundpreis 4,62 €/Monat BRUTTO';
    assert.deepEqual(parseOffer(page),{work:14.9,base:4.62});
    for(const bad of [page+page,page.replace('Loyal','Spot'),page.replace('BRUTTO','NETTO')]) assert.throws(()=>parseOffer(bad));
});
