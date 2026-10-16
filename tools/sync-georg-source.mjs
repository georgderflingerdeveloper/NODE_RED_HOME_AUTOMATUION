import fs from 'node:fs';
import path from 'node:path';
import {buildFlowFromSource,exportFlowSource,importFlowSource} from './flow-source/lib.mjs';
// Übernimmt den geprüften Laufzeitstand, behält vorhandene lesbare Dateinamen.
export function syncGeorgSource() {
 const root=path.resolve('flow-src');
 const before=buildFlowFromSource();
 const refs=new Map();
 for(const relative of new Set(Object.values(before.nodeFiles))) {
  for(const n of JSON.parse(fs.readFileSync(path.join(root,relative)))) {
   for(const [key,value] of Object.entries(n))if(value?.$flowSource)refs.set(n.id+':'+key,value.$flowSource);
  }
 }
 exportFlowSource();
 const after=buildFlowFromSource();
 for(const relative of new Set(Object.values(after.nodeFiles))) {
  const file=path.join(root,relative),nodes=JSON.parse(fs.readFileSync(file));
  for(const n of nodes)for(const [key,value] of Object.entries(n)) {
   const old=refs.get(n.id+':'+key);
   if(old&&value?.$flowSource&&old!==value.$flowSource) {
    fs.mkdirSync(path.dirname(path.join(root,old)),{recursive:true});
    fs.renameSync(path.join(root,value.$flowSource),path.join(root,old));
    n[key]={$flowSource:old};
   }
  }
  fs.writeFileSync(file,JSON.stringify(nodes,null,2)+'\n');
 }
 importFlowSource({write:true});
}
if(process.argv.includes('--run'))syncGeorgSource();
