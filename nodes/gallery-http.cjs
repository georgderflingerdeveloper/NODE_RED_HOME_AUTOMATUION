'use strict';
const fs=require('node:fs'),path=require('node:path'),https=require('node:https'),crypto=require('node:crypto'),express=require('express');
const qr=require('qr-image');
const gallery=require('./gallery.cjs');
const hash=t=>crypto.createHash('sha256').update(t).digest('hex');
const token=()=>crypto.randomBytes(24).toString('base64url');
function sameOrigin(req,res,next){
 const origin=req.headers.origin;
 if(!req.is('application/json')||origin&&![`https://${req.get('host')}`,`http://${req.get('host')}`].includes(origin))return res.sendStatus(403);
 next();
}
function runtime(db,dir,warn){
 const manager=gallery.create(db,{temp:()=>gallery.temperature(path.join(dir,'homematic-ip/hmip_reader-history.sqlite'))});
 const certdir=path.join(dir,'gallery-https'),codes=new Map(),servers=[],addresses=new Set();
 const api=express();api.disable('x-powered-by');
 api.use((_req,res,next)=>{res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'});next();});
 api.get('/phone-diagnostics.js',(_req,res)=>res.sendFile(path.join(__dirname,'phone-diagnostics.mjs')));
 api.get('/handy',(_req,res)=>res.sendFile(path.join(__dirname,'gallery-phone.html')));
 function authenticate(req){
  const match=/^Bearer ([\w-]{32})$/.exec(req.get('authorization')||'');
  return match&&db.prepare('SELECT id,name FROM gallery_phone WHERE token_hash=?').get(hash(match[1]));
 }
 api.post('/sensor/:action',sameOrigin,express.json({limit:'8kb'}),async(req,res)=>{
  try{
   const b=req.body,id=authenticate(req);
   if(req.params.action==='pair'){
    const grant=codes.get(b.code),name=String(b.name||'').trim().slice(0,60);
    if(!grant||grant.until<Date.now())return res.status(403).json({error:'Kopplung abgelaufen. Neuen QR-Code öffnen.'});
    if(!name)return res.status(400).json({error:'Bitte einen Namen eingeben.'});
    codes.delete(b.code);
    const key=id?null:token(),phone=id?.id??Number(db.prepare('INSERT INTO gallery_phone(name,token_hash) VALUES(?,?)').run(name,hash(key)).lastInsertRowid);
    if(id)db.prepare('UPDATE gallery_phone SET name=? WHERE id=?').run(name,phone);
    manager.selectPaired(phone,grant.teach);return res.json({id:phone,name,key});
   }
   if(!id)return res.status(403).json({error:'Bitte dieses Handy erneut koppeln.'});
   if(req.params.action==='diagnostics')return res.json(manager.diagnostics(id.id,b.from,b.to));
   if(req.params.action==='info')return res.json(id);
   if(req.params.action==='teach'){
    return res.json(await manager.phoneCommand(id.id,b));
   }
   if(req.params.action==='readings')return res.json(manager.phone(id.id,b));
   return res.sendStatus(404);
  }catch(e){res.status(400).json({error:e.message});}
 });
 let fingerprint='';
 if(fs.existsSync(path.join(certdir,'addresses'))){
  try{
   const options={key:fs.readFileSync(path.join(certdir,'server.key')),cert:fs.readFileSync(path.join(certdir,'server.pem'))};
   fingerprint=new crypto.X509Certificate(fs.readFileSync(path.join(certdir,'ca.pem'))).fingerprint256;
   for(const addr of fs.readFileSync(path.join(certdir,'addresses'),'utf8').trim().split(/\s+/)){
    const server=https.createServer(options,api);servers.push(server);
    server.on('error',e=>{addresses.delete(addr);warn('Handy-HTTPS '+addr+': '+e.message);});
    server.listen(8443,addr,()=>addresses.add(addr));
   }
  }catch(e){warn('Handy-HTTPS: '+e.message);}
 }
 function pair(host,b){
  for(const [k,g] of codes)if(g.until<Date.now())codes.delete(k);
  const addr=b.address||host;if(!addresses.has(addr))throw Error('Bitte eine erreichbare Hausnetzadresse wählen.');
  const code=token(),until=Date.now()+300000;codes.set(code,{until,teach:manager.state().teach?.id||null});
  const url='https://'+addr+':8443/handy#'+code;
  return {url,until,qr:'data:image/png;base64,'+qr.imageSync(url,{size:5}).toString('base64')};
 }
 return {manager,db,addresses,fingerprint,certdir,pair,close(){for(const s of servers){s.close();s.closeAllConnections();}manager.close();}};
}
function register(http,get){
 const base='/home-automation/gallery';
 http.get(base,(req,res)=>{const r=get();if(!r)return res.sendStatus(503);
  res.set('Cache-Control','no-store').json({...r.manager.state(),addresses:[...r.addresses],fingerprint:r.fingerprint});});
 http.get(base+'/controls.html',(_req,res)=>res.set('Cache-Control','no-cache').sendFile(path.join(__dirname,'gallery-controls.html')));
 http.get(base+'/dashboard.js',(_req,res)=>res.set('Cache-Control','no-cache').type('application/javascript').sendFile(path.join(__dirname,'gallery-dashboard.mjs')));
 http.get(base+'/phone-diagnostics.js',(_req,res)=>res.set('Cache-Control','no-cache').sendFile(path.join(__dirname,'phone-diagnostics.mjs')));
 http.get(base+'/diagnostics',(req,res)=>{const r=get();if(!r)return res.sendStatus(503);
  try{res.set('Cache-Control','no-store').json(r.manager.diagnostics(Number(req.query.phone),Number(req.query.from),Number(req.query.to)));}
  catch(e){res.status(400).json({error:e.message});}
 });
 http.get(base+'/ca.crt',(_req,res)=>{const r=get();if(!r?.fingerprint)return res.sendStatus(404);res.type('application/x-x509-ca-cert').download(path.join(r.certdir,'ca.pem'),'GEORGSHOME-Handy-CA.crt');});
 http.get(base+'/archive/:id',(req,res)=>{const r=get();if(!r)return res.sendStatus(503);const id=Number(req.params.id);
  if(!Number.isSafeInteger(id)||id<1)return res.sendStatus(400);
  const step=r.db.prepare('SELECT s.*,t.place,p.name AS phone FROM gallery_step s JOIN gallery_teach t ON t.id=s.teach LEFT JOIN gallery_phone p ON p.id=t.phone WHERE s.id=?').get(id);
  if(!step)return res.sendStatus(404);
  res.set('Cache-Control','no-store').json({step,samples:r.db.prepare('SELECT at,kind,value,latitude,longitude,accuracy FROM gallery_sample WHERE step=? ORDER BY at,id').all(id)});});
 http.post(base,sameOrigin,express.json({limit:'4kb'}),async(req,res)=>{const r=get();if(!r)return res.sendStatus(503);
  try{if(req.body.action==='pair')return res.json(r.pair(req.hostname,req.body));
   await r.manager.command(req.body);res.json({ok:true});
  }catch(e){res.status(400).json({error:e.message});}
 });
}
module.exports={runtime,register};
