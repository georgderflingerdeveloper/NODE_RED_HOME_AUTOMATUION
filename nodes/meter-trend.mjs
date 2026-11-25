export function initMeterTrend(scope,device,initialMetric,interval,applyData,extraQuery=()=>({})) {
 if(scope.$$destroyed)return;
 scope.ranges=[{hours:1,label:'1 Stunde'},{hours:6,label:'6 Stunden'},{hours:24,label:'24 Stunden'},
  {hours:168,label:'7 Tage'},{hours:720,label:'30 Tage'}];
 scope.colors=['#69baff','#ffb86e','#64d8ac'];
 scope.metric=initialMetric;scope.hours=1;scope.connection={state:'loading'};

 const number=new Intl.NumberFormat('de-AT',{maximumFractionDigits:3});
 const stamp=new Intl.DateTimeFormat('de-AT',{timeZone:'Europe/Vienna',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
 scope.when=value=>value?stamp.format(new Date(value)):'—';
 scope.fmt=(v,unit)=>Number.isFinite(v)?number.format(v)+' '+unit:'—';
 const root=()=>document.getElementById(device+'-'+scope.$id);
 let controller,observer,disposed=false;
 function draw(){
  const canvas=root()?.querySelector('canvas'),data=scope.data;
  if(!canvas || !canvas.clientWidth)return;
  const w=canvas.clientWidth,h=canvas.clientHeight,ratio=window.devicePixelRatio||1;
  canvas.width=w*ratio;canvas.height=h*ratio;
  const ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);
  if(!data || !scope.hasValues)return;
  const values=data.points.flatMap(p=>data.columns.map(key=>p[key])).filter(Number.isFinite);
  let low=Math.min(...values),high=Math.max(...values);
  const pad=(high-low)*.06 || Math.max(.01,Math.abs(high)*.0001);
  low-=pad;high+=pad;
  const start=Date.parse(data.start),end=Date.parse(data.end);
  const x=t=>66+(t-start)/(end-start)*(w-78),y=v=>h-28-(v-low)/(high-low)*(h-50);
  const style=getComputedStyle(canvas);
  ctx.font='11px sans-serif';ctx.fillStyle=style.color;ctx.textAlign='left';ctx.fillText(scope.groups[data.metric].unit,4,13);
  for(let i=0;i<4;i++){
   const v=low+(high-low)*i/3,yy=y(v);
   ctx.textAlign='right';ctx.fillText(number.format(v),61,yy+3);
   ctx.strokeStyle=style.getPropertyValue('--gh-border')||'#555';ctx.beginPath();ctx.moveTo(66,yy);ctx.lineTo(w-12,yy);ctx.stroke();
  }
  for(let i=0;i<3;i++){
   const t=start+(end-start)*i/2;
   ctx.textAlign=['left','center','right'][i];
   ctx.fillText(new Date(t).toLocaleString('de-AT',scope.hours>24?{day:'2-digit',month:'2-digit',timeZone:'Europe/Vienna'}:{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Vienna'}),x(t),h-6);
  }
  data.columns.forEach((key,index)=>{
   let last=null;ctx.lineWidth=1.8;ctx.strokeStyle=ctx.fillStyle=scope.colors[index];
   for(const pt of data.points){
    if(!Number.isFinite(pt[key])){last=null;continue;}
    const xx=x(pt.time),yy=y(pt[key]);
    if(last && last.segment===pt.segment){ctx.beginPath();ctx.moveTo(x(last.time),y(last[key]));ctx.lineTo(xx,yy);ctx.stroke();}
    ctx.beginPath();ctx.arc(xx,yy,1.8,0,2*Math.PI);ctx.fill();last=pt;
   }
  });
 }
 scope.reload=async function(){
  controller?.abort();const active=new AbortController();controller=active;
  const query=new URLSearchParams({metric:scope.metric,hours:scope.hours,...extraQuery()});
  if(scope.until)query.set('end',new Date(scope.until).toISOString());
  try{
   const response=await fetch('/home-automation/'+device+'?'+query,{signal:active.signal,cache:'no-store'});
   if(!response.ok)throw Error();
   const data=await response.json();
   if(disposed || controller!==active)return;
   scope.$evalAsync(()=>{
    scope.data=data;scope.meterError='';scope.sample=data.latest;applyData(data);
    scope.connection=data.connection;
    scope.hasValues=data.points.some(p=>data.columns.some(key=>Number.isFinite(p[key])));
    requestAnimationFrame(draw);
   });
  }catch(err){if(!disposed && controller===active && err.name!=='AbortError')scope.$evalAsync(()=>{
   scope.meterError='Messarchiv nicht erreichbar.';scope.data=null;scope.connection={state:'unknown',lastSeen:scope.connection.lastSeen};requestAnimationFrame(draw);
  });}
 };
 scope.resetRange=()=>{scope.until=null;scope.reload();};
 scope.shift=dir=>{
  const next=(scope.until||Date.now())+dir*scope.hours*3600000;
  scope.until=next>=Date.now()-1000?null:next;scope.reload();
 };
 const init=setTimeout(()=>{
  const panel=root();if(!panel)return;
  observer=new ResizeObserver(draw);observer.observe(panel);scope.reload();
 },0);
 const timer=setInterval(()=>{if(root()?.getClientRects().length && !document.hidden)scope.reload();},interval);
 scope.$on('$destroy',()=>{disposed=true;clearTimeout(init);clearInterval(timer);controller?.abort();observer?.disconnect();});
}
