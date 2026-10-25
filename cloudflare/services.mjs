import {defaultServices} from '../public/services-content.js';
const reject=(status,message)=>{throw Object.assign(Error(message),{status});};
export async function serviceState(db){
 const row=await db.prepare('SELECT value FROM settings WHERE id=?').bind('services').first();
 return row?JSON.parse(row.value):{published:defaultServices,draft:null,version:0};
}
export async function saveServices(db,data){
 if(!data||typeof data!=='object')reject(400,'Invalid service request.');
 const current=await serviceState(db);
 if(data.version!==current.version)reject(409,'Services changed in another session. Refresh before saving.');
 if(!['draft','publish','discard'].includes(data.action))reject(400,'Invalid service action.');
 let collection=current.draft||current.published;
 if(data.action!=='discard'){
  if(!Array.isArray(data.services)||data.services.length>60)reject(400,'Use up to 60 services.');
  const ids=new Set();collection=[];
  for(const item of data.services){
   if(!item||typeof item.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(item.id)||ids.has(item.id)||typeof item.name!=='string'||!item.name.trim()||item.name.length>150||typeof item.description!=='string'||item.description.length>3000||!['estimate','flooring'].includes(item.link))reject(400,'Check service names and descriptions.');
   ids.add(item.id);let image;
   if(item.image?.key){
    if(typeof item.image.key!=='string'||!/^projects\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/.test(item.image.key))reject(400,'Choose an available service photo.');
    const stored=await db.prepare('SELECT project_id FROM photos WHERE key=?').bind(item.image.key).first();
    if(!stored||stored.project_id)reject(400,'Choose an available service photo.');
    image={key:item.image.key,alt:item.name.trim()};
   }else if(item.image?.src){
    // Only the original site illustrations may be reused as remote images.
    if(!defaultServices.some(service=>service.image.src===item.image.src))reject(400,'Upload the service photo instead of linking an external image.');
    image={src:item.image.src,alt:typeof item.image.alt==='string'?item.image.alt.slice(0,200):item.name.trim()};
   }else reject(400,'Add a photo to every service.');
   collection.push({id:item.id,name:item.name.trim(),description:item.description.trim(),image,link:item.link});
  }
 }
 const next={published:data.action==='publish'?collection:current.published,draft:data.action==='draft'?collection:null,version:current.version+1};
 // One compare-and-swap protects both the draft and published collection.
 let result;
 if(current.version===0)result=await db.prepare('INSERT INTO settings(id,value) VALUES(?,?) ON CONFLICT(id) DO NOTHING').bind('services',JSON.stringify(next)).run();
 else result=await db.prepare('UPDATE settings SET value=? WHERE id=? AND value=?').bind(JSON.stringify(next),'services',JSON.stringify(current)).run();
 if(Number(result.meta?.changes??result.changes)!==1)reject(409,'Services changed in another session. Refresh before saving.');
 return next;
}
