// Submission pipeline shared by the photo CMS and the forms-only deployment.
const response=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const reject=(status,message)=>{throw Object.assign(new Error(message),{status});};
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
const email=s=>typeof s==='string'&&s.length<=200&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const field=(d,k,max,required=false)=>{const value=d[k];if(value!==undefined&&typeof value!=='string')reject(400,'Invalid form field.');const text=(value||'').trim();if(text.length>max||(required&&!text))reject(400,'Complete all required fields within the allowed length.');return text;};
export async function notifyInquiry(env,id){
 const row=await env.DB.prepare('SELECT * FROM inquiry_notifications WHERE inquiry_id=?').bind(id).first();
 if(!row||row.status==='sent')return;
 if(!env.EMAIL||!env.NOTIFICATION_FROM||!env.NOTIFICATION_TO)return;
 try{
  const data=JSON.parse(row.payload);
  await env.EMAIL.send({
   from:{email:env.NOTIFICATION_FROM,name:'Buildex Website'},
   to:env.NOTIFICATION_TO,
   replyTo:data.email,
   subject:'Buildex: new '+data.kind+' inquiry',
   text:['Reference: '+id,'Name: '+data.name,'Email: '+data.email,'Phone: '+data.phone,'Service: '+data.service,...Object.entries(data.details).filter(([,v])=>v).map(([k,v])=>k+': '+v)].join('\n')
  });
  await env.DB.prepare("UPDATE inquiry_notifications SET status='sent',attempts=attempts+1,last_attempt=? WHERE inquiry_id=?").bind(Date.now(),id).run();
 }catch{
  await env.DB.prepare("UPDATE inquiry_notifications SET status='pending',attempts=attempts+1,last_attempt=? WHERE inquiry_id=?").bind(Date.now(),id).run();
 }
}
export async function handleInquiry(request,env,ctx={},fetcher=fetch){
 const url=new URL(request.url);
 try{
  if(url.origin!==env.PUBLIC_ORIGIN)reject(403,'Please use the main website.');
  if(url.pathname==='/api/form-config'&&request.method==='GET')return response({enabled:!!(env.DB&&env.TURNSTILE_SITE_KEY&&env.TURNSTILE_SECRET_KEY),siteKey:env.TURNSTILE_SITE_KEY||''});
  if(request.method!=='POST')reject(405,'Method not allowed.');
  if(request.headers.get('origin')!==url.origin)reject(403,'Invalid request origin.');
  if(!env.DB||!env.TURNSTILE_SECRET_KEY)reject(503,'Online inquiries are not available yet. Please call or text us.');
  if(!request.headers.get('content-type')?.startsWith('application/json'))reject(415,'Expected a form submission.');
  const reader=request.body?.getReader();let size=0,parts=[];if(!reader)reject(400,'Missing submission.');while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>20000){await reader.cancel();reject(413,'Submission is too large.');}parts.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}let d;try{d=JSON.parse(new TextDecoder().decode(bytes));}catch{reject(400,'Invalid submission.');}if(!d||typeof d!=='object'||Array.isArray(d))reject(400,'Invalid submission.');
  if(d.website)reject(400,'Unable to accept this submission.');
  const data={name:field(d,'name',150,true),email:field(d,'email',200,true),phone:field(d,'phone',30,true),service:field(d,'service',200,true),kind:field(d,'kind',20,true),details:{}};
  if(!email(data.email)||data.phone.replace(/\D/g,'').length<7||!['contact','estimate'].includes(data.kind))reject(400,'Check your contact details.');
  for(const [key,max] of Object.entries({description:5000,address:500,propertyType:200,size:200,startDate:200,budget:200}))data.details[key]=field(d,key,max,key==='description');
  if(data.kind==='estimate'&&(!data.details.address||!['Residential','Commercial'].includes(data.details.propertyType)))reject(400,'Include your property address and type.');
  if(!uuid(d.submissionId))reject(400,'Refresh the page and try again.');
  const ip=request.headers.get('CF-Connecting-IP')||'unknown';const ipHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip)))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const now=Date.now();const rate=await env.DB.prepare('INSERT INTO rate_limits(id,count,expires) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=CASE WHEN expires<=? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<=? THEN ? ELSE expires END RETURNING count').bind('form:'+ipHash,now+900000,now,now,now+900000).first();if(rate.count>10)reject(429,'Too many attempts. Please try later or call us.');
  const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data))))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const existing=await env.DB.prepare('SELECT fingerprint FROM inquiry_notifications WHERE inquiry_id=?').bind(d.submissionId).first();
  if(existing){if(existing.fingerprint!==fingerprint)reject(409,'This form was already submitted. Refresh to send a new inquiry.');return response({ok:true,id:d.submissionId},200);}
  const token=field(d,'cf-turnstile-response',2048,true);let validation;
  try{const verification=await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:token,remoteip:ip}),signal:AbortSignal.timeout(8000)});if(!verification.ok)throw Error();validation=await verification.json();}catch{reject(503,'Verification is unavailable. Please try again.');}
  if(!validation.success||validation.hostname!==url.hostname||validation.action!=='inquiry')reject(400,'Please complete verification again.');
  const id=d.submissionId;
  await env.DB.batch([
   env.DB.prepare('INSERT INTO inquiries VALUES(?,?,?,?,?,?,?,?)').bind(id,data.kind,data.name,data.phone,data.email,data.service,JSON.stringify(data.details),now),
   env.DB.prepare('INSERT INTO inquiry_notifications(inquiry_id,fingerprint,payload,status,attempts,last_attempt) VALUES(?,?,?,?,0,NULL)').bind(id,fingerprint,JSON.stringify(data),'pending')
  ]);
  if(ctx.waitUntil)ctx.waitUntil(notifyInquiry(env,id).catch(()=>{}));
  return response({ok:true,id},201);
 }catch(error){return response({error:error.status?error.message:'Unable to save your inquiry. Please try again or call us.'},error.status||500);}
}
