import test from 'node:test';
import assert from 'node:assert/strict';
import {profile} from '../nodes/temperature-analysis.cjs';
const day='2026-11-23',start=Date.parse(day+'T00:00+01:00')/3600000;
const rows=(field,dayValue,nightValue)=>Array.from({length:24},(_,i)=>({rooms:'Wohnzimmer',point_name:'1.'+field,bucket:start+i,value:i<6?nightValue:dayValue}));
test('Profil trennt Messquelle, Sollwert und Nacht in Wiener Ortszeit',()=>{
 const series=[...rows('actualTemperature',22,20),...rows('valveActualTemperature',26,26),...rows('setPointTemperature',22,18)];
 const output=profile(series,day,'2026-11-24').join('\n');
 assert.match(output,/Raumfühler, 1 von 2 Tagen/);assert.match(output,/tags 22,0 °C, nachts 20,0/);assert.match(output,/4,0 °C tiefer/);
 assert.doesNotMatch(output,/26,0|Ersparnis von/);
 assert.match(profile(rows('valveActualTemperature',24,22),day,day)[0],/Heizkörperfühler/);
});
test('Lücken und alleinige Sollwerte liefern keine vermeintliche Nachtabsenkung',()=>{
 const sparse=rows('actualTemperature',23,19).slice(5,10);
 const report=profile(sparse,day,day)[0];assert.match(report,/fehlen Messstunden/);assert.doesNotMatch(report,/kühler/);
 assert.match(profile(rows('setPointTemperature',22,18),day,day)[0],/fehlen/);
});

import {mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {recorder} from '../nodes/phidget-room-history.cjs';
import {temperatures} from '../nodes/temperature-analysis.cjs';
test('Phidget-Archiv zählt frische Messminuten und liest auch ohne Homematic-Archiv',()=>{
 const dir=mkdtempSync(join(tmpdir(),'gh-thermal-'));
 const file=join(dir,'phidget-inventory','room-temperatures.sqlite'),hm=join(dir,'homematic-ip','absent.sqlite');
 const sensor={serial:'800330',server:'hub5000',port:0,index:0,className:'TemperatureSensor',quality:'live',value:22.4};
 try{
   mkdirSync(join(dir,'homematic-ip'));
   const r=recorder(file);
   for(let m=0;m<30;m++){
      const now=start*3600000+m*60000;
      r.record([{...sensor,lastRead:now}],now);r.record([{...sensor,value:99,lastRead:now}],now);
   }
   const later=(start+1)*3600000;
   r.record([{...sensor,quality:'stale',lastRead:later}],later);r.close();
   assert.match(temperatures(hm,day,day)[0],/Georgszimmer \(Phidget-Raumfühler\): 22,4–22,4 °C in 1 erfassten Stunden/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
