const id = "georgszimmer-light";
const p = msg.payload;
const ok = msg.statusCode === 200 && p && typeof p.on === "boolean" &&
    Number.isFinite(p.brightness) && Array.isArray(p.scenarios) && p.scenarios.includes(p.scenario);
const error = msg.error?.message || p?.error || "PICENTER2 nicht erreichbar";
const feedback = [];
if (ok) feedback.push({topic:"scheduler/register",payload:{id,name:"Georgszimmer · Raumlicht",
    room:"kinderzimmer",kind:"light",groups:["indoor"],actions:["on","off","brightness","scenario"],profileRoom:"kid_profile",channels:5,editableScenes:p.scenarios.filter(name=>!["Manuell","Hell","Abend","Nacht","Kerzenlicht","Kaminfeuer",...Object.keys(p.routines || {})].includes(name)),sceneLevels:p.sceneLevels,scenarios:p.scenarios}});
if (msg.requestId) feedback.push({topic:"scheduler/ack",payload:{targetId:id,requestId:msg.requestId,
    ok:Boolean(ok),text:ok ? "PICENTER2 hat den Lichtbefehl angenommen" : error}});
return [{payload:ok ? p : {error}},feedback];
