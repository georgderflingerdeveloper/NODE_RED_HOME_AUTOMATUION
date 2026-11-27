const formatTime=new Intl.DateTimeFormat('de-AT',{timeZone:'Europe/Vienna',dateStyle:'short',timeStyle:'medium'});
const time=t=>formatTime.format(t);
const num=(v,d=1)=>v.toLocaleString('de-AT',{maximumFractionDigits:d});
const kinds={lux:['Beleuchtungsstärke','lx'],camera:['Relative Bildhelligkeit','%'],manual:['Manuelle Bewertung','']};
function position(p){return 'Breite '+num(p.latitude,6)+'°, Länge '+num(p.longitude,6)+'° · Genauigkeit '+num(p.accuracy)+' m';}
function span(a,b,unit){return (a===b?num(a):num(a)+' bis '+num(b))+' '+unit;}
class PhoneDiagnostics extends HTMLElement{
 constructor(){
  super();this.attachShadow({mode:'open'});
  this.shadowRoot.innerHTML=`<style>
  :host{display:block;margin:.8rem 0;color:inherit;font:inherit} :host([hidden]){display:none}details{padding:.7em;border:1px solid var(--gh-border,#729184);border-radius:8px}summary{cursor:pointer;font-weight:600}label{display:inline-grid;gap:.25em;margin:.35em .6em .35em 0}select,input,button{font:inherit;color:inherit;background:var(--gh-inset,#20322d);border:1px solid var(--gh-border,#729184);border-radius:5px;padding:.35em;max-width:100%;box-sizing:border-box}h4{margin:1em 0 .35em}p{margin:.4em 0}small{display:block}article{border-top:1px solid var(--gh-border,#729184);padding:.5em 0}.plot{width:100%;height:70px;display:block}svg{background:var(--gh-inset,#20322d);border-radius:4px} .filters{display:flex;align-items:end;flex-wrap:wrap} [hidden]{display:none!important}
  </style><details><summary>Handy-Diagnose</summary><h4>Aktuelle Übertragung</h4><div id="live"></div><h4>Teach-Verlauf</h4>
  <div class="filters"><label>Zeitraum<select id="period"><option value="15">Letzte 15 Minuten</option><option value="60" selected>Letzte Stunde</option><option value="1440">Letzte 24 Stunden</option><option value="10080">Letzte 7 Tage</option><option value="custom">Datum wählen</option></select></label>
  <label id="dateBox" hidden>Kalendertag (Wien)<input id="day" type="date"></label></div><p id="issue" role="status"></p><small id="range"></small><div id="history"></div></details>`;
  const root=this.shadowRoot;this.box=root.querySelector('details');this.period=root.getElementById('period');this.day=root.getElementById('day');
  this.box.ontoggle=()=>{this.cancel();if(this.box.open)this.refresh();};
  this.period.onchange=()=>{root.getElementById('dateBox').hidden=this.period.value!=='custom';this.restart();};
  this.day.onchange=()=>this.restart();
 }
 connectedCallback(){if(this.box.open)this.restart();}
 disconnectedCallback(){this.cancel();}
 cancel(){clearTimeout(this.timer);this.revision=(this.revision||0)+1;}
 restart(){this.cancel();if(this.box.open)this.refresh();}
 bounds(){
  const to=Date.now();
  if(this.period.value!=='custom')return [to-Number(this.period.value)*60000,to];
  if(!this.day.value)return null;
  // Vienna midnight is unambiguous; calculate each boundary independently for DST.
  const midnight=t=>{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Vienna',hour:'2-digit',hourCycle:'h23'});return t-Number(parts.format(t))*3600000;};
  const utc=Date.parse(this.day.value+'T00:00Z');return [midnight(utc),midnight(utc+86400000)];
 }
 async refresh(){
  const revision=this.revision,area=id=>this.shadowRoot.getElementById(id);
  if(!this.isConnected||!this.box.open)return;
  try{
   const bounds=this.bounds();
   if(!bounds){area('history').replaceChildren();area('range').textContent='';area('issue').textContent='Bitte einen Kalendertag wählen.';return;}
   const [from,to]=bounds;
   if(from>Date.now())throw Error('Bitte einen vergangenen Tag oder den heutigen Tag wählen.');
   let d;
   if(this.requestData)d=await this.requestData(from,to);
   else{
    const phone=this.getAttribute('phone-id');if(!Number(phone))return;
    const res=await fetch('/home-automation/gallery/diagnostics?'+new URLSearchParams({phone,from,to}),{cache:'no-store'});
    d=await res.json();if(!res.ok)throw Error(d.error||'Diagnose nicht erreichbar.');
   }
   if(revision!==this.revision||!this.box.open)return;
   area('issue').textContent='';this.render(d);
  }catch(e){if(revision===this.revision){area('issue').textContent=e.message;area('live').replaceChildren();area('history').replaceChildren();area('range').textContent='';}}
  finally{if(this.isConnected&&this.box.open&&revision===this.revision)this.timer=setTimeout(()=>this.refresh(),4000);}
 }
 render(d){
  const root=this.shadowRoot,live=root.getElementById('live'),history=root.getElementById('history');
  function add(parent,tag,text){const n=document.createElement(tag);n.textContent=text;parent.append(n);return n;}
  const inspecting=history.contains(this.shadowRoot.activeElement);
  live.replaceChildren();const l=d.live;
  if(!l)add(live,'p',d.phone+' · Keine laufende Übertragung.');
  else{
   add(live,'p',d.phone+' · '+(d.now-l.at>15000?'Signal unterbrochen':'Verbunden')+' · Empfang seit '+time(l.since)+', zuletzt '+time(l.at));
   add(live,'p','Quelle: '+(kinds[l.kind]?.[0]||'unbekannt'));
   if(l.reading&&l.reading.kind===l.kind)add(live,'p',kinds[l.kind][0]+': '+num(l.reading.value)+' '+kinds[l.kind][1]+' · Messung '+time(l.reading.at)+(d.now-l.reading.at>15000?' · letzter bekannter Wert':''));
   else add(live,'p',l.kind==='manual'?'Bewertung per Tastendruck.':'Wartet auf den ersten Helligkeitswert.');
   add(live,'p',l.gps?'Standort: '+position(l.gps)+' · '+time(l.gps.at):l.gpsEnabled?'Standort gewählt · kein aktueller Positionswert im Lernschritt.':'Kein aktueller Standort übermittelt.');
  }
  // Keep keyboard and touch inspection stable while live readings continue to refresh.
  if(inspecting && this.shownPeriod===this.period.value+this.day.value)return;
  this.shownPeriod=this.period.value+this.day.value;history.replaceChildren();
  root.getElementById('range').textContent=time(d.from)+' bis '+time(d.to)+' (Wien) · '+num(d.count,0)+' archivierte Handy-Messwerte';
  if(!d.steps.length&&!d.count){add(history,'p','Für dieses Handy ist in diesem Zeitraum kein Lernschritt archiviert.');return;}
  for(const key of ['lux','camera']){
   const values=d.trend.filter(p=>p.kind===key);if(!values.length)continue;
   const [name,unit]=kinds[key],min=Math.min(...values.map(p=>p.low)),max=Math.max(...values.map(p=>p.high));
   add(history,'h4',name+' · '+span(min,max,unit));
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 600 70');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('class','plot');svg.setAttribute('aria-label',name+' im Zeitraum');svg.setAttribute('role','img');history.append(svg);
   for(const p of values){const dot=document.createElementNS(svg.namespaceURI,'circle');dot.setAttribute('cx',4+592*(p.at-d.from)/(d.to-d.from));dot.setAttribute('cy',max===min?35:62-54*(p.mean-min)/(max-min));dot.setAttribute('r','3');dot.setAttribute('fill',key==='lux'?'#58a888':'#cc9262');svg.append(dot);}
   const slider=add(history,'input','');slider.type='range';slider.min=0;slider.max=values.length-1;slider.value=values.length-1;slider.setAttribute('aria-label',name+' · Messfenster auswählen');const output=add(history,'small','');
   const show=()=>{const p=values[slider.value];output.textContent=time(p.at)+(p.last!==p.at?' bis '+time(p.last):'')+' · '+num(p.n,0)+' Messwert(e), Mittel '+num(p.mean)+' '+unit;};slider.oninput=show;show();
  }
  if(d.position)add(history,'p','Letzter Standort im Zeitraum: '+position(d.position)+' · '+time(d.position.at));
  for(const s of d.steps){const a=add(history,'article','');add(a,'b',time(s.at)+' – '+time(s.until_at)+' · '+s.place);add(a,'p','Licht: '+s.scene+' · Bewertung: '+(s.rating||'offen'));
   const metrics=[];for(const k of ['lux','camera'])if(s[k+'_min']!=null)metrics.push(kinds[k][0]+' '+span(s[k+'_min'],s[k+'_max'],kinds[k][1]));
   if(s.positions)metrics.push(s.positions+' Positionsmeldung(en)');add(a,'small',metrics.join(' · ')||'Keine Handy-Messwerte im gewählten Ausschnitt.');
   if(s.temperature!=null)add(a,'small','Wohnzimmer: '+num(s.temperature)+' °C · '+s.temp_source+' · Messung '+time(s.temp_at));
  }
  if(d.more)add(history,'p','Die letzten 50 Lichtschritte sind sichtbar. Für frühere Schritte einen Kalendertag wählen.');
 }
}
if(!customElements.get('phone-diagnostics'))customElements.define('phone-diagnostics',PhoneDiagnostics);
