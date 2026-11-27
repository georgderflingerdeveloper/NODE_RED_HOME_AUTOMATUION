'use strict';
function diagnostics(db,id,from,to,now,live,lights){
 if(!Number.isSafeInteger(id)||!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<0||to<=from||to>now+86400000)throw Error('Ungültiger Diagnosezeitraum.');
 const phone=db.prepare('SELECT name FROM gallery_phone WHERE id=?').get(id);
 if(!phone)throw Error('Handy unbekannt.');
 const count=db.prepare('SELECT count(*) AS n FROM gallery_sample WHERE phone=? AND at>=? AND at<?').get(id,from,to).n;
 const width=Math.max(1,Math.ceil((to-from)/120));
 const trend=db.prepare(`SELECT kind,CAST((at-?)/? AS INTEGER) bucket,min(at) at,max(at) last,
    avg(value) mean,min(value) low,max(value) high,count(*) n
    FROM gallery_sample WHERE phone=? AND at>=? AND at<? AND kind IN ('lux','camera')
    GROUP BY kind,bucket ORDER BY at`).all(from,width,id,from,to);
 const steps=db.prepare(`WITH spans AS (
   SELECT s.*,t.place,t.end AS finished,coalesce((SELECT n.at FROM gallery_step n WHERE n.teach=s.teach AND n.id>s.id ORDER BY n.id LIMIT 1),t.end,?) until_at
   FROM gallery_teach t JOIN gallery_step s ON s.teach=t.id WHERE t.phone=? AND t.start<? AND coalesce(t.end,?)>=? AND s.at<?)
   SELECT s.*,count(p.id) samples,count(CASE WHEN p.kind='position' THEN 1 END) positions,
    min(CASE WHEN p.kind='lux' THEN p.value END) lux_min,max(CASE WHEN p.kind='lux' THEN p.value END) lux_max,
    min(CASE WHEN p.kind='camera' THEN p.value END) camera_min,max(CASE WHEN p.kind='camera' THEN p.value END) camera_max
    FROM spans s LEFT JOIN gallery_sample p ON p.step=s.id AND p.phone=? AND p.at>=? AND p.at<?
    WHERE s.until_at>=? GROUP BY s.id ORDER BY s.at DESC,s.id DESC LIMIT 51`).all(now,id,to,now,from,to,id,from,to,from);
 const position=db.prepare("SELECT at,latitude,longitude,accuracy FROM gallery_sample WHERE phone=? AND kind='position' AND at>=? AND at<? ORDER BY at DESC LIMIT 1").get(id,from,to);
 return {phone:phone.name,from,to,now,live,count,trend,position,more:steps.length>50,steps:steps.slice(0,50).map(s=>({...s,scene:lights.filter((_,i)=>s.mask&(1<<i)).map(l=>l.name).join(', ')||'alle aus'}))};
}
module.exports={diagnostics};
