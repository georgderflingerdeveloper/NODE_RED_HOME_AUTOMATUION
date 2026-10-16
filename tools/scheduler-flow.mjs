// Einzige Definition der zusätzlichen Nodes. Bestehende Nodes werden nicht ersetzt.
const schedulerFlow = 'schedulers_flow';
const kitchenFlow = 'light_controller_flow';
function functionNode(id, z, name, file, outputs, wires, x, y) {
    const folder = z === schedulerFlow ? 'schedulers--schedulers_flow' : 'light-controller--light_controller_flow';
    return { id, type:'function',z,name,func:{$flowSource:`flows/${folder}/functions/${file}`},outputs,timeout:0,noerr:0,initialize:'',finalize:'',libs:[],wires,x,y };
}
export function schedulerNodes() {
    return [
        {id:schedulerFlow,type:'tab',label:'SCHEDULERS',disabled:false,info:'Zeitpläne, Dashboard und geräteunabhängiger Link-Bus. Anleitung: docs/SCHEDULERS.md',env:[]},
        {id:'schedulers_ui_tab',type:'ui_tab',name:'Schedulers',icon:'schedule',order:20,disabled:false,hidden:false},
        {id:'schedulers_ui_group',type:'ui_group',name:'Zeitsteuerung',tab:'schedulers_ui_tab',order:1,disp:true,width:'18',collapse:false},
        {id:'scheduler_engine',type:'home-automation-scheduler',z:schedulerFlow,name:'Zeitpläne · speichern und entscheiden',x:530,y:160,wires:[['scheduler_commands_out','scheduler_room_router'],['scheduler_cron'],['scheduler_dashboard']]},
        {id:'scheduler_cron',type:'cronplus',z:schedulerFlow,name:'Zeitgeber · Europe/Vienna',outputField:'payload',timeZone:'Europe/Vienna',storeName:'',commandResponseMsgOutput:'output2',outputs:2,
            options:[{name:'scheduler-watchdog',topic:'scheduler/tick',payloadType:'default',expressionType:'cron',expression:'*/15 * * * * *'}],x:540,y:300,wires:[['scheduler_engine'],['scheduler_engine']]},
        {id:'scheduler_start',type:'inject',z:schedulerFlow,name:'Start · Zeitpläne wiederherstellen',props:[{p:'topic',vt:'str'},{p:'payload'}],topic:'scheduler/start',payload:'{}',payloadType:'json',once:true,onceDelay:2,repeat:'',crontab:'',x:220,y:80,wires:[['scheduler_engine']]},
        {id:'scheduler_commands_out',type:'link out',z:schedulerFlow,name:'Scheduler → Gerätebefehle',mode:'link',links:['scheduler_kitchen_commands'],x:815,y:100,wires:[]},
        {id:'scheduler_feedback_in',type:'link in',z:schedulerFlow,name:'Scheduler ← Registrierung / Bestätigung',links:['scheduler_kitchen_feedback'],x:225,y:160,wires:[['scheduler_engine']]},
        {id:'scheduler_dashboard',type:'ui_template',z:schedulerFlow,name:'Schedulers · Dashboard',group:'schedulers_ui_group',order:1,width:18,height:0,format:{$flowSource:'flows/schedulers--schedulers_flow/templates/schedulers-dashboard.html'},storeOutMessages:false,fwdInMessages:false,resendOnRefresh:true,templateScope:'local',x:850,y:220,wires:[['scheduler_engine']]},
        {id:'scheduler_catch',type:'catch',z:schedulerFlow,name:'Cron-Fehler sichtbar machen',scope:['scheduler_cron'],uncaught:false,x:240,y:380,wires:[['scheduler_error_topic']]},
        ...preparedRoomNodes(),
        {id:'scheduler_error_topic',type:'change',z:schedulerFlow,name:'Zeitgeberfehler',rules:[{t:'set',p:'topic',pt:'msg',to:'scheduler/cron-error',tot:'str'}],x:510,y:380,wires:[['scheduler_engine']]},
    ];
}
export function kitchenNodes() {
    return [
        {id:'scheduler_kitchen_commands',type:'link in',z:kitchenFlow,name:'Küche ← Scheduler-Befehle',links:['scheduler_commands_out'],x:170,y:660,wires:[['scheduler_kitchen_adapter']]},
        functionNode('scheduler_kitchen_adapter',kitchenFlow,'Scheduler · Küchenbefehle prüfen','scheduler-kitchen-command.js',2,[['lightcontrollerkitchen'],['scheduler_kitchen_feedback']],410,660),
        functionNode('scheduler_kitchen_status',kitchenFlow,'Scheduler · Küche registrieren / bestätigen','scheduler-kitchen-status.js',1,[['scheduler_kitchen_feedback']],750,740),
        {id:'scheduler_kitchen_feedback',type:'link out',z:kitchenFlow,name:'Küche → Scheduler-Rückmeldung',mode:'link',links:['scheduler_feedback_in'],x:1010,y:740,wires:[]},
        {id:'scheduler_kitchen_register',type:'inject',z:kitchenFlow,name:'Küche anmelden · Start / 60 s',props:[{p:'payload'},{p:'topic',vt:'str'}],topic:'scheduler/kitchen/register',payload:'{"Command":"ListScenarios"}',payloadType:'json',once:true,onceDelay:3,repeat:'60',crontab:'',x:320,y:580,wires:[['lightcontrollerkitchen']]},
    ];
}

// Freie Link-Enden für spätere Adapter. Keine Geräte werden vorab registriert.
export function preparedRoomNodes() {
    const rooms = [['kinderzimmer','Kinderzimmer'],['bad','Bad'],['wohnzimmer','Wohnzimmer']];
    return [
        {id:'scheduler_room_router',type:'switch',z:schedulerFlow,name:'Erweiterungen nach roomId',property:'payload.roomId',propertyType:'msg',rules:rooms.map(([id])=>({t:'eq',v:id,vt:'str'})),checkall:'true',repair:false,outputs:3,x:820,y:460,wires:rooms.map(([id])=>['scheduler_'+id+'_out'])},
        ...rooms.flatMap(([id,name],index)=>[
            {id:'scheduler_'+id+'_out',type:'link out',z:schedulerFlow,name:name+' → Gerätebefehle (hier verbinden)',mode:'link',links:[],x:1080,y:460+index*60,wires:[]},
            {id:'scheduler_'+id+'_in',type:'link in',z:schedulerFlow,name:name+' ← Registrierung / Bestätigung (hier verbinden)',links:[],x:220,y:460+index*60,wires:[['scheduler_engine']]}
        ])
    ];
}
