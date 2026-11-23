if (typeof msg.payload !== 'boolean') return null;
const channel = CHANNEL_INDEX;
const levels = global.get('georgszimmerPower') || [1,1,1,1,1];
const end = msg.payload ? levels[channel] : 0;
const settings = global.get('georgszimmerSceneSettings') || {};
const scene = settings.scenario;
const pulseMs = (settings.pulseSeconds ?? 4)*1000;
const effect = end > 0 && (scene === 'Kerzenlicht' || scene === 'Kaminfeuer' || scene === 'Morgenwecker') ? scene : null;
const running = context.get('timer');
if ((running || effect==='Morgenwecker') && end===context.get('target') && effect===context.get('effect') && msg.rampSeconds===undefined) return null;
if (running) clearInterval(running);
context.set('timer',null);
context.set('target',end);
context.set('effect',effect);
const start = context.get('position') ?? msg.previousPower?.[channel] ?? end;
const waking = effect === 'Morgenwecker' && !msg.skipRamp;
const duration = (msg.rampSeconds || (msg.smoothChange && !msg.skipRamp ? 1 : 0))*1000;
function frame(dutyCycle) {
    context.set('position',dutyCycle);
    // Genau der an setDutyCycle übergebene Wert, auch ohne angeschlossene LED.
    const outputs=global.get('georgszimmerPwmOutput') || Array(5).fill(null);
    outputs[channel]=dutyCycle;
    global.set('georgszimmerPwmOutput',outputs);
    return {topic:'setDutyCycle',payload:{dutyCycle}};
}
// Smoothly blend adjacent pseudorandom points. All channels share the slow
// movement of the fire, with an independent faster movement for each flame.
function drift(ms, period, seed) {
    const phase = ms / period;
    const index = Math.floor(phase);
    function sample(i) {
        let n = Math.imul(i ^ seed, 0x45d9f3b);
        n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
        return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    }
    const t = phase - index;
    return sample(index) + (sample(index + 1) - sample(index)) * t*t*(3-2*t);
}
function effectTarget(now) {
    if (!effect || effect==='Morgenwecker') return end;
    const gain = effect === 'Kerzenlicht'
        ? 0.80 + 0.14*drift(now,910,37) + 0.06*drift(now,260,channel+11)
        : 0.44 + 0.36*drift(now,1400,37) + 0.20*drift(now,330,channel+11);
    return interpolateDuty(0,end,gain);
}
const flicker=effect==='Kaminfeuer' || effect==='Kerzenlicht';
if (!flicker && (!duration || (start===end && !waking))) return frame(end);
const began=Date.now();
const timer=setInterval(()=>{
    const now=Date.now();
    const fraction=duration ? Math.min(1,(now-began)/duration) : 1;
    let goal=effectTarget(now);
    if(waking){
        // Langsamer, glatter Puls; der letzte Puls geht in Dauerlicht über.
        const remaining=Math.min(1, (1-fraction)*duration/pulseMs);
        const phase=(now-began)*2*Math.PI/pulseMs;
        goal=interpolateDuty(0,end,1-0.65*remaining*(1-Math.cos(phase))/2);
    }
    const blend=waking ? Math.min(1,(now-began)/Math.min(duration,1000)) : fraction;
    node.send(frame(interpolateDuty(start,goal,blend)));
    if(!flicker && fraction===1){clearInterval(timer);context.set('timer',null);}
},effect ? 80 : duration >= 60000 ? 200 : 40);
context.set('timer',timer);
return duration ? null : frame(effectTarget(began));
