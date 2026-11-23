'use strict';
const {toDuty, interpolateDuty} = require('./light-profile-curve.cjs');

module.exports = RED => {
    if(RED.httpNode)require('./light-output-http.cjs').register(RED.httpNode);
    function LightProfile(config) {
        RED.nodes.createNode(this, config);
        const node = this, kitchen = config.adapter === 'controller';
        let lastBrightness=100;
        let profiles = {}, selected = '', scenes = [], active = '', lastStatus, revision, routines={};
        let position = [], timer, lastLevels, lastScene='', sceneLevels={}, catalogPending='';
        function syncCatalog(send){
            if(kitchen || !scenes.length)return;
            const entries=Object.values(profiles).filter(p=>p.levels);
            if(!entries.some(e=>JSON.stringify(e.levels)!==JSON.stringify(sceneLevels[e.name]))){catalogPending='';return;}
            const key=JSON.stringify(entries);
            if(key===catalogPending)return;
            catalogPending=key;
            send([{topic:'georgszimmer/set',payload:{type:'profileCatalog',entries}}]);
        }
        function view(error) {
            return {topic:'profile/view',payload:{profiles, selected, active, scenes, sceneLevels, routines, brightness:lastBrightness, duty:position, ready:Number.isInteger(revision), error}};
        }
        function stop(){clearInterval(timer);timer=null;}
        node.on('close', stop);
        function frame(values) {
            position = values;
            node.send([null,{...lastStatus,payload:{...lastStatus.payload,LedOutput:values}},{topic:'profile/output',payload:values},null,
                {topic:'light-profile/pwm',payload:{LedOutput:values}}]);
        }
        function transition(next, seconds) {
            stop();
            if (!position.length || !seconds) { frame(next);return; }
            const from=next.map((_,i)=>position[i] || 0), start=Date.now();
            timer=setInterval(()=>{
                const fraction=Math.min(1,(Date.now()-start)/(seconds*1000));
                frame(next.map((end,i)=>interpolateDuty(from[i],end,fraction)));
                if(fraction===1)stop();
            },40);
        }
        node.on('input',(msg,send,done)=>{
            try {
                const p=msg.payload || {};
                if(Array.isArray(p.plans) || p.health && !p.LedOutput){
                    if(revision===p.revision && !p.profileErrorRoom){done?.();return;}
                    revision=p.revision;
                    if(!p.rampProfiles){send([null,null,view(p.notice)]);done?.();return;}
                    const stored=p.rampProfiles[node.id] || {};
                    profiles=Object.fromEntries((stored.entries || []).map(e=>[e.name,e]));
                    selected=stored.selected || '';
                    syncCatalog(send);
                    send([null,null,view(p.profileErrorRoom===node.id?p.notice:null)]);
                } else if(msg.topic==='profile/scene'){
                    if(typeof p.name!=='string' || !p.name.trim() || p.name.length>100 || p.name in Object.prototype)throw Error('Ungültiger Szenenname.');
                    const name=p.name.trim(), count=Object.values(sceneLevels)[0]?.length;
                    if(!count || !Array.isArray(p.levels) || p.levels.length!==count || !p.levels.every(v=>Number.isFinite(v)&&v>=0&&v<=100))throw Error('Kanalwerte von 0 bis 100 eingeben.');
                    if(kitchen)send([{topic:'light-controller/dashboard',payload:{Command:'SaveScenario',ScenarioName:name,ScenarioProperties:Object.fromEntries(p.levels.map((v,i)=>[i+1,v]))}}]);
                    else if([profiles[name]?.levels,sceneLevels[name]].every(levels=>JSON.stringify(levels)===JSON.stringify(p.levels))){
                        send([null,null,view()]);
                    } else {
                        const seconds = routines[name] * 60;
                        const defaults = {enabled:!!seconds,onSeconds:seconds || 2,offSeconds:seconds ? (name==='Gute Nacht'?seconds:1) : 2};
                        send([null,null,null,{topic:'scheduler/manage',payload:{command:'SetRampProfile',revision,room:node.id,keepSelection:true,
                            profile:{...defaults,...profiles[name],name,levels:p.levels}}}]);
                    }
                } else if(msg.topic==='profile/save'){
                    if(!scenes.includes(p.name))throw Error('Bitte ein vorhandenes Profil wählen.');
                    send([null,null,null,{topic:'scheduler/manage',payload:{command:'SetRampProfile',revision,room:node.id,profile:p}}]);
                } else if(msg.topic==='profile/error'){
                    send([null,null,view(p.notice)]);
                } else if(msg.topic==='profile/list'){
                    send([null,null,view()]);
                } else if(kitchen ? Array.isArray(p.LedOutput) : Array.isArray(p.scenarios)){
                    lastBrightness=kitchen?p.DutyCycle:p.brightness;
                    scenes=kitchen?p.ScenarioList.map(s=>s.ScenarioName):p.scenarios;
                    active=(kitchen?p.ScenarioName:p.scenario) || '';
                    routines=p.routines || {};
                    if(active)lastScene=active;
                    sceneLevels=kitchen?Object.fromEntries(p.ScenarioList.map(s=>[s.ScenarioName,Array.from({length:p.OutputCount},(_,i)=>s.ScenarioProperties?.[i+1] || 0)])):p.sceneLevels || {};
                    syncCatalog(send);
                    const meta=msg.profileTransition;
                    if(kitchen){
                        lastStatus=msg;
                        const entry=profiles[active || lastScene];
                        const curved=meta ? meta.enabled : !!entry?.enabled;
                        const next=p.LedOutput.map(v=>curved?toDuty(v):v);
                        if(meta || !lastLevels || lastLevels.length!==next.length || p.LedOutput.some((v,i)=>v!==lastLevels[i])){
                            const powerChanged=lastLevels && lastLevels.some(Boolean)!==next.some(Boolean);
                            const implicit=powerChanged && entry?.enabled ? (next.some(Boolean)?entry.onSeconds:entry.offSeconds) : 0;
                            transition(next,meta?.seconds ?? implicit);
                        }
                        else send([null,{...msg,payload:{...p,LedOutput:position}}]);
                        lastLevels=p.LedOutput.slice();
                    } else send([null,msg]);
                    send([null,null,view()]);
                } else if(p.error){catalogPending='';send([null,msg,view(p.error)]);
                } else {
                    const a=msg.schedulerRequest?.action || (msg.topic==='scheduler/command'?p.action:p);
                    const type=a?.type || ({AllLightsOn:'on',AllLightsOff:'off',SelectScenario:'scenario',ScenarioApply:'scenario'}[p.Command]);
                    if(!['on','off','scenario'].includes(type)){send([msg]);done?.();return;}
                    const name=a.profile || (type==='scenario'?(a.value || p.ScenarioName):active || lastScene || selected);
                    const minutes=routines[name];
                    const defaults=typeof minutes==='number'?{enabled:true,onSeconds:minutes*60,offSeconds:name==='Gute Nacht'?minutes*60:1}:null;
                    const entry=Object.hasOwn(profiles,name)?profiles[name]:defaults;
                    const enabled=!!entry?.enabled && a.ramp!==false;
                    if(a.profile && !scenes.includes(a.profile))throw Error('Unbekanntes Lichtprofil.');
                    const seconds=enabled?(type==='off'?entry.offSeconds:entry.onSeconds):0;
                    if(kitchen){
                        msg.profileTransition={enabled:!!entry?.enabled,seconds};
                        if(type==='on' && (entry?.enabled || a.profile)){
                            msg.payload={Command:'SelectScenario',ScenarioName:name};
                            msg.profileOn=true;
                        } else if(msg.topic==='profile/test')msg.payload={Command:type==='on'?'AllLightsOn':'AllLightsOff'};
                    } else {
                        const action={...a,rampSeconds:seconds};
                        if(name==='Morgenwecker')action.pulseSeconds=entry?.pulseSeconds ?? 4;
                        if(defaults && !enabled)action.ramp=false;
                            if(msg.topic==='scheduler/command')msg.payload={...p,action};
                        else msg.payload=action;
                        if(msg.topic==='profile/test')msg.topic='georgszimmer/set';
                    }
                    send([msg]);
                }
                done?.();
            } catch(error){send([null,null,view(error.message)]);done?.(error);}
        });
    }
    RED.nodes.registerType('home-automation-light-profile',LightProfile);
};
