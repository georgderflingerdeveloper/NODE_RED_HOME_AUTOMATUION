const labels = {entry:'Vorraum',east:'Wohnzimmer Ost',west:'Wohnzimmer West',kitchen:'Küche',
    ante:'Vorhaus',upper:'Oben',bath:'Bad',wc:'WC',kid:'Georgszimmer',sissi:'Sissis Zimmer'};
const sharedSource = {upper:'ante',bath:'ante',wc:'ante'};
const pianteGroups = {piante_ante_group:'ante',piante_upper_group:'upper',piante_bath_group:'bath',piante_wc_group:'wc'};
const sourceOf = room => sharedSource[room] || room;
const layers = {host:'Rechner',application:'Anwendung',io:'I/O-System'};
const titles = {up:'Verbunden',down:'Keine Verbindung',unknown:'Unbestätigt',missing:'Nicht angebunden',error:'Fehler'};
const readings = new Map();
const badges = new Set();
let timer, openRoom, dialog;
function current(room,key) {
    const row=readings.get(sourceOf(room))?.checks?.[key];
    return row && row.until>performance.now() ? row :
        {state:'unknown',detail:'Keine aktuelle Rückmeldung.'};
}
function layerStatus(key,state,host) {
    if (state==='up') return 'Live';
    if (state==='error' || (state==='down' && key!=='host' && host==='up')) return 'Error';
    return 'Offline';
}
function roomStatus(room) {
    const host=current(room,'host').state;
    const states=Object.keys(layers).map(key=>layerStatus(key,current(room,key).state,host));
    if (states.includes('Error')) return 'Error';
    return states.every(status=>status==='Live') ? 'Live' : 'Offline';
}
function renderDialog() {
    if (!dialog?.open) return;
    for (const [key,name] of Object.entries(layers)) {
        const row=current(openRoom,key), el=dialog.querySelector('[data-layer="'+key+'"]');
        const status=layerStatus(key,row.state,current(openRoom,'host').state);
        el.dataset.status=status;
        const value=el.querySelector('.gh-status-value');
        if (value.textContent!==status) value.textContent=status;
        const text=titles[row.state]+' · '+row.detail;
        if (el.lastChild.textContent!==text) el.lastChild.textContent=text;
    }
}
function details(room) {
    if (!dialog) {
        dialog=document.createElement('dialog');
        dialog.className='gh-connection-dialog';
        dialog.setAttribute('aria-labelledby','gh-connection-title');
        dialog.innerHTML='<h2 id="gh-connection-title"></h2><dl></dl><button type="button" autofocus>Schließen</button>';
        for (const [key,name] of Object.entries(layers)) {
            const row=document.createElement('div');
            row.dataset.layer=key;
            row.append(document.createElement('dt'),document.createElement('dd'));
            row.firstChild.innerHTML='<span class="gh-signal-dot" aria-hidden="true"></span><span class="gh-status-value"></span>';
            row.firstChild.append(document.createTextNode(name));
            dialog.querySelector('dl').append(row);
        }
        dialog.querySelector('button').onclick=()=>dialog.close();
        dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
        document.body.append(dialog);
    }
    openRoom=room;
    dialog.querySelector('h2').textContent=labels[room]+' · Verbindungen';
    dialog.showModal();
    renderDialog();
}
async function refresh(room,state) {
    state.busy=true;

    try {
        const response=await fetch('/home-automation/room-live/'+room,{cache:'no-store',signal:AbortSignal.timeout(15000)});
        if (!response.ok) throw Error();
        const {checks}=await response.json();
        const received=performance.now();
        state.checks=Object.fromEntries(Object.entries(checks).map(([key,row])=>[key,{...row,until:received+row.remainingMs}]));
    } catch {state.checks={};}
    finally {state.next=performance.now()+4000;state.busy=false;tick();}
}
function tick() {
    for(const badge of badges) {
        if (badge.hasAttribute('data-piante') && !badge.hasAttribute('room')) {
            const group=badge.closest('ui-card-panel')?.getAttribute('node-id');
            if (pianteGroups[group]) badge.setAttribute('room',pianteGroups[group]);
        }
        const room=badge.getAttribute('room');
        if (!Object.hasOwn(labels,room)) continue;
        const text=roomStatus(room), button=badge.firstChild;
        badge.dataset.status=text;
        badge.dataset.live=String(text==='Live');
        if (button.querySelector('strong').textContent!==labels[room]) button.querySelector('strong').textContent=labels[room];
        const value=button.querySelector('.gh-status-value');
        if (value.textContent!==text) value.textContent=text;
        button.setAttribute('aria-label',text+' · '+labels[room]+' · Verbindungsdetails');
        const source=sourceOf(room);
        if (!readings.has(source)) readings.set(source,{next:0,busy:false});
        const state=readings.get(source);
        if (!document.hidden && (badge.getClientRects().length || (dialog?.open && openRoom===room)) &&
            !state.busy && performance.now()>=state.next) refresh(source,state);
    }
    renderDialog();
}
class RoomLive extends HTMLElement {
    connectedCallback(){
        if (!this.querySelector('button > .gh-condition:first-child')) {
            const button=document.createElement('button');
            button.type='button';
            button.setAttribute('aria-haspopup','dialog');
            button.innerHTML='<span class="gh-condition"><span class="gh-signal-dot" aria-hidden="true"></span><span class="gh-status-value"></span></span><strong></strong><i class="fa fa-info-circle" aria-hidden="true"></i>';
            this.replaceChildren(button);
        }
        // Angular kann bereits aufgebautes Markup klonen. Ereignisse bei jedem Einhängen binden.
        this.firstChild.onclick=()=>{
            const room=this.getAttribute('room');
            if (Object.hasOwn(labels,room)) details(room);
        };
        badges.add(this);
        if (!timer) timer=setInterval(tick,750);
        tick();
    }
    disconnectedCallback(){
        badges.delete(this);
        if (!badges.size) {clearInterval(timer);timer=null;dialog?.close();}
    }
}
if (!customElements.get('gh-room-live')) customElements.define('gh-room-live',RoomLive);
