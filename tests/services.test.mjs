import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/forms-worker.mjs';
import {createFixture,png} from './cms-fixture.mjs';
test('Services: defaults, draft privacy, publish/order/removal, media protection, validation and stale writes',async()=>{
 const {env,sql,request,token}=await createFixture();
 const call=path=>worker.fetch(request(path,undefined,false),env,{});
 const save=data=>worker.fetch(request('/admin/api/services',data),env,{});
 try{
  assert.equal((await worker.fetch(request('/admin/api/services',undefined,false),env,{})).status,401);
  const initial=await(await worker.fetch(request('/admin/api/services'),env,{})).json();assert.equal(initial.published.length,7);assert.equal(initial.version,0);
  const upload=new FormData();upload.set('photo',new File([png],'service.png',{type:'image/png'}));
  const photo=await(await worker.fetch(new Request(env.ADMIN_ORIGIN+'/admin/api/projects/upload',{method:'POST',headers:{Origin:env.ADMIN_ORIGIN,Cookie:'buildex_admin='+token},body:upload}),env,{})).json();
  const custom={id:crypto.randomUUID(),name:'Custom service',description:'A new service',image:{key:photo.key},link:'estimate'};
  const collection=[custom,...initial.published.slice().reverse()];
  assert.equal((await save({action:'draft',version:0,services:collection})).status,200);
  assert.deepEqual(await(await call('/api/services')).json(),initial.published,'Draft never changes public content or order');
  assert.equal((await call('/api/media?key='+photo.key)).status,404,'Draft service image stays private');
  assert.equal((await save({action:'publish',version:0,services:collection})).status,409,'Stale editor cannot overwrite');
  assert.equal((await save({action:'publish',version:1,services:collection})).status,200);
  assert.equal((await(await call('/api/services')).json())[0].name,'Custom service');
  assert.equal((await call('/api/media?key='+photo.key)).status,200,'Published service image can load');
  const projectSave=await worker.fetch(request('/admin/api/projects',{action:'save',project:{name:'Cannot steal service media',category:'Other',description:'',location:'',photos:[{key:photo.key,label:'Photo'}],status:'published'}}),env,{});assert.equal(projectSave.status,400);
  assert.equal((await save({action:'draft',version:2,services:collection.slice(1)})).status,200);
  assert.equal((await call('/api/media?key='+photo.key)).status,200,'Pending removal keeps the current public photo live');
  assert.equal((await save({action:'discard',version:3})).status,200);
  assert.equal((await(await worker.fetch(request('/admin/api/services'),env,{})).json()).draft,null);
  const bad={...custom,image:{src:'javascript:alert(1)'}};
  assert.equal((await save({action:'publish',version:4,services:[bad]})).status,400);
  assert.equal((await save({action:'publish',version:4,services:[custom,custom]})).status,400);
  const cross=request('/admin/api/services',{action:'publish',version:4,services:[]});cross.headers.set('Origin','https://other.test');assert.equal((await worker.fetch(cross,env,{})).status,403);
  assert.equal((await save({action:'publish',version:4,services:collection.slice(1)})).status,200);
  assert.equal((await call('/api/media?key='+photo.key)).status,404,'Removed service photos stop being public');
  assert.equal((await save({action:'publish',version:5,services:[]})).status,200);assert.deepEqual(await(await call('/api/services')).json(),[],'Empty published collections do not resurrect defaults');
  assert.equal((await save({action:'draft',version:6,services:[{...custom,image:{key:{invalid:true}}}]})).status,400);
  const racing=await Promise.all([save({action:'draft',version:6,services:initial.published}),save({action:'draft',version:6,services:[custom]})]);
  assert.deepEqual(racing.map(r=>r.status).sort(),[200,409],'Concurrent editors cannot overwrite one another');
 }finally{sql.close();}
});
