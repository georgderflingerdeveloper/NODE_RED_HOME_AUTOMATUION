import test from 'node:test';
import assert from 'node:assert/strict';
import {runFunctionNode} from './helpers/function-node-harness.mjs';
function fixture({sunset='2026-10-18T17:20',duration=1200,clouds=73}={}) {
 const times=Array.from({length:8},(_,i)=>`2026-10-18T${String(16+i).padStart(2,'0')}:00`);
 return {timezone:'Europe/Vienna',current:{time:'2026-10-18T17:35',temperature_2m:13.7,cloud_cover:73,is_day:0},hourly:{time:times,sunshine_duration:[3600,3600,duration,0,0,0,0,0],cloud_cover:times.map(()=>clouds),temperature_2m:times.map(()=>13),precipitation_probability:times.map(()=>0),weather_code:times.map(()=>1)},daily:{time:['2026-10-18'],sunrise:['2026-10-18T07:00'],sunset:[sunset]}};
}
async function parse(payload){return (await runFunctionNode('weather_parse',{msg:{statusCode:200,payload}})).result;}
test('20 Sonnenminuten in Abendstunde sind 33 Prozent, nicht 100',async()=>{
 const [msg,error]=await parse(fixture());assert.equal(error,null);
 const row=msg.payload.ForecastNext6Hours[0];assert.equal(row.TimeLabel,'17:00–18:00');
 assert.equal(row.SunshinePercent,33);assert.equal(row.SunshineMinutes,20);assert.equal(row.CloudCoverPercent,73);
 assert.equal(msg.payload.ExpectedPercentSunshineNextHour,33);assert.equal(msg.payload.ExpectetPercentSunshineNextHour,33);
 assert.equal(msg.payload.ExpectedPercentSunshineNext6Hours,6);assert.equal(msg.payload.ForecastIntervalCount,6);
});
test('Volle Stunde Sonnenschein und 73 Prozent Wolken bleiben als verschiedene Größen erhalten',async()=>{
 const [msg]=await parse(fixture({sunset:'2026-10-18T20:00',duration:3600}));
 assert.equal(msg.payload.ForecastNext6Hours[0].SunshinePercent,100);assert.equal(msg.payload.ForecastNext6Hours[0].CloudCoverPercent,73);
});
test('Nacht liefert 0, Abendstunde überschreitet nicht die verbleibende Tageslichtdauer',async()=>{
 const [msg]=await parse(fixture({duration:3600}));assert.equal(msg.payload.ForecastNext6Hours[0].SunshinePercent,33);
 for(const row of msg.payload.ForecastNext6Hours.slice(1)){assert.equal(row.SunshinePercent,0);assert.equal(row.IsDaylight,false);}
});
for(const value of [null,undefined,-1,3601,NaN,'1200'])test(`Ungültige Sonnendauer ${String(value)} führt zum bestehenden Fehlerpfad`,async()=>{
 const data=fixture();data.hourly.sunshine_duration[2]=value;const [msg,error]=await parse(data);assert.equal(msg,null);assert.match(error.payload.reason,/Sonnenscheindauer/);
});
test('Sechsstundenmittel verwendet Sekunden vor Rundung, nicht gerundete Prozentwerte',async()=>{
 const data=fixture({sunset:'2026-10-18T23:59',duration:18});data.hourly.sunshine_duration.fill(18);
 const [msg]=await parse(data);assert.equal(msg.payload.ExpectedPercentSunshineNext6Hours,1);
});
test('Morgendämmerung: 15 Minuten Sonne bleiben 25 Prozent einer vollen Stunde',async()=>{
 const data=fixture({duration:900});data.daily.sunrise=['2026-10-18T17:45'];data.daily.sunset=['2026-10-18T23:00'];
 const [msg]=await parse(data);assert.equal(msg.payload.ForecastNext6Hours[0].SunshinePercent,25);
});
