import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/forms-worker.mjs';
import {createFixture,png} from './cms-fixture.mjs';
test('Hide/unhide retains projects and services, protects hidden media and preserves published content',async()=>{
 const {env,sql,token,request}=await createFixture();
 const fetch=(path,data,auth=true)=>worker.fetch(request(path,data,auth),env,{});
 const publicJSON=async path=>(await fetch(path,undefined,false)).json();
 async function upload(){const body=new FormData();body.set('photo',new File([png],'photo.png',{type:'image/png'}));return (await worker.fetch(new Request(env.ADMIN_ORIGIN+'/admin/api/projects/upload',{method:'POST',headers:{Origin:env.ADMIN_ORIGIN,Cookie:'buildex_admin='+token},body}),env,{})).json();}
 try{
  const photo=await upload();const project={name:'Keep this album',category:'Patios',description:'Original caption',location:'Houston',photos:[{...photo}],status:'published'};
  const saved=await(await fetch('/admin/api/projects',{action:'save',project})).json(),id=saved.id;
  const change=hidden=>fetch('/admin/api/projects',{action:'reorder',ids:[id],visibility:[{id,hidden}]});
  assert.equal((await publicJSON('/api/projects')).length,1);
  const media=await fetch('/api/media?key='+photo.key,undefined,false),etag=media.headers.get('etag');assert.equal(media.status,200);
  assert.equal((await change(true)).status,200);assert.deepEqual(await publicJSON('/api/projects'),[]);
  assert.equal((await fetch('/api/media?key='+photo.key,undefined,false)).status,404);
  assert.equal((await worker.fetch(new Request(env.ADMIN_ORIGIN+'/api/media?key='+photo.key,{headers:{'If-None-Match':etag}}),env,{})).status,404,'Hidden photo cannot return a cached 304');
  let admin=await(await fetch('/admin/api/site')).json();assert.equal(admin.projects.length,1);assert.equal(admin.projects[0].hidden,true);assert.equal(admin.projects[0].status,'published');assert.equal(admin.projects[0].photos.length,1);
  assert.equal((await fetch('/admin/api/media?key='+photo.key)).status,200);
  assert.equal((await change('yes')).status,400);
  assert.equal((await change(false)).status,200);assert.equal((await publicJSON('/api/projects'))[0].name,'Keep this album');assert.equal((await fetch('/api/media?key='+photo.key,undefined,false)).status,200);
  const servicePhoto=await upload(),service={id:crypto.randomUUID(),name:'Keep this service',description:'Service details',image:{key:servicePhoto.key},link:'estimate',hidden:true};
  assert.equal((await fetch('/admin/api/services',{action:'publish',version:0,services:[service]})).status,200);
  assert.deepEqual(await publicJSON('/api/services'),[]);assert.equal((await fetch('/api/media?key='+servicePhoto.key,undefined,false)).status,404);
  let services=await(await fetch('/admin/api/services')).json();assert.equal(services.published[0].hidden,true);
  service.hidden=false;assert.equal((await fetch('/admin/api/services',{action:'draft',version:1,services:[service]})).status,200);assert.deepEqual(await publicJSON('/api/services'),[],'Unhide stays private until published');
  assert.equal((await fetch('/admin/api/services',{action:'publish',version:2,services:[service]})).status,200);assert.equal((await publicJSON('/api/services'))[0].name,service.name);assert.equal((await fetch('/api/media?key='+servicePhoto.key,undefined,false)).status,200);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM photos').get().n,2,'Hide never deletes photos');
 }finally{sql.close();}
});
