'use strict';
const MINUTE=60000, DAY=1440*MINUTE;
const steps=[15,20,30,45,60,90,120,180,240,360,720,1440].map(n=>n*MINUTE);
const outcomes=['ok','offline','cloud_error','rate_limited','reported','unknown'];

function loadLearning(saved,start){
 if(saved===undefined)return {interval:start,events:[]};
 if(!Number.isSafeInteger(saved?.interval)||saved.interval<steps[0]||saved.interval>DAY||
    !Array.isArray(saved.events)||saved.events.some(e=>!Number.isSafeInteger(e?.at)||!Number.isSafeInteger(e.interval)||e.interval<=0||!outcomes.includes(e.outcome)))throw Error('Ungültiger Lernstand');
 return saved;
}

function observe(learning,outcome,now){
 const current=learning.interval;
 const events=learning.events.filter(e=>e.at>=now-30*DAY);
 events.push({at:now,interval:current,outcome});
 learning.events=events;
 if(outcome==='rate_limited'){
  learning.interval=steps.find(step=>step>current)??DAY;
  return;
 }
 const faster=steps.filter(step=>step<current).at(-1);
 if(outcome!=='ok'||!faster)return;
 // A confirmed throttle also counts against faster candidates for this window.
 if(events.some(e=>e.outcome==='rate_limited'&&e.interval>=faster))return;
 let first=events.length-1;
 while(first>0){
  const previous=events[first-1];
  if(previous.interval!==current||previous.outcome!=='ok'||events[first].at-previous.at>1.5*current)break;
  first--;
 }
 if(now-events[first].at>=3*DAY && events.length-first>=Math.max(6,Math.ceil(3*DAY/current*.9)))learning.interval=faster;
}

function summary(learning,now){
 const rates=new Map();
 for(const e of learning.events){
  if(e.at<now-30*DAY)continue;
  if(!rates.has(e.interval))rates.set(e.interval,{minutes:e.interval/MINUTE,ok:0,offline:0,cloud_error:0,rate_limited:0,reported:0,unknown:0});
  rates.get(e.interval)[e.outcome]++;
 }
 return [...rates.values()].sort((a,b)=>a.minutes-b.minutes);
}
module.exports={loadLearning,observe,summary};
