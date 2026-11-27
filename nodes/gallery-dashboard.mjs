export function mount(s){
 const url='/home-automation/gallery',root=()=>document.getElementById('gallery-'+s.$id);let stopped=false,init=false,refreshId=0;
 s.form={place:'Sofa'};s.data={};s.ratings=['zu dunkel','angenehm','zu hell'];s.when=t=>new Date(t).toLocaleString('de-AT',{timeZone:'Europe/Vienna'});
 s.names=m=>(s.data.lights||[]).filter((v,i)=>m&(1<<i)).join(', ')||'alle aus';
 async function json(url,opts){const r=await fetch(url,{cache:'no-store',...opts});const j=await r.json();if(!r.ok)throw Error(j.error||'Anfrage fehlgeschlagen');return j;}
 s.areas=[{id:'oben',label:'Oben'},{id:'unten',label:'Unten'},{id:'gemeinsam',label:'Gemeinsam'}];
 s.playback=()=>({mode:s.form.mode,seconds:s.form.seconds,area:s.form.area});
 s.validPlayback=()=>!!s.data.config && Number.isInteger(s.form.seconds) && s.form.seconds>=2 && s.form.seconds<=3600;
 s.changed=()=>!!s.data.config&&(s.form.mode!==s.data.config.mode||s.form.seconds!==s.data.config.seconds||s.form.area!==s.data.config.area);
 async function refresh(){const request=++refreshId;try{const d=await json(url);if(stopped||request!==refreshId)return;s.$evalAsync(()=>{
 const follow=init&&!s.changed();
 s.data=d;
 if(!init||follow){s.form.mode=d.config.mode;s.form.seconds=d.config.seconds;s.form.area=d.config.area;}
 if(!init){init=true;Object.assign(s.form,{scheduled:!!d.config.scheduled,start:d.config.start_time,end:d.config.end_time});}if(!s.form.address)s.form.address=d.addresses.includes(location.hostname)?location.hostname:d.addresses[0];});}catch(e){if(!stopped)s.$evalAsync(()=>s.error=e.message);}}
 async function post(action,b){return json(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...b,action})});}
 s.act=async(a,b={})=>{s.working=true;s.error='';try{await post(a,b);await refresh();}catch(e){s.error=e.message;}finally{s.$evalAsync(()=>s.working=false);}};
 s.pair=async direct=>{s.error='';s.working=true;try{const d=await post('pair',{address:s.form.address});s.link=d;if(direct)location.assign(d.url);}catch(e){s.error=e.message;}finally{s.$evalAsync(()=>s.working=false);}};
 s.archive=async a=>{try{const d=await json(url+'/archive/'+a.id);s.$evalAsync(()=>s.detail=d);}catch(e){s.$evalAsync(()=>s.error=e.message);}};
 refresh();const timer=setInterval(()=>{if(root()?.getClientRects().length&&!document.hidden)refresh();},2200);
 s.$on('$destroy',()=>{stopped=true;clearInterval(timer);});
}
