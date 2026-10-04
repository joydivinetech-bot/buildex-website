import test from 'node:test';
import assert from 'node:assert/strict';
import {handleSiteAdmin,handlePublicSite} from '../cloudflare/site-admin.mjs';
import {preview} from '../cloudflare/forms-worker.mjs';
import {cropRect,previewCollection,previewPage} from '../public/cms-utils.js';
import {createFixture,png} from './cms-fixture.mjs';

test('Studio: live versions survive draft edits; private photos stay private; explicit publish/discard/unpublish/delete',async()=>{
 const {env,sql,token,request}=await createFixture();
 try {
  assert.equal((await handleSiteAdmin(request('/admin/api/site',undefined,false),env)).status,401);
  async function upload(){const body=new FormData();body.set('photo',new File([png],'test.png',{type:'image/png'}));const response=await handleSiteAdmin(new Request(env.ADMIN_ORIGIN+'/admin/api/projects/upload',{method:'POST',headers:{Origin:env.ADMIN_ORIGIN,Cookie:'buildex_admin='+token},body}),env);assert.equal(response.status,201);return response.json();}
  const photo=await upload(),project={name:'Published patio',category:'Patios',description:'Public description',location:'Houston',photos:[{...photo,width:1200,height:800,bytes:90000}],status:'published',expectedUpdatedAt:0};
  const save=async p=>handleSiteAdmin(request('/admin/api/projects',{action:'save',project:p}),env);
  const first=await save(project);assert.equal(first.status,200);const saved=await first.json();project.id=saved.id;project.expectedUpdatedAt=saved.updated_at;
  let other=await upload();const draft={...project,name:'Private new title',description:'Secret draft',photos:[other],status:'draft'};
  const draftSave=await save(draft);assert.equal(draftSave.status,200);const draftVersion=await draftSave.json();
  const publicProjects=()=>handlePublicSite(request('/api/projects',undefined,false),env).then(r=>r.json());
  assert.equal((await publicProjects())[0].name,'Published patio');
  assert.equal((await publicProjects())[0].photos[0].width,1200);
  assert.equal((await handlePublicSite(request('/api/media?key='+photo.key,undefined,false),env)).status,200);
  assert.equal((await handlePublicSite(request('/api/media?key='+other.key,undefined,false),env)).status,404);
  const admin=await(await handleSiteAdmin(request('/admin/api/site'),env)).json();
  assert.equal(admin.projects[0].hasDraft,true);assert.equal(admin.projects[0].name,'Private new title');assert.equal(admin.projects[0].published.name,'Published patio');
  assert.equal((await save({...draft,status:'published'})).status,409,'stale publish is rejected');
  assert.equal((await handleSiteAdmin(request('/admin/api/projects',{action:'discard',id:project.id}),env)).status,200);
  assert.equal((await(await handleSiteAdmin(request('/admin/api/site'),env)).json()).projects[0].name,'Published patio');
  assert.equal(sql.prepare('SELECT count(*) n FROM photos').get().n,1,'Discarding frees unused draft photos');
  other=await upload();draft.photos=[other];
  const nextDraft=await save(draft);assert.equal(nextDraft.status,200);draft.expectedUpdatedAt=(await nextDraft.json()).updated_at;
  assert.equal((await save({...draft,status:'published'})).status,200);
  assert.equal((await publicProjects())[0].name,'Private new title');
  assert.equal(sql.prepare('SELECT count(*) n FROM photos').get().n,1,'Publishing frees replaced photos');
  assert.equal((await handlePublicSite(request('/api/media?key='+other.key,undefined,false),env)).status,200);
  assert.equal((await handlePublicSite(request('/api/media?key='+photo.key,undefined,false),env)).status,404,'removed photo is no longer publicly served');
  assert.equal((await handleSiteAdmin(request('/admin/api/projects',{action:'unpublish',id:project.id}),env)).status,200);
  assert.equal((await publicProjects()).length,0);
  assert.equal((await handlePublicSite(request('/api/media?key='+other.key,undefined,false),env)).status,404);
  assert.equal((await handleSiteAdmin(request('/admin/api/projects',{action:'delete',id:project.id}),env)).status,200);
  assert.equal(sql.prepare('SELECT count(*) n FROM photos').get().n,0);
  assert.equal(sql.prepare('SELECT count(*) n FROM photo_data').get().n,0);
  const unauthorized=request('/admin/api/projects',{action:'save',project},false);assert.equal((await handleSiteAdmin(unauthorized,env)).status,401);
  const cross=request('/admin/api/projects',{action:'save',project});cross.headers.set('Origin','https://attacker.test');assert.equal((await handleSiteAdmin(cross,env)).status,403);
 }finally{sql.close();}
});

test('Private previews consume canonical redirects, require authentication and never inherit public frame denial',async()=>{
 const {env,sql,request}=await createFixture();
 try{
  const calls=[];
  env.ASSETS={async fetch(req){const path=new URL(req.url).pathname;calls.push(path);if(!path.endsWith('.html'))return new Response(null,{status:301,headers:{Location:path==='/'?'/index.html':path+'.html'}});return new Response('<html><head></head><body><h1>'+path+'</h1></body></html>',{headers:{'content-type':'text/html','X-Frame-Options':'DENY',Location:'/should-not-escape','ETag':'old','Content-Security-Policy':"frame-ancestors 'none'"}});}};
  for(const page of ['home','services','flooring','estimate','projects','about','contact']){
   const result=await preview(request('/admin/preview?page='+page),env);assert.equal(result.status,200);assert.equal(result.headers.get('location'),null);assert.equal(result.headers.get('etag'),null);assert.equal(result.headers.get('x-frame-options'),'SAMEORIGIN');assert.match(result.headers.get('content-security-policy'),/frame-ancestors 'self'/);
   assert.match(await result.text(),/type="module" src="\/admin\/preview.js"/);
  }
  assert.equal(calls.length,14);
  await assert.rejects(preview(request('/admin/preview',undefined,false),env));
  assert.equal((await preview(request('/admin/preview?page=constructor'),env)).status,404);
 }finally{sql.close();}
});

test('Crop geometry stays within source bounds and never enlarges originals',()=>{
 for(const [width,height] of [[4000,3000],[3000,4000],[320,240]])for(const ratio of [1,1.5,16/9,3/4])for(const zoom of [1,2,3])for(const position of [0,.5,1]){
  const crop=cropRect(width,height,ratio,zoom,position,position,1200);
  assert(crop.sx>=0&&crop.sy>=0&&crop.sx+crop.sw<=width+.001&&crop.sy+crop.sh<=height+.001);
  assert(crop.width<=1200&&crop.height<=1200);assert(crop.width<=Math.ceil(crop.sw));assert(crop.height<=Math.ceil(crop.sh));
  assert(Math.abs(crop.sw/crop.sh-ratio)<.00001);
 }
});
test('Preview routing and collection include incomplete drafts without mutating saved data',()=>{
 assert.equal(previewPage('https://evil.test/projects','https://buildex.test/'),null);
 for(const path of ['projects','projects.html','projects/'])assert.equal(previewPage(path,'https://buildex.test/'),'projects');
 const saved=[{id:'a',name:'Live',photos:[]}],draft={id:'a',name:'',photos:[]};
 assert.equal(previewCollection(saved,draft).length,1);assert.equal(saved[0].name,'Live');
 assert.equal(previewCollection(saved,{id:'',photos:[]}).length,2);assert.deepEqual(previewCollection(saved,null),saved);
});
