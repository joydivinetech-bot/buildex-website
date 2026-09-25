import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { openStore, categories, defaults, tokenHash, verifyPassword, hashPassword } from './store.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const emailValid = value => /^\S+@\S+\.\S+$/.test(value);
const idValid = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
const fail = (status,message) => { throw new HttpError(status,message); };
function string(value,max=200){return typeof value==='string'?value.trim().slice(0,max):'';}
async function body(req,limit=20000){
  if (Number(req.headers['content-length']||0)>limit) fail(413,'Request too large.');
  const chunks=[];let length=0;
  for await(const chunk of req){length+=chunk.length;if(length>limit)fail(413,'Request too large.');chunks.push(chunk);}
  return Buffer.concat(chunks);
}
async function jsonBody(req){
  if(!req.headers['content-type']?.startsWith('application/json'))fail(415,'Expected JSON.');
  try {const value=JSON.parse((await body(req)).toString());if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'Invalid request.');return value;}
  catch(e){if(e instanceof HttpError)throw e;fail(400,'Invalid JSON.');}
}
export async function createApp({dataDir=path.join(root,'data'),origin='http://127.0.0.1:4174',production=false,publicDir=path.join(root,'public')}={}){
  const appOrigin=new URL(origin).origin;
  if(production&&!appOrigin.startsWith('https://'))throw new Error('Production APP_ORIGIN must use HTTPS.');
  const db=openStore(dataDir);
  const dummyHash=await hashPassword(randomBytes(24).toString('hex'));
  const limits=new Map();
  const rate=(key,max,window=15*60*1000)=>{const now=Date.now();if(limits.size>5000)for(const [k,v]of limits)if(v.until<now)limits.delete(k);let item=limits.get(key);if(!item||item.until<now)item={count:0,until:now+window};item.count++;limits.set(key,item);if(item.count>max)fail(429,'Too many attempts. Please try again later.');};
  const sessionCookie=(token,age=28800)=>`buildex_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${production?'; Secure':''}`;
  function getSession(req){const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('buildex_session='))?.slice(16);if(!token||!/^[a-f0-9]{64}$/.test(token))return null;return db.prepare('SELECT admins.id,admins.email FROM sessions JOIN admins ON admins.id=sessions.admin_id WHERE sessions.token_hash=? AND sessions.expires_at>?').get(tokenHash(token),Date.now())||null;}
  function admin(req){const user=getSession(req);if(!user)fail(401,'Please sign in as an administrator.');return user;}
  function projects(all=false){return db.prepare("SELECT * FROM projects"+(all?'':" WHERE status='published'")+" ORDER BY sort_order ASC, updated_at DESC").all().map(p=>({...p,photos:JSON.parse(p.photos)}));}
  function settings(){const row=db.prepare('SELECT value FROM settings WHERE id=?').get('contact');return row?JSON.parse(row.value):defaults;}
  const cleanupFiles=async names=>{for(const name of names)await unlink(path.join(dataDir,'uploads',name)).catch(()=>{});};
  const server=http.createServer(async(req,res)=>{
    const send=(status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data));};
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; media-src 'self' https://interactive-examples.mdn.mozilla.net; img-src 'self' https://images.pexels.com data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'");
    try {
      const url=new URL(req.url,appOrigin),route=url.pathname;
      if(!['GET','HEAD','POST'].includes(req.method))fail(405,'Method not allowed.');
      if(req.method==='POST'&&req.headers.origin!==appOrigin)fail(403,'Request origin is not allowed.');
      const ip=req.socket.remoteAddress||'unknown';
      if(route==='/api/auth'&&req.method==='GET'){const user=getSession(req);return send(200,{user:user?{email:user.email}:null,configured:!!db.prepare('SELECT id FROM admins LIMIT 1').get()});}
      if(route==='/api/login'&&req.method==='POST'){
        rate('login-ip:'+ip,20);const data=await jsonBody(req);const email=string(data.email).toLowerCase();rate('login-email:'+email,8);
        const password=typeof data.password==='string'?data.password:'';if(password.length>256)fail(400,'Invalid credentials.');
        const user=db.prepare('SELECT * FROM admins WHERE email=?').get(email);const valid=await verifyPassword(password,user?.password_hash||dummyHash);
        if(!user||!valid)fail(401,'Email or password is incorrect.');
        const token=randomBytes(32).toString('hex');db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(tokenHash(token),user.id,Date.now()+28800000);
        return send(200,{ok:true},{'Set-Cookie':sessionCookie(token)});
      }
      if(route==='/api/logout'&&req.method==='POST'){const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('buildex_session='))?.slice(16);if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(token));return send(200,{ok:true},{'Set-Cookie':sessionCookie('',0)});}
      if(route==='/api/settings'&&req.method==='GET')return send(200,settings());
      if(route==='/api/projects'&&req.method==='GET')return send(200,projects());
      if(route==='/api/inquiries'&&req.method==='POST'){
        rate('inquiry:'+ip,10);const data=await jsonBody(req);if(data.website)fail(400,'Request could not be submitted.');
        const name=string(data.name,150),phone=string(data.phone,30),email=string(data.email),service=string(data.service),kind=string(data.kind),description=string(data.description,5000);
        if(!name||phone.replace(/\D/g,'').length<7||(email&&!emailValid(email))||!service||!['estimate','contact'].includes(kind))fail(400,'Complete your name, phone and service.');
        const details={description,address:string(data.address,500),propertyType:string(data.propertyType),size:string(data.size),startDate:string(data.startDate),budget:string(data.budget)};
        if(kind==='estimate'&&!['Residential','Commercial'].includes(details.propertyType))fail(400,'Include the property type.');
        const id=randomUUID();db.prepare('INSERT INTO inquiries VALUES(?,?,?,?,?,?,?,?)').run(id,kind,name,phone,email,service,JSON.stringify(details),Date.now());return send(201,{ok:true,id});
      }
      if(route==='/api/media'&&['GET','HEAD'].includes(req.method)){
        const key=url.searchParams.get('key');const photo=db.prepare('SELECT * FROM photos WHERE key=?').get(key||'');const published=photo?.project_id&&db.prepare("SELECT id FROM projects WHERE id=? AND status='published'").get(photo.project_id);if(!photo||(!published&&!getSession(req)))fail(404,'Photo not found.');
        const bytes=await readFile(path.join(dataDir,'uploads',photo.filename));res.writeHead(200,{'Content-Type':photo.mime,'Cache-Control':'private, no-store','Content-Length':bytes.length});return res.end(req.method==='HEAD'?undefined:bytes);
      }
      if(route==='/api/admin'){
        const user=admin(req);
        if(req.method==='GET')return send(200,{projects:projects(true),settings:settings(),inquiries:db.prepare('SELECT * FROM inquiries ORDER BY created_at DESC LIMIT 500').all().map(i=>({...i,details:JSON.parse(i.details)}))});
        if(req.method!=='POST')fail(405,'Method not allowed.');
        if(url.searchParams.get('action')==='upload'){
          rate('upload:'+user.id,60);if(!req.headers['content-type']?.startsWith('multipart/form-data;'))fail(415,'Expected a photo upload.');
          const bytes=await body(req,8500000);let form;try{form=await new Request(appOrigin+route,{method:'POST',headers:{'Content-Type':req.headers['content-type']},body:bytes}).formData();}catch{fail(400,'Invalid photo upload.');}
          const file=form.get('photo');if(!(file instanceof File)||!file.size||file.size>8000000)fail(400,'Choose a JPG, PNG or WebP smaller than 8 MB.');
          const image=Buffer.from(await file.arrayBuffer());const jpeg=image[0]===255&&image[1]===216&&image[2]===255,png=image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),webp=image.subarray(0,4).toString()==='RIFF'&&image.subarray(8,12).toString()==='WEBP';
          if(!jpeg&&!png&&!webp)fail(400,'Please use a JPG, PNG or WebP image.');
          const ext=jpeg?'jpg':png?'png':'webp',mime=jpeg?'image/jpeg':png?'image/png':'image/webp',filename=randomUUID()+'.'+ext,key='projects/'+filename;
          await writeFile(path.join(dataDir,'uploads',filename),image,{flag:'wx'});
          try{db.prepare('INSERT INTO photos VALUES(?,?,?,?,?,?)').run(key,filename,mime,user.id,null,Date.now());}catch(e){await cleanupFiles([filename]);throw e;}
          return send(201,{key,label:'Completed project'});
        }
        const data=await jsonBody(req);
        if(data.action==='settings'){
          const phone=string(data.phone,60),email=string(data.email),hours=string(data.hours,500);if(phone.replace(/\D/g,'').length<7||!emailValid(email)||!hours)fail(400,'Enter a valid phone, email and business hours.');
          db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run('contact',JSON.stringify({phone,email,hours}));return send(200,{ok:true});
        }
        if(data.action==='reorder'){
          const ids=data.ids;if(!Array.isArray(ids)||ids.length!==projects(true).length||new Set(ids).size!==ids.length||ids.some(id=>!db.prepare('SELECT id FROM projects WHERE id=?').get(id)))fail(400,'Invalid project order.');
          db.exec('BEGIN');try{ids.forEach((id,index)=>db.prepare('UPDATE projects SET sort_order=? WHERE id=?').run(index,id));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return send(200,{ok:true});
        }
        if(data.action==='delete'){
          if(!idValid(data.id))fail(400,'Invalid project.');const photos=db.prepare('SELECT filename FROM photos WHERE project_id=?').all(data.id);
          db.exec('BEGIN');try{db.prepare('DELETE FROM photos WHERE project_id=?').run(data.id);db.prepare('DELETE FROM projects WHERE id=?').run(data.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
          await cleanupFiles(photos.map(p=>p.filename));return send(200,{ok:true});
        }
        if(data.action==='save'){
          const p=data.project;if(p?.status&&!['draft','published'].includes(p.status))fail(400,'Invalid publication status.');if(!p||!string(p.name,150)||!categories.includes(p.category)||typeof p.description!=='string'||p.description.length>3000||typeof p.location!=='string'||p.location.length>150||!Array.isArray(p.photos)||p.photos.length<1||p.photos.length>20)fail(400,'Add a name, category and 1–20 project photos.');
          if(p.id&&!idValid(p.id))fail(400,'Invalid project ID.');const id=p.id||randomUUID();const keys=new Set();
          for(const f of p.photos){if(typeof f.key!=='string'||!string(f.label,150)||f.label.length>150||keys.has(f.key))fail(400,'Use unique photos with labels.');const stored=db.prepare('SELECT * FROM photos WHERE key=?').get(f.key);if(!stored||stored.project_id&&stored.project_id!==id)fail(400,'Photo is unavailable or belongs to another project.');keys.add(f.key);}
          const removed=db.prepare('SELECT * FROM photos WHERE project_id=?').all(id).filter(f=>!keys.has(f.key));
          db.exec('BEGIN');try{db.prepare('INSERT INTO projects(id,name,category,description,location,photos,updated_at,status) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,description=excluded.description,location=excluded.location,photos=excluded.photos,updated_at=excluded.updated_at,status=excluded.status').run(id,string(p.name,150),p.category,p.description,p.location,JSON.stringify(p.photos.map(f=>({key:f.key,label:f.label.trim()}))),Date.now(),p.status||'draft');for(const key of keys)db.prepare('UPDATE photos SET project_id=? WHERE key=?').run(id,key);for(const f of removed)db.prepare('DELETE FROM photos WHERE key=?').run(f.key);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
          await cleanupFiles(removed.map(p=>p.filename));return send(200,{ok:true,id});
        }
        fail(400,'Unknown action.');
      }
      if(route.startsWith('/api/'))fail(404,'Not found.');
      if(!['GET','HEAD'].includes(req.method))fail(405,'Method not allowed.');
      const routes={'/':'index.html','/admin':'admin.html','/services':'services.html','/flooring':'flooring.html','/estimate':'estimate.html','/contact':'contact.html','/about':'about.html','/projects':'projects.html'};
      const filename=routes[route]||route.slice(1);
      const allowed=new Set(['projects.html','projects.css','projects.js','about.html','index.html','services.html','flooring.html','estimate.html','contact.html','admin.html','styles.css','site.js','admin.css','admin.js','favicon.svg','buildex-logo.png','robots.txt']);
      if(!allowed.has(filename))fail(404,'Page not found.');
      const bytes=await readFile(path.join(publicDir,filename));const etag='"'+createHash('sha256').update(bytes).digest('hex').slice(0,24)+'"';
      const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.txt':'text/plain'}[path.extname(filename)];
      res.setHeader('Cache-Control',filename==='admin.html'?'no-store':'public, max-age=0, must-revalidate');res.setHeader('ETag',etag);
      if(req.headers['if-none-match']===etag){res.writeHead(304);return res.end();}
      res.writeHead(200,{'Content-Type':mime,'Content-Length':bytes.length});return res.end(req.method==='HEAD'?undefined:bytes);
    }catch(e){if(e.status)send(e.status,{error:e.message});else{console.error('Request failed:',e.code||e.name);send(500,{error:'Unable to complete the request. Please try again.'});}}
  });
  server.requestTimeout=30000;server.headersTimeout=15000;
  return {server,db,close:()=>new Promise(resolve=>{server.close(()=>{db.close();resolve();});server.closeIdleConnections();})};
}
