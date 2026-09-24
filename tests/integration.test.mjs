import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm,readdir,readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server/app.mjs';
import { setAdmin } from '../server/store.mjs';

test('independent site: authentication, durable inquiries, CMS, uploads and access boundaries',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'buildex-test-'));
  const origin='http://127.0.0.1:4174';let app;
  async function start(){app=await createApp({dataDir:directory,origin});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');return `http://127.0.0.1:${app.server.address().port}`;}
  let base=await start(),cookie='';
  const send=(route,data,authenticated=false,customOrigin=origin)=>fetch(base+route,{method:'POST',headers:{Origin:customOrigin,'Content-Type':'application/json',...(authenticated?{Cookie:cookie}:{})},body:JSON.stringify(data)});
  const get=(route,authenticated=false)=>fetch(base+route,{headers:authenticated?{Cookie:cookie}:{}});
  try{
    for(const route of ['/','/services.html','/flooring','/estimate','/contact','/projects','/projects.html','/about','/about.html','/admin']){const r=await get(route);assert.equal(r.status,200);const html=await r.text();assert(!html.includes('/_next/'));if(route==='/about')assert(html.includes('40+ years of experience'));}
    const css=await get('/styles.css');assert.equal(css.status,200);assert.equal((await fetch(base+'/styles.css',{headers:{'If-None-Match':css.headers.get('etag')}})).status,304);
    assert.equal((await get('/.env')).status,404);assert.equal((await get('/data/buildex.sqlite')).status,404);
    assert.equal((await get('/api/admin')).status,401);assert.equal((await send('/api/admin',{action:'delete',id:'x'})).status,401);
    assert.equal((await send('/api/login',{},false,'https://other.example')).status,403);
    assert.equal((await (await get('/api/auth')).json()).configured,false);
    await setAdmin(app.db,'owner@example.com','test-only-password-long');
    assert.equal((await send('/api/login',{email:'owner@example.com',password:'wrong-password'})).status,401);
    const login=await send('/api/login',{email:'owner@example.com',password:'test-only-password-long'});assert.equal(login.status,200);assert(login.headers.get('set-cookie').includes('HttpOnly'));assert(login.headers.get('set-cookie').includes('SameSite=Strict'));cookie=login.headers.get('set-cookie').split(';')[0];
    assert.equal((await get('/api/admin',true)).status,200);
    const valid={name:'Test customer',phone:'7135550199',email:'customer@example.com',service:'Flooring',kind:'estimate',description:'Install flooring',address:'Test property',propertyType:'Residential'};
    assert.equal((await send('/api/inquiries',{...valid,email:'invalid'})).status,400);
    assert.equal((await send('/api/inquiries',{...valid,address:''})).status,400);
    assert.equal((await send('/api/inquiries',{...valid,website:'bot'})).status,400);
    assert.equal((await send('/api/inquiries',valid)).status,201);
    assert.equal((await (await get('/api/admin',true)).json()).inquiries[0].name,'Test customer');
    assert.equal((await send('/api/admin',{action:'settings',phone:'7135550100',email:'info@example.com',hours:'Weekdays, 8–5'},true)).status,200);
    assert.equal((await (await get('/api/settings')).json()).hours,'Weekdays, 8–5');
    async function upload(bytes,type,name,auth=true){const data=new FormData();data.set('photo',new File([bytes],name,{type}));return fetch(base+'/api/admin?action=upload',{method:'POST',headers:{Origin:origin,...(auth?{Cookie:cookie}:{})},body:data});}
    assert.equal((await upload('<svg/>','image/svg+xml','bad.svg')).status,400);
    assert.equal((await upload('bad','image/png','bad.png',false)).status,401);
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aStsAAAAASUVORK5CYII=','base64');
    const uploaded=await upload(png,'image/png','test.png');assert.equal(uploaded.status,201);const photo=await uploaded.json();
    assert.equal((await get('/api/media?key='+photo.key)).status,404);assert.equal((await get('/api/media?key='+photo.key,true)).status,200);
    const project={status:'published',name:'Test patio',category:'Patios',description:'Test project',location:'Houston',photos:[{...photo,label:'After'}]};
    const saved=await send('/api/admin',{action:'save',project},true);assert.equal(saved.status,200);project.id=(await saved.json()).id;
    assert.equal((await get('/api/media?key='+photo.key)).status,200);
    assert.equal((await send('/api/admin',{action:'save',project:{...project,status:'draft'}},true)).status,200);
    assert.equal((await (await get('/api/projects')).json()).length,0);
    assert.equal((await get('/api/media?key='+photo.key)).status,404);
    assert.equal((await get('/api/media?key='+photo.key,true)).status,200);
    assert.equal((await send('/api/admin',{action:'save',project},true)).status,200);
    assert.equal((await send('/api/admin',{action:'reorder',ids:[project.id]},true)).status,200);

    project.name='Edited patio';assert.equal((await send('/api/admin',{action:'save',project},true)).status,200);
    assert.equal((await (await get('/api/projects')).json())[0].name,'Edited patio');
    assert.equal((await send('/api/admin',{action:'save',project:{...project,id:'',name:'Stolen photo'}},true)).status,400);
    await app.close();base=await start();
    assert.equal((await (await get('/api/projects')).json())[0].name,'Edited patio');
    assert.equal((await (await get('/api/admin',true)).json()).inquiries.length,1);
    assert.equal((await send('/api/admin',{action:'delete',id:project.id},true)).status,200);
    assert.equal((await (await get('/api/projects')).json()).length,0);assert.equal((await readdir(path.join(directory,'uploads'))).length,0);
    assert.equal((await send('/api/logout',{},true)).status,200);assert.equal((await get('/api/admin',true)).status,401);
    await app.close();app=null;
    const production=await createApp({dataDir:directory,origin:'https://buildex.example',production:true});app=production;app.server.listen(0,'127.0.0.1');await once(app.server,'listening');base=`http://127.0.0.1:${app.server.address().port}`;
    const secure=await send('/api/login',{email:'owner@example.com',password:'test-only-password-long'},false,'https://buildex.example');assert(secure.headers.get('set-cookie').includes('; Secure'));
  }finally{if(app)await app.close();assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));assert(path.basename(directory).startsWith('buildex-test-'));await rm(directory,{recursive:true,force:true});}
});

test('public pages keep local asset links and working form controls',async()=>{
  const root=new URL('../public/',import.meta.url);
  for(const file of ['index','services','flooring','estimate','contact','about','projects']){const html=await readFile(new URL(file+'.html',root),'utf8');assert(html.includes('width=device-width'));assert(html.includes('navigation-toggle'));for(const [,link]of html.matchAll(/href="([^"?#]+\.html)(?:[?#][^"]*)?"/g))await readFile(new URL(link,root));assert(!/chatgpt/i.test(html));}
  const script=await readFile(new URL('site.js',root),'utf8');assert(!script.includes('modelContext'));assert(script.includes("'/inquiries'"));
});
