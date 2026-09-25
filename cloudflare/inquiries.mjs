// Submission pipeline shared by the photo CMS and the forms-only deployment.
const response=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const reject=(status,message)=>{throw Object.assign(new Error(message),{status});};
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
const email=s=>typeof s==='string'&&s.length<=200&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const field=(d,k,max,required=false)=>{const value=d[k];if(value!==undefined&&typeof value!=='string')reject(400,'Invalid form field.');const text=(value||'').trim();if(text.length>max||(required&&!text))reject(400,'Complete all required fields within the allowed length.');return text;};
const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function notificationMessage(data,id){
 const title=data.kind==='estimate'?'New estimate inquiry':'New contact inquiry';
 const fields=[['Name',data.name],['Email',data.email],['Phone',data.phone],['Service',data.service],['Property address',data.details.address],['Property type',data.details.propertyType],['Project size',data.details.size],['Project timeline',data.details.startDate],['Budget',data.details.budget]].filter(([,value])=>value);
 const text=[title,'','Reference: '+id,...fields.map(([label,value])=>label+': '+value),'',data.kind==='estimate'?'Project description':'Message',data.details.description].join('\n');
 const rows=fields.map(([label,value])=>`<tr><td style="padding:9px 12px;color:#64748b;font-size:13px;border-bottom:1px solid #e8edf3;width:34%;vertical-align:top">${escapeHtml(label)}</td><td style="padding:9px 12px;color:#102a43;font-size:14px;font-weight:600;border-bottom:1px solid #e8edf3;vertical-align:top">${escapeHtml(value)}</td></tr>`).join('');
 const reply='mailto:'+encodeURIComponent(data.email),call='tel:'+data.phone.replace(/[^\d+]/g,'');
 const html=`<!doctype html><html><body style="margin:0;background:#f3f6f9;font-family:Arial,sans-serif;color:#102a43"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(title)} from ${escapeHtml(data.name)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6f9;padding:24px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #dce5ee;border-radius:8px;overflow:hidden"><tr><td style="background:#0b2948;padding:24px 28px;border-bottom:4px solid #c79a43"><div style="color:#ffffff;font-size:22px;font-weight:700">Buildex Construction</div><div style="color:#cbd5e1;font-size:13px;margin-top:5px">${escapeHtml(title)}</div></td></tr><tr><td style="padding:24px 28px"><div style="display:inline-block;background:#eef3f8;color:#0b2948;font-size:11px;font-weight:700;letter-spacing:1px;padding:6px 9px;border-radius:4px;margin-bottom:18px">${escapeHtml(data.kind.toUpperCase())}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e1e8ef;border-radius:6px;border-collapse:separate;border-spacing:0;overflow:hidden">${rows}</table><div style="margin-top:22px;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.7px">${data.kind==='estimate'?'Project description':'Message'}</div><div style="margin-top:8px;padding:15px;background:#f7f9fb;border-left:3px solid #c79a43;color:#263b50;font-size:14px;line-height:1.6;white-space:pre-wrap">${escapeHtml(data.details.description)}</div><div style="margin-top:22px"><a href="${reply}" style="display:inline-block;background:#0b2948;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:11px 18px;border-radius:5px;margin-right:8px">Reply by email</a><a href="${call}" style="display:inline-block;background:#ffffff;color:#0b2948;text-decoration:none;font-size:14px;font-weight:700;padding:10px 18px;border:1px solid #9fb1c3;border-radius:5px">Call customer</a></div></td></tr><tr><td style="padding:16px 28px;background:#f7f9fb;color:#718096;font-size:11px">Reference: ${escapeHtml(id)} · Submitted through buildexconstructions.com</td></tr></table></td></tr></table></body></html>`;
 return {subject:`Buildex ${data.kind} | ${data.name} | ${id.slice(0,8)}`,text,html};
}
export async function notifyInquiry(env,id){
 const row=await env.DB.prepare('SELECT * FROM inquiry_notifications WHERE inquiry_id=?').bind(id).first();
 if(!row||row.status==='sent')return;
 if(!env.EMAIL||!env.NOTIFICATION_FROM||!env.NOTIFICATION_TO)return;
 try{
  const data=JSON.parse(row.payload);
  const message=notificationMessage(data,id);
  await env.EMAIL.send({
   from:{email:env.NOTIFICATION_FROM,name:'Buildex Website'},
   to:env.NOTIFICATION_TO,
   replyTo:data.email,
   ...message
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
