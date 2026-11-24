'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFile}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {collectAsync,markdown,shiftDay,dueDay,localDate}=require('./daily-analysis.cjs');
const {names,periodFor,typeOf,nextAutomatic}=require('./analysis-periods.cjs');
const skillFile=path.join(__dirname,'skills/georgshome-tagesanalyse/SKILL.md');
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
const archivePattern=/^(?:woche-|monat-)?\d{4}-\d{2}-\d{2}$/;
function section(md,heading){
    const delim='## '+heading+'\n\n';
    const start=md.indexOf(delim);
    if(start===-1)return '';
    return md.slice(start+delim.length).split('\n\n## ')[0].trim();
}
function readView(key,md){
    const period=md.match(/^Zeitraum: ([\d-]+) bis ([\d-]+)$/m);
    const facts=(section(md,'Berechnete Tageskennzahlen')||section(md,'Berechnete Kennzahlen')).split('\n').filter(line=>line.startsWith('- ')).map(line=>line.slice(2));
    const topics=[{key:'energy',name:'Energie',lines:[]},{key:'cost',name:'Stromkosten',lines:[]},{key:'motion',name:'Bewegung',lines:[]}];
    for(const fact of facts){
        const index=/Bewegung|Meldungsärmstes|Meldungsarmes|Meldungen gespeichert/i.test(fact)?2:/Netzbezugskosten|bepreist|Energiekosten|ct.je|ct pro|ct\/kWh|Stromkosten/i.test(fact)?1:0;
        topics[index].lines.push(fact);
    }
    return {topics:topics.filter(t=>t.lines.length),key,day:period?period[1]+' bis '+period[2]:key,start:period?.[1]||key,through:period?.[2]||key,
        source:md.match(/^Auswertung: (.+)$/m)?.[1],summary:section(md,'Kurzfassung'),tip:section(md,'Praktischer Tipp'),insight:section(md,'Erkenntnis'),temperatures:section(md,'Temperaturprofile').split(/\n/).filter(Boolean).map(line=>line.replace(/^- /,'')),patterns:section(md,'Grundlast und mögliche Gerätezeiten')};
}
async function save(file,content){
    const tmp=file+'.'+randomUUID()+'.tmp';
    try{await fs.writeFile(tmp,content,{mode:0o600});await fs.rename(tmp,file);}
    finally{await fs.rm(tmp,{force:true});}
}
async function summarize(report,signal){
    const quotaCheck=process.env.GEORG_CODEX_QUOTA_CHECK;
    if(quotaCheck){
        await new Promise((resolve,reject)=>execFile(quotaCheck,[],{timeout:18000,signal,maxBuffer:4096},(err)=>{
            if(!err)return resolve();
            const paused=new Error('GPT pausiert wegen der Kontingentprüfung.');
            paused.code='QUOTA_PAUSED';reject(paused);
        }));
    }
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'georg-daily-'));
    try{
        const skill=await fs.readFile(skillFile,'utf8'), out=path.join(dir,'answer');
        const binary=process.env.GEORG_CODEX_BIN || path.join(os.homedir(),'.local/bin/codex');
        const args=['exec','--ephemeral','--ignore-user-config','--skip-git-repo-check','--sandbox','read-only','--disable','apps','--disable','plugins','--disable','shell_tool','--disable','unified_exec','-c','web_search="disabled"','-c','approval_policy="never"','-c','model_reasoning_effort="low"','-o',out,'-'];
        await new Promise((resolve,reject)=>{
            const child=execFile(binary,args,{cwd:dir,timeout:120000,signal,maxBuffer:256*1024},err=>err?reject(new Error('GPT-Aufruf fehlgeschlagen oder Zeitlimit erreicht.')):resolve());
            child.stdin.on('error',()=>{});
            child.stdin.end(skill+'\n\n'+names[report.period.type]+' '+report.day+'\n'+[...report.notes,report.tip,...report.patterns,...report.temperatures].join('\n'));
        });
        const result=(await fs.readFile(out,'utf8')).trim();
        if(!result || result.length>5000)throw Error('GPT lieferte keine verwendbare Kurzfassung.');
        return result;
    }finally{await fs.rm(dir,{recursive:true,force:true});}
}
module.exports=function(RED){
    let archive;
    RED.httpNode.get('/home-automation/daily-analysis/:date.md',(req,res)=>{
        if(!archive || !archivePattern.test(req.params.date))return res.sendStatus(404);
        const name=req.params.date+'.md';
        res.set('Cache-Control','no-store');
        res.download(path.join(archive,name),'GEORGSHOME-'+name,err=>{if(err&&!res.headersSent)res.sendStatus(err.statusCode||404);});
    });
    RED.httpNode.get('/home-automation/daily-analysis/:key.json',async(req,res)=>{
        const key=req.params.key;
        if(!archive || !archivePattern.test(key))return res.sendStatus(404);
        try{
            const md=await fs.readFile(path.join(archive,key+'.md'),'utf8');
            res.set('Cache-Control','no-store').json(readView(key,md));
        }catch(e){res.sendStatus(e.code==='ENOENT'?404:500);}
    });
    function DailyAnalysis(config){
        RED.nodes.createNode(this,config);
        const node=this, dir=path.join(RED.settings.userDir,'daily-analysis');
        const db=path.resolve(RED.settings.userDir,config.databasePath);
        archive=dir;
        const abort=new AbortController(), pendingFile=path.join(dir,'auswertung-ausstehend');
        let first,pending,active=false,closed=false,issue='',busyDay='',timer;
        const dates=new Map(),latestByType={},manualQueue=new Set();
        const emit=()=>{if(!closed)node.send({payload:{latest:latestByType.day,latestByType,days:[...dates.keys()].sort().reverse(),busy:active,day:busyDay,issue}});};
        function record(key,md){
            const view=readView(key,md),type=typeOf(key);
            dates.set(key,view.through);
            if(!latestByType[type] || latestByType[type].key<=key)latestByType[type]=view;
        }
        async function restore(){
            const files=(await fs.readdir(dir)).filter(f=>f.endsWith('.md') && archivePattern.test(f.slice(0,-3))).sort().reverse();
            for(const f of files){
                const key=f.slice(0,-3),type=typeOf(key);
                if(type==='day' && latestByType.day)dates.set(key,key);
                else record(key,await fs.readFile(path.join(dir,f),'utf8'));
            }
        }
        async function run(manualType){
            if(closed)return;
            if(active){
                if(manualType && periodFor(manualType,shiftDay(localDate.format(Date.now()),-1)).key!==busyDay)manualQueue.add(manualType);
                emit();return;
            }
            active=true;
            try{
                const target=manualType?periodFor(manualType,shiftDay(localDate.format(Date.now()),-1)):pending||nextAutomatic(first,dueDay(Date.now()),dates);
                if(!target)return;
                busyDay=target.key;issue='';emit();
                node.status({fill:'blue',shape:'dot',text:names[target.type]+' '+target.start});
                const report=await collectAsync(db,target,config.cloudSiteId||process.env.SOLAREDGE_SITE_ID||'',abort.signal,path.join(RED.settings.userDir,'homematic-ip','hmip_reader-history.sqlite'));
                if(closed)return;
                const file=path.join(dir,target.key+'.md'),fallback=report.notes.join('\n\n');
                const hadReport=dates.has(target.key);
                await save(pendingFile,JSON.stringify(target));pending=target;
                const local=markdown(report,fallback,'Lokale Kennzahlen');
                // Store measured results first, including an updated partial period.
                // Preserve a successful summary on an unsuccessful retry of the same interval.
                const sameInterval=hadReport && dates.get(target.key)===target.through;
                if(!sameInterval)await save(file,local);
                if(report.hasData){
                    try{
                        const answer=await summarize(report,abort.signal);
                        if(!closed)await save(file,markdown(report,answer,'GPT · georgshome-tagesanalyse'));
                    }catch(error){
                        if(!closed){
                            issue=(error.code==='QUOTA_PAUSED'?'GPT pausiert wegen der Kontingentprüfung. ':'GPT-Auswertung nicht verfügbar. ')+(sameInterval?'Der vorhandene Bericht ist verfügbar.':'Die aktuellen Kennzahlen sind gespeichert.');
                            if(sameInterval){
                                const prior=readView(target.key,await fs.readFile(file,'utf8'));
                                await save(file,prior.source?.startsWith('GPT ·')?markdown(report,prior.summary,prior.source):local);
                            }
                        }
                    }
                }else await save(file,local);
                if(!closed){
                    record(target.key,await fs.readFile(file,'utf8'));
                    await fs.rm(pendingFile,{force:true});pending=null;
                }
            }catch(err){if(!closed){issue='Auswertung fehlgeschlagen: '+err.message;node.warn(issue);}}
            finally{
                const changed=Boolean(busyDay||issue);active=false;busyDay='';
                if(!closed && manualQueue.size){
                    const [next]=manualQueue;manualQueue.delete(next);run(next);
                }else if(!closed&&changed){node.status({fill:issue?'yellow':'green',shape:'dot',text:issue?'Hinweis':'bereit'});emit();}
            }
        }
        const ready=(async()=>{
            await fs.mkdir(dir,{recursive:true,mode:0o700});
            const marker=path.join(dir,'erster-berichtstag');
            try{await fs.writeFile(marker,dueDay(Date.now()),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
            first=(await fs.readFile(marker,'utf8')).trim();
            if(!datePattern.test(first))throw Error('Startdatum im Archiv ist ungültig.');
            try{
                const raw=(await fs.readFile(pendingFile,'utf8')).trim();
                pending=datePattern.test(raw)?periodFor('day',raw):JSON.parse(raw);
                const checked=periodFor(pending.type,pending.through);
                if(!datePattern.test(pending.through)||checked.key!==pending.key)throw Error('Ungültiger offener Berichtsauftrag.');
                pending=checked;
            }catch(e){if(e.code!=='ENOENT')throw e;}
            await restore();emit();
        })();
        ready.then(()=>{if(!closed){timer=setInterval(()=>run(),60000);run();}}).catch(e=>{issue=e.message;emit();node.error(e.message);});
        node.on('input',async msg=>{
            try{await ready;if(msg.topic==='daily/run' && Object.hasOwn(names,msg.period||'day'))await run(msg.period||'day');else emit();}catch(e){issue=e.message;emit();}
        });
        node.on('close',()=>{closed=true;clearInterval(timer);abort.abort();if(archive===dir)archive=null;});
    }
    RED.nodes.registerType('home-automation-daily-analysis',DailyAnalysis);
};
