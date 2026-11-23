'use strict';
const fs=require('node:fs'), path=require('node:path');
const registered=new WeakSet();
function register(http){
    if(registered.has(http))return;
    registered.add(http);
    const monitor=fs.readFileSync(path.join(__dirname,'light-profile-curve.cjs'),'utf8').split('module.exports')[0] +
        fs.readFileSync(path.join(__dirname,'light-output-browser.mjs'),'utf8');
    http.get('/home-automation/light-output.mjs',(_req,res)=>{
        res.set('Cache-Control','no-cache').type('text/javascript').send(monitor);
    });
    let snapshot, expires=0;
    http.get('/home-automation/georgszimmer/pwm',async(_req,res)=>{
        res.set('Cache-Control','no-store');
        try{
            if(!snapshot || Date.now()>=expires){
                expires=Date.now()+200;
                snapshot=fetch('http://192.168.0.150:1880/georgszimmer/light?outputs=1',{signal:AbortSignal.timeout(1500)})
                    .then(async response=>{
                        if(!response.ok)throw Error();
                        const data=await response.json();
                        if(!Array.isArray(data.duty)||data.duty.length!==5||!data.duty.every(v=>v===null || Number.isFinite(v)&&v>=0&&v<=1))throw Error();
                        return {duty:data.duty,profile:typeof data.profile==='string' ? data.profile : null};
                    });
            }
            res.json(await snapshot);
        }catch{res.status(503).json({error:'Keine aktuellen PWM-Daten von PICENTER2.'});}
    });
}
module.exports={register};
