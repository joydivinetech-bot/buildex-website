import {verifyAdminSession} from './admin-auth.mjs';

const categories=['Flooring','Patios','Outdoor Kitchens','Concrete','Remodeling','Handyman','MEP','Other'];
const defaults={primaryPhone:'(832) 743-5009',secondaryPhone:'(832) 231-1684',email:'info@buildexconstructions.com',hours:'Monday–Saturday, 8 am–6 pm',serviceArea:'Houston, Sugar Land',heroEyebrow:'HOUSTON BUILT. PEOPLE FIRST.',heroTitleLine1:'From concept',heroTitleLine2:'to creation',heroDescription:'Thoughtful construction. Lasting craftsmanship.\nA better space to call your own.'};
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const str=(value,max=200)=>typeof value==='string'?value.trim().slice(0,max):'';
const validId=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const validEmail=value=>/^\S+@\S+\.\S+$/.test(value);
async function body(request,limit=30000){if(!request.headers.get('content-type')?.startsWith('application/json'))fail(415,'Expected JSON.');const raw=await request.text();if(raw.length>limit)fail(413,'Request is too large.');try{return JSON.parse(raw);}catch{fail(400,'Invalid request.');}}
async function ensure(db){await db.batch([
 db.prepare('CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,description TEXT NOT NULL,location TEXT NOT NULL,photos TEXT NOT NULL,updated_at INTEGER NOT NULL,status TEXT NOT NULL DEFAULT \'draft\',sort_order INTEGER NOT NULL DEFAULT 0)'),
 db.prepare('CREATE TABLE IF NOT EXISTS photos (key TEXT PRIMARY KEY,filename TEXT NOT NULL,mime TEXT NOT NULL,owner TEXT NOT NULL,project_id TEXT REFERENCES projects(id),created_at INTEGER NOT NULL)'),
 db.prepare('CREATE TABLE IF NOT EXISTS photo_data (key TEXT PRIMARY KEY,data TEXT NOT NULL)'),
 db.prepare('CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY,value TEXT NOT NULL)'),
 db.prepare('CREATE TABLE IF NOT EXISTS project_drafts (project_id TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at INTEGER NOT NULL)')
]);}
const decodeProject=row=>{let photos=[];try{photos=JSON.parse(row.photos)||[];}catch{}return {...row,photos};};
async function projects(db,all=false){
 const result=await db.prepare("SELECT * FROM projects"+(all?'':" WHERE status='published'")+" ORDER BY sort_order,updated_at DESC").all();
 const rows=result.results.map(decodeProject);
 if(!all)return rows;
 const drafts=(await db.prepare('SELECT * FROM project_drafts').all()).results;
 return rows.map(project=>{const draft=drafts.find(item=>item.project_id===project.id);return draft?{...project,...JSON.parse(draft.value),status:project.status,hasDraft:true,updated_at:draft.updated_at,published:project.status==='published'?project:null}:{...project,hasDraft:false,published:project.status==='published'?project:null};});
}
async function settings(db){const row=await db.prepare('SELECT value FROM settings WHERE id=?').bind('site').first();if(!row)return defaults;try{return {...defaults,...JSON.parse(row.value)};}catch{return defaults;}}
function cleanSettings(data){const value={
 primaryPhone:str(data.primaryPhone,60),secondaryPhone:str(data.secondaryPhone,60),email:str(data.email,200),hours:str(data.hours,200),serviceArea:str(data.serviceArea,150),
 heroEyebrow:str(data.heroEyebrow,100),heroTitleLine1:str(data.heroTitleLine1,80),heroTitleLine2:str(data.heroTitleLine2,80),heroDescription:str(data.heroDescription,300)
 };if(value.primaryPhone.replace(/\D/g,'').length<7||value.secondaryPhone&&value.secondaryPhone.replace(/\D/g,'').length<7||!validEmail(value.email)||!value.serviceArea||!value.heroTitleLine1||!value.heroTitleLine2)fail(400,'Complete the required website settings.');return value;}
const toBase64=bytes=>{let value='';for(let index=0;index<bytes.length;index+=32768)value+=String.fromCharCode(...bytes.subarray(index,index+32768));return btoa(value);};
const fromBase64=value=>{const binary=atob(value),bytes=new Uint8Array(binary.length);for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);return bytes;};
const removePhotos=(db,keys)=>keys.flatMap(key=>[
 db.prepare('DELETE FROM photo_data WHERE key=?').bind(key),
 db.prepare('DELETE FROM photos WHERE key=?').bind(key)
]);
async function removeRemotePhotos(env,keys){
 if(!env.MEDIA||!keys.length)return;
 try{await env.MEDIA.delete(keys);}catch{console.warn('Unused photo cleanup did not complete in object storage.');}
}
async function readUpload(request,env,user){const type=request.headers.get('content-type');if(!type?.startsWith('multipart/form-data;'))fail(415,'Expected a photo.');const form=await request.formData();const file=form.get('photo'),limit=env.MEDIA?8000000:1000000;if(!(file instanceof File)||!file.size||file.size>limit)fail(400,env.MEDIA?'Use a photo smaller than 8 MB.':'The prepared photo is too large. Choose a smaller image.');const image=new Uint8Array(await file.arrayBuffer());const jpeg=image[0]===255&&image[1]===216&&image[2]===255,png=[137,80,78,71,13,10,26,10].every((value,index)=>image[index]===value),webp=new TextDecoder().decode(image.slice(0,4))==='RIFF'&&new TextDecoder().decode(image.slice(8,12))==='WEBP';if(!jpeg&&!png&&!webp)fail(400,'Use JPG, PNG or WebP photos.');const extension=jpeg?'jpg':png?'png':'webp',mime=jpeg?'image/jpeg':png?'image/png':'image/webp',filename=crypto.randomUUID()+'.'+extension,key='projects/'+filename;if(env.MEDIA)await env.MEDIA.put(key,image,{httpMetadata:{contentType:mime}});try{await env.DB.batch([env.DB.prepare('INSERT INTO photos VALUES(?,?,?,?,?,?)').bind(key,filename,mime,user.email,null,Date.now()),...(env.MEDIA?[]:[env.DB.prepare('INSERT INTO photo_data(key,data) VALUES(?,?)').bind(key,toBase64(image))])]);}catch(error){if(env.MEDIA)await env.MEDIA.delete(key);throw error;}return {key,label:'Completed project'};}

export async function handlePublicSite(request,env){try{await ensure(env.DB);const url=new URL(request.url);if(url.pathname==='/api/projects'&&request.method==='GET')return json(await projects(env.DB));if(url.pathname==='/api/settings'&&request.method==='GET')return json(await settings(env.DB));if(url.pathname==='/api/media'&&['GET','HEAD'].includes(request.method)){const key=url.searchParams.get('key')||'',photo=await env.DB.prepare('SELECT photos.*,projects.status,projects.photos AS public_photos FROM photos LEFT JOIN projects ON projects.id=photos.project_id WHERE photos.key=?').bind(key).first();if(!photo)fail(404,'Photo not found.');const visible=photo.status==='published'&&JSON.parse(photo.public_photos||'[]').some(item=>item.key===key);if(!visible){try{await verifyAdminSession(request,env);}catch{fail(404,'Photo not found.');}}let payload,size;if(env.MEDIA){const object=await env.MEDIA.get(key);if(!object)fail(404,'Photo not found.');payload=object.body;size=object.size;}else{const stored=await env.DB.prepare('SELECT data FROM photo_data WHERE key=?').bind(key).first();if(!stored)fail(404,'Photo not found.');payload=fromBase64(stored.data);size=payload.byteLength;}return new Response(request.method==='HEAD'?null:payload,{headers:{'Content-Type':photo.mime,'Content-Length':String(size),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}fail(404,'Not found.');}catch(error){return json({error:error.status?error.message:'Unable to load website content.'},error.status||500);}}

export async function handleSiteAdmin(request,env,authorizer=verifyAdminSession){try{const url=new URL(request.url);if(url.origin!==env.ADMIN_ORIGIN)fail(404,'Not found.');const user=await authorizer(request,env);await ensure(env.DB);if(request.method==='POST'&&request.headers.get('origin')!==url.origin)fail(403,'Invalid request origin.');
 if(url.pathname==='/admin/api/media'&&['GET','HEAD'].includes(request.method)){const key=url.searchParams.get('key')||'',photo=await env.DB.prepare('SELECT mime FROM photos WHERE key=?').bind(key).first();if(!photo)fail(404,'Photo not found.');let payload,size;if(env.MEDIA){const object=await env.MEDIA.get(key);if(!object)fail(404,'Photo not found.');payload=object.body;size=object.size;}else{const stored=await env.DB.prepare('SELECT data FROM photo_data WHERE key=?').bind(key).first();if(!stored)fail(404,'Photo not found.');payload=fromBase64(stored.data);size=payload.byteLength;}return new Response(request.method==='HEAD'?null:payload,{headers:{'Content-Type':photo.mime,'Content-Length':String(size),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
 if(url.pathname==='/admin/api/site'&&request.method==='GET')return json({user,projects:await projects(env.DB,true),settings:await settings(env.DB),storageConfigured:true,storageMode:env.MEDIA?'r2':'database'});
 if(url.pathname==='/admin/api/projects/upload'&&request.method==='POST')return json(await readUpload(request,env,user),201);
 if(url.pathname==='/admin/api/settings'&&request.method==='POST'){const value=cleanSettings(await body(request));await env.DB.prepare('INSERT INTO settings(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').bind('site',JSON.stringify(value)).run();return json({ok:true,settings:value});}
 if(url.pathname!=='/admin/api/projects'||request.method!=='POST')fail(404,'Not found.');const data=await body(request);
 if(data.action==='reorder'){const all=await projects(env.DB,true);if(!Array.isArray(data.ids)||data.ids.length!==all.length||new Set(data.ids).size!==all.length||data.ids.some(id=>!all.some(project=>project.id===id)))fail(400,'Invalid project order.');if(all.length)await env.DB.batch(data.ids.map((id,index)=>env.DB.prepare('UPDATE projects SET sort_order=? WHERE id=?').bind(index,id)));return json({ok:true});}
 if(data.action==='delete'){if(!validId(data.id))fail(400,'Invalid project.');const stored=(await env.DB.prepare('SELECT key FROM photos WHERE project_id=?').bind(data.id).all()).results;await env.DB.batch([...stored.map(photo=>env.DB.prepare('DELETE FROM photo_data WHERE key=?').bind(photo.key)),env.DB.prepare('DELETE FROM photos WHERE project_id=?').bind(data.id),env.DB.prepare('DELETE FROM project_drafts WHERE project_id=?').bind(data.id),env.DB.prepare('DELETE FROM projects WHERE id=?').bind(data.id)]);if(stored.length&&env.MEDIA)await env.MEDIA.delete(stored.map(photo=>photo.key));return json({ok:true});}

 if(['discard','unpublish'].includes(data.action)){
  if(!validId(data.id))fail(400,'Invalid project.');
  const existing=await env.DB.prepare('SELECT * FROM projects WHERE id=?').bind(data.id).first();
  if(!existing)fail(404,'Project not found.');
  if(data.action==='discard'){
   const liveKeys=new Set(decodeProject(existing).photos.map(photo=>photo.key));
   const removed=(await env.DB.prepare('SELECT key FROM photos WHERE project_id=?').bind(data.id).all()).results.filter(photo=>!liveKeys.has(photo.key)).map(photo=>photo.key);
   await env.DB.batch([env.DB.prepare('DELETE FROM project_drafts WHERE project_id=?').bind(data.id),...removePhotos(env.DB,removed)]);
   await removeRemotePhotos(env,removed);
  }else{
   const draft=await env.DB.prepare('SELECT value FROM project_drafts WHERE project_id=?').bind(data.id).first();
   const value=draft?JSON.parse(draft.value):decodeProject(existing);
   await env.DB.batch([
    env.DB.prepare("UPDATE projects SET name=?,category=?,description=?,location=?,photos=?,status='draft',updated_at=? WHERE id=?").bind(value.name,value.category,value.description,value.location,JSON.stringify(value.photos),Date.now(),data.id),
    env.DB.prepare('DELETE FROM project_drafts WHERE project_id=?').bind(data.id)
   ]);
  }
  return json({ok:true});
 }
 if(data.action==='save'){
  const project=data.project;
  if(!project||!str(project.name,150)||!categories.includes(project.category)||!['draft','published'].includes(project.status)||typeof project.description!=='string'||project.description.length>3000||typeof project.location!=='string'||project.location.length>150||!Array.isArray(project.photos)||project.photos.length>20)fail(400,'Check the project details.');
  if(project.status==='published'&&!project.photos.length)fail(400,'Add at least one photo before publishing.');
  if(project.id&&!validId(project.id))fail(400,'Invalid project.');
  const id=project.id||crypto.randomUUID(),keys=new Set();
  const existing=await env.DB.prepare('SELECT * FROM projects WHERE id=?').bind(id).first();
  if(project.id&&!existing)fail(404,'This project no longer exists. Refresh the collection.');
  const draft=await env.DB.prepare('SELECT updated_at FROM project_drafts WHERE project_id=?').bind(id).first();
  if(project.expectedUpdatedAt!==undefined&&project.expectedUpdatedAt!==(draft?.updated_at??existing?.updated_at??0))fail(409,'This project changed in another session. Reopen it before saving.');
  for(const photo of project.photos){
   if(!photo||typeof photo.key!=='string'||!str(photo.label,150)||keys.has(photo.key))fail(400,'Use unique photos with descriptions.');
   const stored=await env.DB.prepare('SELECT project_id FROM photos WHERE key=?').bind(photo.key).first();
   if(!stored||stored.project_id&&stored.project_id!==id)fail(400,'A project photo is unavailable.');
   keys.add(photo.key);
  }
  const dimension=value=>Number.isInteger(value)&&value>0&&value<=30000?value:undefined;
  const value={name:str(project.name,150),category:project.category,description:str(project.description,3000),location:str(project.location,150),photos:project.photos.map(photo=>({key:photo.key,label:str(photo.label,150),width:dimension(photo.width),height:dimension(photo.height)})),status:project.status};
  // Accept byte counts as metadata only; upload limits are enforced against actual bytes.
  value.photos.forEach((photo,index)=>{const size=project.photos[index].bytes;photo.bytes=Number.isInteger(size)&&size>0&&size<=8000000?size:undefined;});
  const now=Math.max(Date.now(),(draft?.updated_at??existing?.updated_at??0)+1);
  const photoStatements=[...keys].map(key=>env.DB.prepare('UPDATE photos SET project_id=? WHERE key=?').bind(id,key));
  const statements=[];
  const keep=new Set(keys);
  if(existing?.status==='published'&&project.status==='draft')for(const photo of decodeProject(existing).photos)keep.add(photo.key);
  const removed=(await env.DB.prepare('SELECT key FROM photos WHERE project_id=?').bind(id).all()).results.filter(photo=>!keep.has(photo.key)).map(photo=>photo.key);
  if(existing?.status==='published'&&project.status==='draft'){
   // Private working copy: the public row and its media stay intact until Publish.
   statements.push(env.DB.prepare('INSERT INTO project_drafts(project_id,value,updated_at) VALUES(?,?,?) ON CONFLICT(project_id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(id,JSON.stringify(value),now));
  }else{
   const sortOrder=existing?.sort_order??(await env.DB.prepare('SELECT COUNT(*) count FROM projects').first()).count;
   statements.push(env.DB.prepare('INSERT INTO projects(id,name,category,description,location,photos,updated_at,status,sort_order) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,description=excluded.description,location=excluded.location,photos=excluded.photos,updated_at=excluded.updated_at,status=excluded.status').bind(id,value.name,value.category,value.description,value.location,JSON.stringify(value.photos),now,project.status,sortOrder));
   statements.push(env.DB.prepare('DELETE FROM project_drafts WHERE project_id=?').bind(id));
  }
  // The project row must exist before associating photos when foreign keys are enabled.
  await env.DB.batch([...statements,...photoStatements,...removePhotos(env.DB,removed)]);
  await removeRemotePhotos(env,removed);
  return json({ok:true,id,updated_at:now});
 }
 fail(400,'Unknown action.');
 }catch(error){return json({error:error.status?error.message:'Unable to complete the request.'},error.status||500);}}
