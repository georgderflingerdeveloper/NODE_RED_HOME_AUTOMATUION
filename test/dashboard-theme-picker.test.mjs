import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function harness(initial='grays',blocked=false){
 const listeners=new Map(),data=new Map([['georgshome.dashboard.theme.v1',initial]]),attrs={};let destroy;
 const window={localStorage:{getItem(k){if(blocked)throw Error('blocked');return data.get(k);},setItem(k,v){if(blocked)throw Error('blocked');data.set(k,v);}},addEventListener(k,f){listeners.set(k,f);},removeEventListener(k){listeners.delete(k);},dispatchEvent(e){listeners.get(e.type)?.(e);}};
 const scope={$on(_,f){destroy=f;}};
 const source=fs.readFileSync('flow-src/flows/system--system_dashboard_flow/templates/dashboard-theme-global.html','utf8');
 vm.runInNewContext(source.match(/<script>([\s\S]*?)<\/script>/)[1],{window,document:{documentElement:{setAttribute(k,v){attrs[k]=v;}}},CustomEvent:class{constructor(type){this.type=type;}}});
 return {window,data,attrs,listeners,destroy:()=>window.GeorgDashboardTheme.dispose(),service:window.GeorgDashboardTheme};
}
test('Vier Designs anwenden, persistent speichern und beim Start wiederherstellen',()=>{
 const h=harness();for(const id of ['grays','dark','blues','greens']){h.service.apply(id,true);assert.equal(h.attrs['data-gh-theme'],id);assert.equal(h.data.get('georgshome.dashboard.theme.v1'),id);}
 assert.equal(harness(h.data.get('georgshome.dashboard.theme.v1')).service.current,'greens');h.destroy();assert.equal(h.listeners.size,0);
});
test('Ungültige Auswahl, blockierter Speicher und andere Browser-Tabs kontrolliert behandeln',()=>{
 const h=harness('unbekannt');assert.equal(h.service.current,'grays');h.listeners.get('storage')({key:'georgshome.dashboard.theme.v1',newValue:'blues'});assert.equal(h.service.current,'blues');
 h.listeners.get('storage')({key:null,newValue:null});assert.equal(h.service.current,'grays');
 const b=harness('dark',true);assert.match(b.service.warning,/nicht verfügbar/);b.service.apply('greens',true);assert.equal(b.service.current,'greens');assert.match(b.service.warning,/nur für diese Sitzung/);
});
test('Design-Menü sendet keine Steuerungsnachrichten und besitzt vier zugängliche Optionen',()=>{
 const source=fs.readFileSync('flow-src/flows/system--system_dashboard_flow/templates/dashboard-theme-picker.html','utf8');
 const h=harness('dark');let cleanup;const scope={$evalAsync(fn){fn();},$on(_,fn){cleanup=fn;}};
 vm.runInNewContext(source.match(/<script>([\s\S]*?)<\/script>/)[1],{scope,window:h.window});
 assert.equal(scope.themes.length,4);assert.equal(scope.selectedTheme,'dark');scope.chooseTheme('blues');assert.equal(h.service.current,'blues');assert.equal(scope.selectedTheme,'blues');assert.match(source,/aria-pressed/);assert.ok(!source.includes('scope.send'));cleanup();
 const f=JSON.parse(fs.readFileSync('flows.json'));assert.equal(f.find(n=>n.id==='gh_theme_tab').name,'Darstellung');assert.deepEqual(f.find(n=>n.id==='gh_theme_picker').wires,[[]]);
});

test('Globales Template startet ohne Angular-scope; Textflächen und Konturen bleiben dezent',()=>{
 const h=harness('blues');assert.equal(h.service.current,'blues');
 const source=fs.readFileSync('flow-src/flows/system--system_dashboard_flow/templates/dashboard-theme-global.html','utf8');
 assert.ok(!source.includes('scope.$on'));assert.ok(source.includes('background:transparent!important'));
 assert.ok(source.includes('service.dispose='));h.destroy();
});
