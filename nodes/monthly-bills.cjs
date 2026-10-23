'use strict';
function monthRange(month){
 if(typeof month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw Error('Monat als JJJJ-MM eingeben (2000–2099).');
 const [year,m]=month.split('-').map(Number);const next=m===12?`${year+1}-01`:`${year}-${String(m+1).padStart(2,'0')}`;
 return {from:month+'-01T00:00',to:next+'-01T00:00'};
}
function decimalUnits(value,digits,optional=false){
 if(optional&&(value===''||value==null))return null;
 const s=String(value??'').trim().replace(',','.');
 if(!new RegExp('^\\d+(?:\\.\\d{1,'+digits+'})?$').test(s))throw Error(`Zahl mit maximal ${digits} Nachkommastellen erforderlich (ohne Tausendertrennzeichen).`);
 const [a,b='']=s.split('.');const n=Number(a)*10**digits+Number(b.padEnd(digits,'0'));
 if(!Number.isSafeInteger(n)||n>1e12)throw Error('Wert zu groß.');return n;
}
function saveBill(db,input){
 monthRange(input.month);
 const kwhMilli=decimalUnits(input.kwh,3),totalCents=decimalUnits(input.totalEur,2),energyCents=decimalUnits(input.energyEur,2,true);
 if(typeof input.note!=='string'||input.note.length>500)throw Error('Notiz: maximal 500 Zeichen.');
 if(!Number.isInteger(input.revision)||input.revision<0)throw Error('Abrechnung zuerst laden.');
 db.exec('BEGIN IMMEDIATE');
 try{
 const old=db.prepare('SELECT revision FROM user_monthly_bills WHERE month=?').get(input.month);
 if((old?.revision||0)!==input.revision)throw Error('Abrechnung inzwischen geändert. Bitte erneut laden.');
 db.prepare(`INSERT INTO user_monthly_bills(month,kwh_milli,total_cents,energy_cents,note,revision,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(month) DO UPDATE SET kwh_milli=excluded.kwh_milli,total_cents=excluded.total_cents,energy_cents=excluded.energy_cents,note=excluded.note,revision=excluded.revision,updated_at=excluded.updated_at`).run(input.month,kwhMilli,totalCents,energyCents,input.note,input.revision+1,new Date().toISOString());
 db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
 return readBill(db,input.month);
}
function readBill(db,month){monthRange(month);const r=db.prepare('SELECT * FROM user_monthly_bills WHERE month=?').get(month);return r?{month:r.month,kwh:(r.kwh_milli/1000).toFixed(3),totalEur:(r.total_cents/100).toFixed(2),energyEur:r.energy_cents===null?'':(r.energy_cents/100).toFixed(2),note:r.note,revision:r.revision}:{month,kwh:'',totalEur:'',energyEur:'',note:'',revision:0};}
module.exports={monthRange,decimalUnits,saveBill,readBill};
