'use strict';
const fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
function recorder(file) {
    let db,put,last=-1,pruned=-1;
    return {
        record(rows,now){
            const minute=Math.floor(now/60000);
            if(minute===last)return;
            const sensor=rows.find(r=>r.serial==='800330' && r.server==='hub5000' && r.port===0 && r.index===0 && r.className==='TemperatureSensor');
            if(sensor?.quality!=='live' || !Number.isFinite(sensor.value) || !Number.isSafeInteger(sensor.lastRead)
                || sensor.lastRead>now || now-sensor.lastRead>10000)return;
            const observed=Math.floor(sensor.lastRead/60000);
            if(observed===last)return;
            if(!db){
                fs.mkdirSync(path.dirname(file),{recursive:true});
                db=new DatabaseSync(file);fs.chmodSync(file,0o600);
                db.exec('PRAGMA journal_mode=WAL;CREATE TABLE IF NOT EXISTS georgszimmer(minute INTEGER PRIMARY KEY,value REAL NOT NULL)');
                put=db.prepare('INSERT OR IGNORE INTO georgszimmer(minute,value) VALUES(?,?)');
            }
            put.run(observed,sensor.value);last=observed;
            const day=Math.floor(minute/1440);
            if(day!==pruned){db.prepare('DELETE FROM georgszimmer WHERE minute<?').run(minute-366*1440);pruned=day;}
        },
        close(){db?.close();}
    };
}
module.exports={recorder};
