import {verifyAccess} from './access.mjs';
const categories=['Flooring','Patios','Outdoor Kitchens','Concrete','Remodeling','Handyman','MEP','Other'];
const defaults={phone:'(832) 743-5009',email:'hello@buildex.example.com',hours:'Mon–Fri, 8 am–6 pm · Sat, 9 am–2 pm'};
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const str=(v,max=200)=>typeof v==='string'?v.trim().slice(0,max):'';
const validEmail=s=>/^\S+@\S+\.\S+$/.test(s);
const validId=s=>typeof s==='string'&&/^[a-f0-9-]{36}$/.test(s);
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function bytes(request,limit){const reader=request.body?.getReader();if(!reader)return new Uint8Array();const chunks=[];let size=0;while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();fail(413,'Upload is too large.');}chunks.push(value);}const out=new Uint8Array(size);let offset=0;for(const c of chunks){out.set(c,offset);offset+=c.length;}return out;}
async function body(request){if(!request.headers.get('content-type')?.startsWith('application/json'))fail(415,'Expected JSON.');try{return JSON.parse(new TextDecoder().decode(await bytes(request,20000)));}catch(e){if(e.status)throw e;fail(400,'Invalid request.');}}
export async function handle(request,env){
 const url=new URL(request.url),route=url.pathname,db=env.DB;
 const query=(sql,...args)=>db.prepare(sql).bind(...args);
 const projects=async(all=false)=>(await query("SELECT * FROM projects"+(all?'':" WHERE status='published'")+" ORDER BY sort_order,updated_at DESC").all()).results.map(p=>({...p,photos:JSON.parse(p.photos)}));
 const settings=async()=>{const row=await query('SELECT value FROM settings WHERE id=?','contact').first();return row?JSON.parse(row.value):defaults;};
 const admin=async()=>{if(url.origin!==env.ADMIN_ORIGIN)fail(404,'Not found.');return verifyAccess(request,env);};
 async function rate(key,limit,windowMs){const now=Date.now();const row=await query('INSERT INTO rate_limits(id,count,expires) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=CASE WHEN expires<=? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<=? THEN ? ELSE expires END RETURNING count',key,now+windowMs,now,now,now+windowMs).first();if(row.count>limit)fail(429,'Too many requests. Please try later.');await query('DELETE FROM rate_limits WHERE expires<?',now-windowMs).run();}
 try{
  if(!['GET','HEAD','POST'].includes(request.method))fail(405,'Method not allowed.');
  if(request.method==='POST'&&request.headers.get('origin')!==url.origin)fail(403,'Request origin is not allowed.');
  if(route==='/api/auth'){const user=await admin();return json({user,configured:true,provider:'cloudflare-access'});}
  if(route==='/api/login')fail(401,'Use Cloudflare Access to sign in.');
  if(route==='/api/logout'){await admin();return json({ok:true,redirect:'/cdn-cgi/access/logout'});}
  if(route==='/api/projects'&&request.method==='GET')return json(await projects());
  if(route==='/api/settings'&&request.method==='GET')return json(await settings());
  if(route==='/api/media'&&['GET','HEAD'].includes(request.method)){
   const photo=await query('SELECT photos.*,projects.status FROM photos LEFT JOIN projects ON projects.id=photos.project_id WHERE photos.key=?',url.searchParams.get('key')||'').first();if(!photo)fail(404,'Photo not found.');
   if(photo.status!=='published'){try{await admin();}catch{fail(404,'Photo not found.');}}
   const object=await env.MEDIA.get(photo.key);if(!object)fail(404,'Photo not found.');
   // Check publication every request; do not retain private content in shared caches after unpublishing.
   return new Response(request.method==='HEAD'?null:object.body,{headers:{'Content-Type':photo.mime,'Content-Length':String(object.size),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }
  if(route==='/api/inquiries'&&request.method==='POST'){
   if(url.origin!==env.PUBLIC_ORIGIN)fail(403,'Use the public website.');
   await rate('inquiry:'+(request.headers.get('CF-Connecting-IP')||'unknown'),10,900000);const d=await body(request);
   if(d.website||!str(d.name,150)||str(d.phone,30).replace(/\D/g,'').length<7||!validEmail(str(d.email))||!str(d.service)||!str(d.description,5000)||!['estimate','contact'].includes(d.kind))fail(400,'Complete the required fields.');
   if(d.kind==='estimate'&&(!str(d.address,500)||!['Residential','Commercial'].includes(d.propertyType)))fail(400,'Include a property address and type.');
   const details=Object.fromEntries(['description','address','propertyType','size','startDate','budget'].map(k=>[k,str(d[k],k==='description'?5000:500)]));
   const id=crypto.randomUUID();await query('INSERT INTO inquiries VALUES(?,?,?,?,?,?,?,?)',id,d.kind,str(d.name,150),str(d.phone,30),str(d.email),str(d.service),JSON.stringify(details),Date.now()).run();return json({ok:true,id},201);
  }
  if(route==='/api/admin'){
   const user=await admin();
   if(request.method==='GET')return json({projects:await projects(true),settings:await settings(),inquiries:(await query('SELECT * FROM inquiries ORDER BY created_at DESC LIMIT 500').all()).results.map(i=>({...i,details:JSON.parse(i.details)}))});
   if(request.method!=='POST')fail(405,'Method not allowed.');
   if(url.searchParams.get('action')==='upload'){
    await rate('upload:'+user.email,60,900000);const type=request.headers.get('content-type');if(!type?.startsWith('multipart/form-data;'))fail(415,'Expected a photo.');const raw=await bytes(request,8500000);let form;try{form=await new Response(raw,{headers:{'Content-Type':type}}).formData();}catch{fail(400,'Invalid upload.');}
    const file=form.get('photo');if(!(file instanceof File)||!file.size||file.size>8000000)fail(400,'Use a photo smaller than 8 MB.');const image=new Uint8Array(await file.arrayBuffer());
    const jpeg=image[0]===255&&image[1]===216&&image[2]===255,png=[137,80,78,71,13,10,26,10].every((v,i)=>image[i]===v),webp=new TextDecoder().decode(image.slice(0,4))==='RIFF'&&new TextDecoder().decode(image.slice(8,12))==='WEBP';if(!jpeg&&!png&&!webp)fail(400,'Use JPG, PNG or WebP photos.');
    const ext=jpeg?'jpg':png?'png':'webp',mime=jpeg?'image/jpeg':png?'image/png':'image/webp',filename=crypto.randomUUID()+'.'+ext,key='projects/'+filename;
    await env.MEDIA.put(key,image,{httpMetadata:{contentType:mime}});try{await query('INSERT INTO photos VALUES(?,?,?,?,?,?)',key,filename,mime,user.email,null,Date.now()).run();}catch(e){await env.MEDIA.delete(key);throw e;}return json({key,label:'Completed project'},201);
   }
   const data=await body(request);
   if(data.action==='settings'){const phone=str(data.phone,60),email=str(data.email),hours=str(data.hours,500);if(phone.replace(/\D/g,'').length<7||!validEmail(email)||!hours)fail(400,'Enter valid contact information.');await query('INSERT INTO settings VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value','contact',JSON.stringify({phone,email,hours})).run();return json({ok:true});}
   if(data.action==='reorder'){const all=await projects(true);if(!Array.isArray(data.ids)||data.ids.length!==all.length||new Set(data.ids).size!==all.length||data.ids.some(id=>!all.some(p=>p.id===id)))fail(400,'Invalid order.');if(all.length)await db.batch(data.ids.map((id,index)=>query('UPDATE projects SET sort_order=? WHERE id=?',index,id)));return json({ok:true});}
   if(data.action==='delete'){if(!validId(data.id))fail(400,'Invalid project.');const photos=(await query('SELECT key FROM photos WHERE project_id=?',data.id).all()).results;await db.batch([query('DELETE FROM photos WHERE project_id=?',data.id),query('DELETE FROM projects WHERE id=?',data.id)]);if(photos.length)await env.MEDIA.delete(photos.map(p=>p.key));return json({ok:true});}
   if(data.action==='save'){
    const p=data.project;if(!p||!str(p.name,150)||!categories.includes(p.category)||typeof p.description!=='string'||p.description.length>3000||typeof p.location!=='string'||p.location.length>150||!['draft','published'].includes(p.status)||!Array.isArray(p.photos)||!p.photos.length||p.photos.length>20)fail(400,'Add a name, category, status and 1–20 photos.');if(p.id&&!validId(p.id))fail(400,'Invalid project.');const id=p.id||crypto.randomUUID(),keys=new Set();
    for(const f of p.photos){if(typeof f.key!=='string'||!str(f.label,150)||f.label.length>150||keys.has(f.key))fail(400,'Use unique photos with labels.');const stored=await query('SELECT * FROM photos WHERE key=?',f.key).first();if(!stored||stored.project_id&&stored.project_id!==id)fail(400,'Photo is unavailable.');keys.add(f.key);}
    const removed=(await query('SELECT key FROM photos WHERE project_id=?',id).all()).results.filter(p=>!keys.has(p.key));
    await db.batch([query('INSERT INTO projects(id,name,category,description,location,photos,updated_at,status) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,description=excluded.description,location=excluded.location,photos=excluded.photos,updated_at=excluded.updated_at,status=excluded.status',id,str(p.name,150),p.category,p.description,p.location,JSON.stringify(p.photos.map(f=>({key:f.key,label:f.label.trim()}))),Date.now(),p.status),...[...keys].map(key=>query('UPDATE photos SET project_id=? WHERE key=?',id,key)),...removed.map(p=>query('DELETE FROM photos WHERE key=?',p.key))]);
    if(removed.length)await env.MEDIA.delete(removed.map(p=>p.key));return json({ok:true,id});
   }
   fail(400,'Unknown action.');
  }
  if(route.startsWith('/api/'))fail(404,'Not found.');
  if(request.method!=='GET'&&request.method!=='HEAD')fail(405,'Method not allowed.');
  const adminAsset=route.startsWith('/admin');
  if(adminAsset){await admin();const assetURL=new URL(request.url);const result=await env.ASSETS.fetch(new Request(assetURL,request));const headers=new Headers(result.headers);headers.set('Cache-Control','private, no-store');return new Response(result.body,{status:result.status,headers});}
  return env.ASSETS.fetch(request);
 }catch(error){return json({error:error.status?error.message:'Unable to complete the request. Please try again.'},error.status||500);}
}
export default {async fetch(request,env){const response=await handle(request,env);const headers=new Headers(response.headers);headers.set('X-Content-Type-Options','nosniff');headers.set('X-Frame-Options','DENY');headers.set('Referrer-Policy','strict-origin-when-cross-origin');headers.set('Content-Security-Policy',"default-src 'self'; img-src 'self' https://images.pexels.com data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");return new Response(response.body,{status:response.status,headers});}};
