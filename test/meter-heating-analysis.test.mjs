import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {collectPeriod,markdown} from '../nodes/daily-analysis.cjs';
import {periodFor} from '../nodes/analysis-periods.cjs';

test('Messberichte begrenzen auch Teilwochen und Teilmonate auf Wiener Kalendertage',()=>{
    const dir=mkdtempSync(join(tmpdir(),'georg-bericht-'));
    const file=join(dir,'haus.sqlite'), hm=join(dir,'heizung.sqlite');
    const home=new DatabaseSync(file), heating=new DatabaseSync(hm);
    try {
        home.exec(readFileSync('nodes/home-automation-history.schema.sql','utf8'));
        home.exec("CREATE TABLE presence_event(detector,event_ms INTEGER)");
        home.exec(`INSERT INTO smartmeter_samples(observed_at,grid_power,current_l1) VALUES
            ('2026-11-25T21:10:00.000Z',-4200,6),('2026-11-25T21:10:30.000Z',250,NULL),
            ('2026-11-25T23:00:00.000Z',-9900,100);
            INSERT INTO wallbox_sessions VALUES(1,'2026-11-25T22:00:00.000Z','2026-11-26T00:00:00.000Z',NULL,7200,7,0);
            INSERT INTO wallbox_energy_deltas VALUES(1,1,'2026-11-25T22:00:00.000Z','2026-11-26T00:00:00.000Z',7);
            INSERT INTO wallbox_price_parts(delta_id,from_at,to_at,local_day,kwh,ct_kwh) VALUES
            (1,'a','b','2026-11-25',2,25),(1,'b','c','2026-11-25',1,NULL),(1,'c','d','2026-11-26',4,30);`);
        heating.exec(`CREATE TABLE series(id,device_id,device_name,rooms,point_name,unit,kind);
            CREATE TABLE samples(series_id,observed_at INTEGER,value REAL,quality);
            INSERT INTO series VALUES(1,'a','Thermostat','Wohnzimmer','1.valvePosition','%','number');`);
        const insert=heating.prepare('INSERT INTO samples VALUES(1,?,?,?)');
        insert.run(Date.parse('2026-11-25T02:00Z'),0,'current');
        insert.run(Date.parse('2026-11-25T04:00Z'),50,'current');
        insert.run(Date.parse('2026-11-25T05:00Z'),99,'missing');
        insert.run(Date.parse('2026-11-25T23:00Z'),75,'current');
        for(const type of ['day','week','month']){
            const report=collectPeriod(file,periodFor(type,'2026-11-25'),'',hm);
            assert.ok(report.hasData);
            const md=markdown(report,'Kurztext','Test');
            assert.match(md,/Ohne Fahrzeugzuordnung · 3 kWh aus 1 Ladung/);
            assert.match(md,/2 kWh zum archivierten Stromtarif bewertet: 0,5 €/);
            assert.match(md,/Für 1 kWh fehlt der Tarif/);
            assert.match(md,/2 Messpunkte in 1 von/);
            assert.match(md,/Netzbezug: 4,2 kW/);
            assert.match(md,/Einspeisung: 0,25 kW/);
            assert.match(md,/Ventilöffnung 0–50 % \(2\//);
        }
        const old=collectPeriod(file,periodFor('day','2026-10-25'),'',hm);
        assert.equal(old.hasData,false);
        assert.ok(old.measurements.every(t=>!t.hasData));
    } finally { home.close(); heating.close(); rmSync(dir,{recursive:true,force:true}); }
});
