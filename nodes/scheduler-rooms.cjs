'use strict';

const locations = [
    ['haus','HAUS','home'], ['wohnzimmer','WOHNZIMMER','weekend'], ['kitchen','KÜCHE','kitchen'],
    ['vorhaus','VORHAUS','fa-sign-in'], ['oben','OBEN','fa-level-up'], ['bad','BAD','fa-tint'],
    ['wc','WC','wc'], ['kinderzimmer','KINDERZIMMER','child_care'], ['sissi','Sissis Zimmer','girl'],
];
function roomList(state) {
    return locations.map(([id, original, icon]) => ({id, original, icon, name:state.roomNames?.[id] || original}));
}
function requireValue(valid, message) { if (!valid) throw Error(message); }
function key(name) { return name.trim().toLocaleLowerCase('de-DE'); }
function usesScene(plan, name) {
    return plan.action.type === 'scenario' && plan.action.value === name ||
        ['on','off'].includes(plan.action.type) && plan.action.profile === name;
}
function manageRooms(state, p, matches) {
    if (p.command === 'RenameRoom') {
        const rooms = roomList(state), room = rooms.find(r => r.id === p.room);
        requireValue(room && typeof p.name === 'string', 'Bitte einen Raum auswählen.');
        const name = p.name.trim() || room.original;
        requireValue(name.length <= 60 && !/[\x00-\x1f]/.test(name), 'Der Raumname darf bis zu 60 Zeichen lang sein.');
        requireValue(!rooms.some(r => r.id !== p.room && key(r.name) === key(name)), 'Dieser Raumname ist bereits vergeben.');
        (state.roomNames ||= {})[room.id] = name;
        return 'Raumname gespeichert.';
    }
    const library = state.universalScenes || [];
    if (p.command === 'DeleteUniversalScene') {
        requireValue(library.some(s => s.name === p.name), 'Die Vorlage ist bereits gelöscht.');
        state.universalScenes = library.filter(s => s.name !== p.name);
        return 'Vorlage gelöscht. Die Raumkopien bleiben verfügbar.';
    }
    const target = state.targets.find(t => t.id === p.targetId && ['kid_profile','kitchen_profile'].includes(t.profileRoom));
    requireValue(target?.channels > 0, 'Der Zielraum hat noch keine LED-Kanäle gemeldet.');
    const kitchen = target.profileRoom === 'kitchen_profile';
    requireValue(!kitchen || !state.kitchenSceneJob, 'Die Küche bestätigt gerade eine Szenenänderung.');
    if(kitchen) delete state.kitchenSceneIssue;
    const rooms = state.rampProfiles ||= {};
    const room = rooms[target.profileRoom] || {selected:'',entries:[]};
    requireValue(kitchen || !state.kidSceneRemoval, 'Das Georgszimmer bestätigt gerade eine Löschung.');
    if (p.command === 'DeleteKitchenScene' || p.command === 'DeleteRoomScene') {
        requireValue((p.command!=='DeleteKitchenScene' || kitchen) && target.editableScenes?.includes(p.name), 'Nur eigene Raumszenen lassen sich löschen.');
        const plans = state.plans.filter(plan => matches(plan.target,target) && usesScene(plan,p.name));
        requireValue(!plans.length, 'Zuerst die verknüpften Zeitpläne ändern: ' + plans.map(plan => plan.name).join(', '));
        rooms[target.profileRoom] = {selected:room.selected === p.name ? '' : room.selected, entries:room.entries.filter(e=>e.name!==p.name)};
        if(kitchen) state.kitchenSceneJob = {command:'DeleteScenario',name:p.name};
        else state.kidSceneRemoval=p.name;
        return kitchen ? 'Löschen angefordert.' : 'Löschen angefordert. Ist die Szene im Georgszimmer ausgewählt, bitte zuerst eine andere Szene wählen.';
    }
    const source = state.targets.find(t => t.id === p.sourceId);
    const saved = p.sourceId === 'library' && library.find(s => s.name === p.scene);
    requireValue(saved || (source?.id !== target.id && source?.sceneLevels && Object.hasOwn(source.sceneLevels,p.scene)), 'Bitte eine verfügbare Quellszene wählen.');
    const levels = saved ? saved.levels : source.sceneLevels[p.scene];
    requireValue(Array.isArray(levels) && levels.length && levels.length<=16 && levels.every(v=>Number.isFinite(v)&&v>=0&&v<=100), 'Ungültige LED-Werte.');
    const name = String(p.name || p.scene).trim();
    requireValue(name.length && name.length<=100 && !(name in Object.prototype), 'Bitte einen gültigen Szenennamen eingeben.');
    requireValue(!target.scenarios.concat(room.entries.map(e=>e.name)).some(n=>key(n)===key(name)), 'Der Name ist im Zielraum bereits vergeben.');
    const ramp = saved || state.rampProfiles?.[source.profileRoom]?.entries.find(e=>e.name===p.scene);
    const recipe = {name,levels:levels.slice(),enabled:ramp?.enabled || false,onSeconds:ramp?.onSeconds ?? 2,offSeconds:ramp?.offSeconds ?? 2};
    const previous = library.find(s=>key(s.name)===key(name));
    const sameLevels = previous && Array.from({length:Math.max(previous.levels.length, levels.length)},
        (_,i)=>(previous.levels[i] ?? 0) === (levels[i] ?? 0)).every(Boolean);
    requireValue(!previous || (sameLevels && ['enabled','onSeconds','offSeconds'].every(k=>previous[k]===recipe[k])),
        'Eine andere Universalszene verwendet diesen Namen.');
    if (!previous) state.universalScenes = [...library,recipe];
    const adapted = Array.from({length:target.channels}, (_,i)=>levels[i] ?? 0);
    const entry = {name,enabled:recipe.enabled,onSeconds:recipe.onSeconds,offSeconds:recipe.offSeconds};
    if (kitchen) state.kitchenSceneJob = {command:'ImportScenario',name,levels:adapted,sourceLevels:levels.slice()};
    else entry.levels = adapted;
    rooms[target.profileRoom] = {...room,entries:[...room.entries,entry]};
    return 'Universalszene gespeichert. Die Übernahme wird am Raumkatalog geprüft.';
}
function confirmKitchenJob(state, target) {
    if (target.profileRoom==='kid_profile' && state.kidSceneRemoval && !target.scenarios.includes(state.kidSceneRemoval)) delete state.kidSceneRemoval;
    const job=state.kitchenSceneJob;
    if (!job || target.profileRoom!=='kitchen_profile') return;
    if(job.command==='ImportScenario' && job.levels.length!==target.channels && Number.isInteger(target.channels)) {
        job.levels=Array.from({length:target.channels},(_,i)=>job.sourceLevels?.[i] ?? job.levels[i] ?? 0);
    }
    const complete = job.command==='DeleteScenario' ? !target.scenarios.includes(job.name) :
        JSON.stringify(target.sceneLevels?.[job.name])===JSON.stringify(job.levels);
    if (complete) delete state.kitchenSceneJob;
    else if(job.command==='ImportScenario' && target.scenarios.some(n=>key(n)===key(job.name))) {
        state.kitchenSceneIssue='„'+job.name+'“ existiert bereits mit anderen Werten. Bitte die Vorlage unter neuem Namen übernehmen.';
        delete state.kitchenSceneJob;
    }
}
module.exports = {roomList, manageRooms, confirmKitchenJob, usesScene};
