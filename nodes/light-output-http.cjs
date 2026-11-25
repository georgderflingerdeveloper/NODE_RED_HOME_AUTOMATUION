'use strict';
const fs=require('node:fs'), path=require('node:path');
const registered=new WeakSet();
let snapshot, expires=0;
function readKidOutputs(){
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
    return snapshot;
}
// Nur aktuell vom SDK gelesene Hardwarewerte, auch wenn die PLC weiter Sollwerte liefert.
function kidHardware(RED,now=Date.now()){
    const rows=RED.nodes.getNode('ph_io_node')?.kidOutputRows?.() || [];
    const duty=Array(5).fill(null);
    let until=Infinity;
    for(const r of rows){
        if(!Number.isInteger(r.index) || r.index<0 || r.index>=5 || r.deviceState!=='online' ||
            r.quality!=='live' || r.actualServer!=='hub5000' || !Number.isFinite(r.lastRead) ||
            r.lastRead>now || r.lastRead+10000<=now || !Number.isFinite(r.value) || r.value<0 || r.value>100) continue;
        duty[r.index]=r.value/100;
        until=Math.min(until,r.lastRead+10000);
    }
    return {duty,until:Number.isFinite(until)?until:0,offline:rows.some(r=>r.deviceState==='offline')};
}
function register(http,RED){
    if(registered.has(http))return;
    registered.add(http);
    const monitor=fs.readFileSync(path.join(__dirname,'light-profile-curve.cjs'),'utf8').split('module.exports')[0] +
        fs.readFileSync(path.join(__dirname,'light-output-browser.mjs'),'utf8');
    http.get('/home-automation/light-output.mjs',(_req,res)=>{
        res.set('Cache-Control','no-cache').type('text/javascript').send(monitor);
    });
    http.get('/home-automation/georgszimmer/pwm',async(_req,res)=>{
        res.set('Cache-Control','no-store');
        try{
            res.json({duty:kidHardware(RED).duty});
        }catch{res.status(503).json({error:'Keine aktuellen PWM-Daten von PICENTER2.'});}
    });
}
module.exports={register,readKidOutputs,kidHardware};
