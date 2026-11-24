'use strict';
const MINUTE=60000;
const clock=new Intl.DateTimeFormat('de-AT',{timeZone:'Europe/Vienna',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function quantile(sorted,q){return sorted[Math.floor((sorted.length-1)*q)];}
function loadPatterns(samples,from,to){
    const bins=new Map();
    for(const r of samples){
        if(!r.online || !Number.isFinite(r.house_consumption_w) || r.house_consumption_w<0)continue;
        const t=Math.floor(Date.parse(r.observed_at)/MINUTE)*MINUTE;
        if(t<from||t>=to)continue;
        if(!bins.has(t))bins.set(t,[]);
        bins.get(t).push(r.house_consumption_w);
    }
    const points=[...bins].sort((a,b)=>a[0]-b[0]).map(([t,values])=>({t,w:quantile(values.sort((a,b)=>a-b),.5)}));
    const pct=Math.round(points.length/((to-from)/MINUTE)*100);
    if(pct<75)return ['Grundlast und Gerätefenster: Nur '+pct+' % der Minuten sind belegt. Die Daten reichen für eine Schätzung nicht aus.'];
    const base=quantile(points.map(p=>p.w).sort((a,b)=>a-b),.10);
    const notes=['Geschätzte Grundlast rund '+Math.round(base)+' W (unteres Zehntel der Minutenleistungen, '+pct+' % Minutenabdeckung).'];
    function find(label,low,high,min,max,spread){
        let run=[],hits=[];
        function finish(){
            if(run.length>=min && run.length<=max){
                const watts=run.map(p=>p.w-base).sort((a,b)=>a-b);
                const mid=quantile(watts,.5);
                if(quantile(watts,.9)-quantile(watts,.1)<=mid*spread)
                    hits.push({start:run[0].t,end:run.at(-1).t+MINUTE,mid,duration:run.length});
            }
            run=[];
        }
        for(const p of points){
            if(run.length && p.t-run.at(-1).t!==MINUTE)finish();
            if(p.w-base>=low && p.w-base<=high)run.push(p);else finish();
        }
        finish();
        const times=hits.sort((a,b)=>b.duration-a.duration).slice(0,3).sort((a,b)=>a.start-b.start);
        if(times.length)notes.push(label+': '+times.map(h=>clock.format(h.start)+'–'+clock.format(h.end)+' Uhr (ca. '+(h.mid/1000).toLocaleString('de-AT',{maximumFractionDigits:1})+' kW über Grundlast)').join(', ')+'.');
        return times.length;
    }
    const ev=find('Mögliche Autoladung, gleichmäßige Dauerlast',1800,23500,45,24*60,.19);
    const wash=find('Mögliche Heizphase einer Waschmaschine, auch bei Geschirrspüler oder Boiler üblich',1400,2900,5,23,.22);
    if(!ev)notes.push('Kein ausreichend gleichmäßiges längeres Lastfenster für eine Schätzung zur Autoladung.');
    if(!wash)notes.push('Keine klar abgrenzbare Heizphase für eine Schätzung zur Waschmaschine.');
    notes.push('Gerätezuordnung aus der Hausleistung ist mehrdeutig. Eine Heizphase bildet nur einen Teil eines Waschgangs ab.');
    return notes;
}
module.exports={loadPatterns};
