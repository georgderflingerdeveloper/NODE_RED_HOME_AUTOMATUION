// Node-RED function on PICENTER2. Output 1 refreshes the existing PLC lamp links.
const levels = { Manuell: [100,100,100,100,100], Hell: [100,100,100,100,100],
    Abend: [35,35,20,20,20], Nacht: [5,0,0,0,0],
    Kerzenlicht: [42,42,42,42,42], Kaminfeuer: [72,72,72,72,72] };
// Inverse CIE L*: convert the combined perceptual lightness to relative luminance.
function pwmForLightness(lightness) {
    return lightness <= 8 ? lightness * 27 / 24389 : ((lightness + 16) / 116) ** 3;
}
// Laufzeit in Minuten. Der Profilmanager kann die Vorgaben pro Raum überschreiben.
const routines = {"Sanfter Morgen":20, "Morgenwecker":1, "Gute Nacht":20};
for(const name of Object.keys(routines)) levels[name]=[100,100,100,100,100];
const custom = context.get('sceneDefinitions') || global.get('georgszimmerSceneDefinitions') || {};
Object.assign(levels, custom);
const state = context.get("settings") || global.get("georgszimmerSceneSettings") || {brightness:100, scenario:"Manuell"};
const ff = global.get("FF0"), inputs = global.get("M0"), outputs = global.get("M1");
function respond(code, payload) {
    msg.statusCode = code;
    msg.payload = payload;
    msg.headers = {"Cache-Control":"no-store"};
    return [null,msg];
}
if(msg.req.method==='GET' && msg.req.query?.outputs==='1'){
    const duty=global.get('georgszimmerPwmOutput') || Array(5).fill(null);
    const night=Date.now() < (global.get('georgszimmerNightUntil') || 0);
    const profile=night ? 'Gute Nacht' : ff?.[0] ? state.scenario : null;
    return respond(200,{duty,profile});
}
if (![ff,inputs,outputs].every(Array.isArray) || ff.length < 3 || inputs.length < 2 || outputs.length < 2)
    return respond(503,{error:"PLC noch nicht bereit"});
let refresh = null;
if (msg.req.method === "POST") {
    const ip = String(msg.req.socket.remoteAddress).replace(/^::ffff:/,"");
    if (ip !== "192.168.0.149" || !msg.req.is("application/json"))
        return respond(403,{error:"Nur über Georgshome bedienbar"});
    const a = msg.payload || {};
    if (a.pulseSeconds !== undefined && (!Number.isFinite(a.pulseSeconds) || a.pulseSeconds < 2 || a.pulseSeconds > 60))
        return respond(400,{error:"Pulsdauer außerhalb 2–60 Sekunden"});
    if (a.rampSeconds !== undefined && (!Number.isFinite(a.rampSeconds) || a.rampSeconds < 0 || a.rampSeconds > 3600))
        return respond(400,{error:"Ungültige Rampenzeit"});
    const previousPower = ff[0] ? (global.get("georgszimmerPower") || levels[state.scenario].map(v=>pwmForLightness(v*state.brightness/100))) : [0,0,0,0,0];
    if(a.type==='profileCatalog'){
        if(!Array.isArray(a.entries) || !a.entries.every(e=>typeof e.name==='string' && e.name.length>0 && e.name.length<=100 && !(e.name in Object.prototype) && Array.isArray(e.levels) && e.levels.length===5 && e.levels.every(v=>Number.isFinite(v)&&v>=0&&v<=100)))
            return respond(400,{error:'Ungültige Szenendefinition'});
        const updated=Object.fromEntries(a.entries.map(e=>[e.name,e.levels]));
        context.set('sceneDefinitions',updated);
        global.set('georgszimmerSceneDefinitions',updated);
        Object.assign(levels,updated);
        return respond(200,{on:Boolean(ff[0]),brightness:state.brightness,scenario:state.scenario,scenarios:Object.keys(levels),sceneLevels:levels,routines});
    }
    const previousScene=state.scenario;
    const chosen=a.type==="scenario" ? a.value : a.profile || state.scenario;
    const routine=Object.hasOwnProperty.call(routines,chosen) ? chosen : null;
    const night=routine==="Gute Nacht" && ["on","off","scenario"].includes(a.type);
    let seconds=a.rampSeconds;
    if(seconds===undefined && routine && a.type!=="brightness")
        seconds=(a.type==="off" && !night) ? 1 : routines[routine]*60;
    const fadingToNight=Date.now() < (global.get("georgszimmerNightUntil") || 0);
    const wasLit=Boolean(ff[0]) || fadingToNight;
    function setPower(on) {
        ff[0]=on; ff[1]=false; ff[2]=false;
        inputs[1]=false; outputs[0]=on; outputs[1]=false;
        global.set("FF0",ff);global.set("M0",inputs);global.set("M1",outputs);
    }
    if (night) {
        // Wie ein zeitgesteuertes Aus: Die PLC fordert Aus, die PWM-Kanäle
        // blenden vom Istwert ab. Das nächste normale Ein nutzt die letzte Szene.
        setPower(false);
    } else switch (a.type) {
    case "scenario":
        if (!Object.hasOwnProperty.call(levels,a.value)) return respond(400,{error:"Unbekannte Szene"});
        state.scenario = a.value;
        if(fadingToNight)setPower(true);
        break;
    case "brightness":
        if (!Number.isFinite(a.value) || a.value < 0 || a.value > 100) return respond(400,{error:"Helligkeit außerhalb 0–100"});
        state.brightness = a.value;
        break;
    case "on": case "off":
        if (a.profile != null && a.type === "on") {
            if (!Object.hasOwnProperty.call(levels,a.profile)) return respond(400,{error:"Unbekannte Szene"});
            state.scenario=a.profile;
        }
        setPower(a.type==="on");
        break;
    default: return respond(400,{error:"Unbekannter Lichtbefehl"});
    }
    if(routine && !night && (a.type==="on" || a.type==="scenario") && ff[0])state.brightness=100;
    const wasRoutine=global.get("georgszimmerRoutine") || (Object.hasOwnProperty.call(routines,previousScene)?previousScene:null);
    global.set("georgszimmerRoutine",night ? chosen : (ff[0] && Object.hasOwnProperty.call(routines,state.scenario) ? state.scenario : null));
    if(!seconds && (wasRoutine || routine) && a.ramp!==false && a.rampSeconds!==0)seconds=1;
    global.set("georgszimmerNightUntil",night && wasLit && a.ramp!==false ? Date.now()+(seconds||0)*1000 : 0);
    if(a.pulseSeconds!==undefined)state.pulseSeconds=a.pulseSeconds;
    context.set("settings",state);
    global.set("georgszimmerSceneSettings",state);
    global.set("georgszimmerPower",levels[state.scenario].map(value => pwmForLightness(value * state.brightness / 100)));
    refresh = {topic:"DigOutState",payload:Boolean(ff[0]), rampSeconds:a.ramp===false ? 0 : seconds || 0, previousPower,
        smoothChange:!!(wasRoutine || routine) && a.ramp!==false, skipRamp:a.ramp===false};
}
const result = respond(200,{on:Boolean(ff[0]),brightness:state.brightness,scenario:state.scenario,scenarios:Object.keys(levels),sceneLevels:levels,routines});
result[0] = refresh;
return result;
