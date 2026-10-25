// Local-only browser regression. Run after build:forms. Uses an isolated in-memory database.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Readable} from 'node:stream';
import {createFixture,png} from './cms-fixture.mjs';
import worker from '../cloudflare/forms-worker.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_PACKAGE ? pathToFileURL(process.env.PLAYWRIGHT_PACKAGE).href : 'playwright');
const root=fileURLToPath(new URL('..',import.meta.url)),out=path.join(root,'public-launch');
const fixture=await createFixture();
const existing=await worker.fetch(fixture.request('/admin/api/projects',{action:'save',project:{name:'Existing bathroom project',category:'Remodeling',description:'Already saved before this visit',location:'Houston',photos:[],status:'draft'}}),fixture.env,{});
assert.equal(existing.status,200);const existingId=(await existing.json()).id;
for(const [name,service,kind] of [['Alex Morgan','Flooring','estimate'],['Sam Taylor','Patios','contact']]){
 fixture.sql.prepare('INSERT INTO inquiries VALUES(?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),kind,name,'7135550100','customer@example.test',service,JSON.stringify({description:'I would like to discuss my project.',propertyType:'Residential'}),Date.now());
}
fixture.env.ASSETS={async fetch(request){
 const url=new URL(request.url);
 let pathname=decodeURIComponent(url.pathname);if(pathname==='/')pathname='/index.html';
 if(!path.extname(pathname))pathname+='.html';
 const file=path.resolve(out,'.'+pathname);
 if(!file.startsWith(out+path.sep))return new Response('Not found',{status:404});
 try {const content=await readFile(file);const type={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream';
 return new Response(content,{headers:{'Content-Type':type,'X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; img-src 'self' https://images.pexels.com data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'"}});}
 catch{return new Response('Not found',{status:404});}
}};
const server=createServer(async(req,res)=>{try{
 const request=new Request(fixture.env.ADMIN_ORIGIN+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})});
 const response=await worker.fetch(request,fixture.env,{waitUntil(){}});
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
}catch(error){res.writeHead(500);res.end(error.message);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;fixture.env.ADMIN_ORIGIN=fixture.env.PUBLIC_ORIGIN=origin;
const screenshots=path.join(root,'preview','studio');await mkdir(screenshots,{recursive:true});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--disable-gpu']});
 const context=await browser.newContext({viewport:{width:1512,height:1050},reducedMotion:'reduce'});
 await context.addCookies([{name:'buildex_admin',value:fixture.token,url:origin}]);
 await context.route('https://images.pexels.com/**',route=>route.fulfill({body:png,contentType:'image/png'}));
 const page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',msg=>{if(msg.type()==='error'&&!msg.text().includes('favicon'))errors.push(msg.text());});
 await page.goto(origin+'/admin');await page.locator('#dashboard').waitFor({state:'visible'});await page.locator('[data-tab=services]').click();
 assert.equal(await page.locator('#services-list .project-card').count(),7,'Original services are immediately editable');
 for(const view of ['grid','list']){
  await page.locator('[data-service-view='+view+']').click();const cards=page.locator('#services-list .project-card'),first=await cards.first().getAttribute('data-service-id');
  const handle=cards.first().locator('.project-drag-handle');await handle.scrollIntoViewIfNeeded();const start=await handle.boundingBox(),target=await cards.nth(view==='list'?2:1).boundingBox();
  await page.mouse.move(start.x+start.width/2,start.y+start.height/2);await page.mouse.down();await page.mouse.move(target.x+target.width/2,target.y+target.height*.8,{steps:12});await page.locator('.collection-drag-ghost').waitFor({state:'visible'});await page.mouse.up();
  assert.equal(await cards.nth(view==='list'?2:1).getAttribute('data-service-id'),first,'Service drag sorting works in '+view);
 }
 await page.locator('#service-add').click();await page.locator('#service-form [name=name]').fill('Bathroom refresh service');await page.locator('#service-form [name=description]').fill('A service prepared privately for publication.');
 const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1200;c.height=800;const x=c.getContext('2d');x.fillStyle='#597b8c';x.fillRect(0,0,1200,800);x.fillStyle='#c4aa70';x.fillRect(200,200,800,400);return c.toDataURL('image/png').split(',')[1];});
 await page.locator('#service-photo').setInputFiles({name:'Bathroom.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});await page.locator('#crop-dialog').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#apply-crop').disabled);await page.locator('#crop-ratio').selectOption('1.5');await page.waitForFunction(()=>!document.querySelector('#apply-crop').disabled);await page.locator('#apply-crop').click();await page.locator('#crop-dialog').waitFor({state:'hidden'});
 const frame=page.frameLocator('#services-preview');await frame.getByRole('heading',{name:'Bathroom refresh service',exact:true}).waitFor();assert(await frame.locator('.service-card').last().locator('img').evaluate(i=>i.complete),'Local photo shows in live preview');
 const pub=()=>context.request.get(origin+'/api/services').then(r=>r.json());assert.equal((await pub()).length,7,'Unsaved new service is private');
 await page.screenshot({path:path.join(screenshots,'service-editor.png'),fullPage:true});
 await page.locator('[data-save-services=draft]').click();await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Services draft saved'));assert.equal((await pub()).length,7,'Saved draft is private');
 await page.reload();await page.locator('#services-list .project-card').nth(7).waitFor();
 const custom=page.locator('#services-list .project-card').filter({hasText:'Bathroom refresh service'});await custom.getByRole('button',{name:'Edit service →'}).click();await page.locator('#service-recrop').click();await page.locator('#crop-dialog').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#apply-crop').disabled);await page.locator('#apply-crop').click();await page.locator('#crop-dialog').waitFor({state:'hidden'});
 await page.locator('[data-save-services=publish]:visible').click();await page.waitForFunction(()=>document.querySelector('#notice').textContent.startsWith('Services published'));
 let published=await pub();assert.equal(published.at(-1).name,'Bathroom refresh service');const key=published.at(-1).image.key;assert.equal((await context.request.get(origin+'/api/media?key='+key)).status(),200);
 const publicPage=await context.newPage();await publicPage.goto(origin+'/services.html');await publicPage.getByRole('heading',{name:'Bathroom refresh service',exact:true}).waitFor();assert.deepEqual(await publicPage.locator('.service-card h2').allTextContents(),published.map(s=>s.name),'Public services match published order');await publicPage.close();

 await custom.getByRole('button',{name:'Hide',exact:true}).click();assert(await custom.evaluate(card=>card.classList.contains('is-hidden')&&Number(getComputedStyle(card).opacity)<1));assert.equal((await pub()).length,8);
 await page.locator('[data-save-services=publish]:visible').click();await page.waitForFunction(()=>document.querySelector('#notice').textContent.startsWith('Services published'));assert.equal((await pub()).length,7);assert.equal((await fetch(origin+'/api/media?key='+key)).status,404);
 assert.equal(await custom.getByRole('button',{name:'Unhide',exact:true}).count(),1,'Hidden service stays editable in Studio');await page.screenshot({path:path.join(screenshots,'hidden-service.png'),fullPage:true});
 await custom.getByRole('button',{name:'Unhide',exact:true}).click();assert.equal((await pub()).length,7);
 await page.locator('[data-save-services=publish]:visible').click();await page.waitForFunction(()=>document.querySelector('#notice').textContent.startsWith('Services published'));assert.equal((await pub()).length,8);
 await custom.getByRole('button',{name:'Remove',exact:true}).click();await page.locator('#confirm-ok').click();assert.equal((await pub()).length,8,'Removal waits for Publish');await page.locator('#global-preview').click();const preview=page.frameLocator('#website-preview');await preview.locator('.service-card').nth(6).waitFor();await page.waitForFunction(()=>document.querySelector('#website-preview').contentDocument?.querySelectorAll('.service-card').length===7);assert.equal(await preview.locator('.service-card').count(),7);await page.locator('#close-preview').click();
 await page.locator('[data-save-services=publish]:visible').click();await page.waitForFunction(()=>document.querySelector('#notice').textContent.startsWith('Services published'));assert.equal((await pub()).length,7);assert.equal((await fetch(origin+'/api/media?key='+key)).status,404,'Removed photo is unavailable to public visitors');
 await page.setViewportSize({width:390,height:844});await page.locator('[data-service-view=list]').click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Service controls fit mobile');await page.screenshot({path:path.join(screenshots,'services-list-mobile.png'),fullPage:true});
 await page.locator('#services-list .project-card').first().getByRole('button',{name:'Edit service →'}).click();await page.locator('[data-service-size=mobile]').click();await page.screenshot({path:path.join(screenshots,'service-editor-mobile.png'),fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: Services add, crop/re-crop, edit, draft privacy, real preview, publish, public order, drag sorting in both views, removal and mobile layout.');
}catch(error){
 const page=browser?.contexts()[0]?.pages()[0];
 if(page)await page.screenshot({path:path.join(screenshots,'failure.png'),fullPage:true}).catch(()=>{});
 throw error;
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));fixture.sql.close();}
