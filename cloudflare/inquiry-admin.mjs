import {verifyAccess} from './access.mjs';

const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const validId=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const statuses=new Set(['new','contacted','closed']);

async function ensureManagementTable(db){
 await db.prepare("CREATE TABLE IF NOT EXISTS inquiry_management (inquiry_id TEXT PRIMARY KEY,status TEXT NOT NULL CHECK(status IN ('new','contacted','closed')),updated_at INTEGER NOT NULL)").run();
}
async function readBody(request){
 if(!request.headers.get('content-type')?.startsWith('application/json'))fail(415,'Expected JSON.');
 const text=await request.text();if(text.length>5000)fail(413,'Request is too large.');
 try{return JSON.parse(text);}catch{fail(400,'Invalid request.');}
}
const parseInquiry=row=>{let details={};try{details=JSON.parse(row.details);}catch{}return {...row,details,status:statuses.has(row.status)?row.status:'new'};};
const csvValue=value=>{let text=String(value??'');if(/^[=+\-@]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};

export async function handleInquiryAdmin(request,env,authorizer=verifyAccess){
 try{
  const url=new URL(request.url);if(url.origin!==env.ADMIN_ORIGIN)fail(404,'Not found.');
  const user=await authorizer(request,env);await ensureManagementTable(env.DB);
  if(url.pathname==='/admin/api/session'&&request.method==='GET')return json({user});
  if(url.pathname==='/admin/api/inquiries.csv'&&request.method==='GET'){
   const rows=(await env.DB.prepare("SELECT i.*,COALESCE(m.status,'new') status,m.updated_at status_updated_at FROM inquiries i LEFT JOIN inquiry_management m ON m.inquiry_id=i.id ORDER BY i.created_at DESC LIMIT 2000").all()).results.map(parseInquiry);
   const columns=['Submitted','Status','Type','Name','Email','Phone','Service','Address','Property type','Project size','Desired start','Budget','Description','Reference'];
   const records=rows.map(i=>[new Date(i.created_at).toISOString(),i.status,i.kind,i.name,i.email,i.phone,i.service,i.details.address,i.details.propertyType,i.details.size,i.details.startDate,i.details.budget,i.details.description,i.id]);
   const csv='\uFEFF'+[columns,...records].map(record=>record.map(csvValue).join(',')).join('\r\n');
   return new Response(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="buildex-inquiries-'+new Date().toISOString().slice(0,10)+'.csv"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }
  if(url.pathname!=='/admin/api/inquiries')fail(404,'Not found.');
  if(request.method==='GET'){
   const rows=(await env.DB.prepare("SELECT i.*,COALESCE(m.status,'new') status,m.updated_at status_updated_at FROM inquiries i LEFT JOIN inquiry_management m ON m.inquiry_id=i.id ORDER BY i.created_at DESC LIMIT 500").all()).results.map(parseInquiry);
   return json({user,inquiries:rows});
  }
  if(request.method!=='POST')fail(405,'Method not allowed.');
  if(request.headers.get('origin')!==url.origin)fail(403,'Invalid request origin.');
  const data=await readBody(request);if(data.action!=='status'||!validId(data.id)||!statuses.has(data.status))fail(400,'Invalid status update.');
  if(!await env.DB.prepare('SELECT id FROM inquiries WHERE id=?').bind(data.id).first())fail(404,'Inquiry not found.');
  await env.DB.prepare('INSERT INTO inquiry_management(inquiry_id,status,updated_at) VALUES(?,?,?) ON CONFLICT(inquiry_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at').bind(data.id,data.status,Date.now()).run();
  return json({ok:true});
 }catch(error){return json({error:error.status?error.message:'Unable to complete the request.'},error.status||500);}
}
