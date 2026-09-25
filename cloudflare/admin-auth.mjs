const json=(value,status=200,headers={})=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...headers}});
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const encoder=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,'0')).join('');
const hash=async value=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
const randomToken=()=>{const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const cookieValue=(request,name)=>request.headers.get('cookie')?.split(';').map(value=>value.trim()).find(value=>value.startsWith(name+'='))?.slice(name.length+1)||'';
const allowedEmails=env=>String(env.ADMIN_EMAILS||'').split(',').map(value=>value.trim().toLowerCase()).filter(Boolean);
const maskedEmail=email=>email.replace(/^(.)([^@]*)(@.*)$/,'$1***$3');

async function ensureTables(db){
 await db.prepare('CREATE TABLE IF NOT EXISTS admin_login_codes (id TEXT PRIMARY KEY,code_hash TEXT NOT NULL,expires INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0)').run();
 await db.prepare('CREATE TABLE IF NOT EXISTS admin_sessions (id TEXT PRIMARY KEY,email TEXT NOT NULL,expires INTEGER NOT NULL,created_at INTEGER NOT NULL)').run();
}
async function parseBody(request){
 if(!request.headers.get('content-type')?.startsWith('application/json'))fail(415,'Expected JSON.');
 const text=await request.text();if(text.length>2000)fail(413,'Request is too large.');
 try{const data=JSON.parse(text);if(!data||typeof data!=='object'||Array.isArray(data))throw Error();return data;}catch{fail(400,'Invalid request.');}
}
async function rateLimit(env,key,limit,windowMs){
 const now=Date.now();const row=await env.DB.prepare('INSERT INTO rate_limits(id,count,expires) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=CASE WHEN expires<=? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<=? THEN ? ELSE expires END RETURNING count').bind(key,now+windowMs,now,now,now+windowMs).first();
 if(row.count>limit)fail(429,'Too many sign-in attempts. Please wait and try again.');
}
async function sendCode(env,code){
 if(!env.EMAIL||!env.NOTIFICATION_FROM||!allowedEmails(env).length)fail(503,'Email sign-in is not configured.');
 const recipient=allowedEmails(env)[0];
 await env.EMAIL.send({
  from:{email:env.NOTIFICATION_FROM,name:'Buildex Website'},to:recipient,
  subject:`Buildex sign-in code: ${code}`,
  text:`Your Buildex inquiry dashboard sign-in code is ${code}. It expires in 10 minutes. If you did not request this code, ignore this email.`,
  html:`<!doctype html><html><body style="margin:0;background:#f3f6f9;font-family:Arial,sans-serif;color:#102a43"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fff;border:1px solid #dce5ee;border-radius:8px"><tr><td style="background:#0b2948;color:#fff;padding:22px 26px;border-bottom:4px solid #c79a43;font-size:21px;font-weight:700">Buildex Construction</td></tr><tr><td style="padding:28px 26px"><p style="margin:0 0 16px">Use this code to sign in to the inquiry dashboard:</p><div style="font-size:34px;font-weight:700;letter-spacing:8px;background:#f3f6f9;padding:16px;text-align:center;border-radius:6px">${code}</div><p style="margin:18px 0 0;color:#64748b;font-size:13px">The code expires in 10 minutes. If you did not request it, ignore this email.</p></td></tr></table></td></tr></table></body></html>`
 });
}
export async function verifyAdminSession(request,env){
 await ensureTables(env.DB);const token=cookieValue(request,'buildex_admin');if(!token||token.length>100)fail(401,'Please sign in to continue.');
 const id=await hash(token),session=await env.DB.prepare('SELECT email,expires FROM admin_sessions WHERE id=?').bind(id).first();
 if(!session||session.expires<=Date.now()||!allowedEmails(env).includes(session.email.toLowerCase())){if(session)await env.DB.prepare('DELETE FROM admin_sessions WHERE id=?').bind(id).run();fail(401,'Your session has expired. Please sign in again.');}
 return {email:session.email};
}
export async function handleAdminAuth(request,env){
 try{
  const url=new URL(request.url);if(url.origin!==env.ADMIN_ORIGIN)fail(404,'Not found.');await ensureTables(env.DB);
  if(url.pathname==='/admin/api/auth/session'&&request.method==='GET')return json({user:await verifyAdminSession(request,env)});
  if(request.method!=='POST')fail(405,'Method not allowed.');if(request.headers.get('origin')!==url.origin)fail(403,'Invalid request origin.');
  if(url.pathname==='/admin/api/auth/request-code'){
   const ip=await hash(request.headers.get('CF-Connecting-IP')||'unknown');await rateLimit(env,'admin-code:'+ip,5,1800000);await rateLimit(env,'admin-code:global',20,3600000);
   const values=new Uint32Array(1);crypto.getRandomValues(values);const code=String(values[0]%1000000).padStart(6,'0'),id=crypto.randomUUID(),expires=Date.now()+600000;
   await env.DB.prepare('INSERT INTO admin_login_codes(id,code_hash,expires,attempts) VALUES(?,?,?,0)').bind(id,await hash(id+':'+code),expires).run();
   try{await sendCode(env,code);}catch(error){await env.DB.prepare('DELETE FROM admin_login_codes WHERE id=?').bind(id).run();throw error;}
   await env.DB.prepare('DELETE FROM admin_login_codes WHERE expires<?').bind(Date.now()).run();
   return json({ok:true,challenge:id,destination:maskedEmail(allowedEmails(env)[0])});
  }
  if(url.pathname==='/admin/api/auth/verify'){
   const data=await parseBody(request);if(typeof data.challenge!=='string'||!/^[0-9a-f-]{36}$/i.test(data.challenge)||typeof data.code!=='string'||!/^\d{6}$/.test(data.code))fail(400,'Enter the six-digit code.');
   const record=await env.DB.prepare('UPDATE admin_login_codes SET attempts=attempts+1 WHERE id=? AND expires>? AND attempts<5 RETURNING code_hash,expires,attempts').bind(data.challenge,Date.now()).first();if(!record)fail(401,'This code has expired. Request a new one.');
   if(record.code_hash!==await hash(data.challenge+':'+data.code))fail(401,'That code is incorrect.');
   const token=randomToken(),now=Date.now(),expires=now+28800000,email=allowedEmails(env)[0];if(!email)fail(503,'Email sign-in is not configured.');
   await env.DB.batch([env.DB.prepare('DELETE FROM admin_login_codes WHERE id=?').bind(data.challenge),env.DB.prepare('INSERT INTO admin_sessions(id,email,expires,created_at) VALUES(?,?,?,?)').bind(await hash(token),email,expires,now),env.DB.prepare('DELETE FROM admin_sessions WHERE expires<?').bind(now)]);
   return json({ok:true,user:{email}},200,{'Set-Cookie':`buildex_admin=${token}; Path=/admin; Max-Age=28800; HttpOnly; Secure; SameSite=Strict`});
  }
  if(url.pathname==='/admin/api/auth/logout'){
   const token=cookieValue(request,'buildex_admin');if(token)await env.DB.prepare('DELETE FROM admin_sessions WHERE id=?').bind(await hash(token)).run();
   return json({ok:true},200,{'Set-Cookie':'buildex_admin=; Path=/admin; Max-Age=0; HttpOnly; Secure; SameSite=Strict'});
  }
  fail(404,'Not found.');
 }catch(error){return json({error:error.status?error.message:'Unable to complete sign-in. Please try again.'},error.status||500);}
}
