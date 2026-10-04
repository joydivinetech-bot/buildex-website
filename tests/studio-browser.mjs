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
 const context=await browser.newContext({viewport:{width:1512,height:1050}});
 await context.addCookies([{name:'buildex_admin',value:fixture.token,url:origin}]);
 await context.route('https://images.pexels.com/**',route=>route.fulfill({body:png,contentType:'image/png'}));
 const page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',msg=>{if(msg.type()==='error'&&!msg.text().includes('favicon'))errors.push(msg.text());});
 await page.goto(origin+'/admin');await page.locator('#dashboard').waitFor({state:'visible'});
 await page.locator('[data-tab=inquiries]').click();
 await page.locator('#inquiry-list .text-button').first().click();
 await page.locator('#inquiry-dialog').waitFor({state:'visible'});
 assert.match(await page.locator('#inquiry-detail').textContent(),/discuss my project/);
 await page.locator('#close-inquiry').click();
 await page.locator('#inquiry-list select').first().selectOption('contacted');
 await page.waitForFunction(()=>document.querySelector('#notice').textContent==='Inquiry status updated.');
 const csv=await context.request.get(origin+'/admin/api/inquiries.csv');assert.equal(csv.status(),200);assert.match(await csv.text(),/Alex Morgan/);
 await page.locator('[data-tab=projects]').click();
 await page.getByRole('button',{name:'Add project',exact:false}).first().click();
 await page.locator('#inline-preview').waitFor({state:'visible'});
 const form=page.locator('#project-form');await form.locator('[name=name]').fill('Sugar Land patio renovation');
 await form.locator('[name=category]').selectOption('Patios');
 await form.locator('[name=location]').fill('Sugar Land, TX');await form.locator('[name=description]').fill('A calm outdoor retreat with room for the whole family.');
 const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1500;c.height=1000;const x=c.getContext('2d'),g=x.createLinearGradient(0,0,1500,1000);g.addColorStop(0,'#9fb7b7');g.addColorStop(1,'#304953');x.fillStyle=g;x.fillRect(0,0,1500,1000);x.fillStyle='#cbd1c5';x.fillRect(200,250,1000,580);x.fillStyle='#193b49';x.fillRect(320,320,330,400);x.fillRect(710,320,360,400);x.fillStyle='#e3ddc9';x.fillRect(150,800,1100,80);return c.toDataURL('image/png').split(',')[1];});
 await page.locator('#photo-upload').setInputFiles([{name:'Completed patio.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')},{name:'Patio detail.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')}]);
 await page.locator('.photo-card').nth(1).waitFor();
 await page.getByRole('button',{name:'Crop & resize'}).first().click();
 await page.locator('#crop-dialog').waitFor({state:'visible'});
 await page.locator('#crop-ratio').selectOption('1');
 await page.locator('#crop-size').selectOption('800');
 await page.locator('#crop-zoom').fill('1.4');await page.locator('#crop-x').fill('0.7');
 await page.waitForFunction(()=>!document.querySelector('#apply-crop').disabled);
 await page.screenshot({path:path.join(screenshots,'photo-editor.png')});
 await page.locator('#apply-crop').click();
 assert.match(await page.locator('.photo-meta').first().textContent(),/714 × 714/);
 const inline=page.frameLocator('#inline-preview');
 await inline.locator('.media-card').nth(1).waitFor();
 assert.equal(await inline.locator('.media-title').first().textContent(),'Sugar Land patio renovation');
 await inline.locator('.media-card').first().click();await inline.locator('#media-viewer').waitFor({state:'visible'});await inline.locator('#media-close').click();
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:path.join(screenshots,'project-editor.png'),fullPage:true});
 let uploads=0;
 await context.route('**/admin/api/projects/upload',route=>++uploads===2?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Simulated upload interruption'})}):route.continue());
 await page.locator('#save-draft').click();await page.waitForFunction(()=>document.querySelector('#notice').textContent==='Simulated upload interruption');
 await context.unroute('**/admin/api/projects/upload');
 await page.locator('#save-draft').click();await page.waitForFunction(()=>document.querySelector('#notice').textContent.startsWith('Draft saved.'));
 assert.equal(fixture.sql.prepare('SELECT count(*) n FROM photos').get().n,2,'Retry reuses successfully uploaded files');
 assert.equal((await(await fetch(origin+'/api/projects')).json()).length,0);
 await page.locator('#publish-project').click();await page.locator('#confirm-ok').click();
 await page.waitForFunction(()=>document.querySelector('#notice').textContent.startsWith('Project published.'));
 assert.equal((await(await fetch(origin+'/api/projects')).json())[0].name,'Sugar Land patio renovation');
 // Save private changes to an already published project, then verify the live row.
 await form.locator('[name=name]').fill('Private new project title');
 await page.locator('#save-draft').click();await page.waitForFunction(()=>document.querySelector('#notice').textContent.startsWith('Draft saved.'));
 assert.equal((await(await fetch(origin+'/api/projects')).json())[0].name,'Sugar Land patio renovation');
 await page.locator('#global-preview').click();
 for(const name of ['home','services','flooring','estimate','projects','about','contact']){
  await page.locator('#preview-page').selectOption(name);
  await page.waitForFunction(name=>document.querySelector('#website-preview').contentDocument?.body?.dataset.adminPreview==='true'&&document.querySelector('#website-preview').contentWindow.location.search.includes('page='+name),name);
 }
 const frame=page.frameLocator('#website-preview');
 await frame.getByRole('link',{name:'Our projects',exact:true}).first().click();
 await frame.locator('.media-card').first().waitFor();
 await page.locator('#close-preview').click();
 // Local recovery includes pending text edits after a reload.
 await form.locator('[name=description]').fill('Recovered on this device');
 await page.locator('#photo-upload').setInputFiles([{name:'Unsaved extra.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')}]);
 await page.locator('.photo-card').nth(2).waitFor();
 await page.waitForFunction(()=>document.querySelector('#edit-state').textContent.includes('Recoverable'));
 page.once('dialog',dialog=>dialog.accept());
 await page.reload();await page.locator('#restore-edit').waitFor();await page.locator('#restore-edit').click();
 assert.equal(await page.locator('[name=description]').inputValue(),'Recovered on this device');
 assert.equal(await page.locator('.photo-card').count(),3);
 assert(await page.locator('.photo-card img').last().evaluate(image=>image.complete&&image.naturalWidth>0),'Local photo blobs recover too');
 await page.locator('#back-projects').click();await page.locator('#confirm-ok').click();
 // Empty editor no longer gates project preview behind required-field validation.
 await page.locator('#global-preview').click();await page.frameLocator('#website-preview').locator('.media-card').first().waitFor();await page.locator('#close-preview').click();
 await page.locator('[data-tab=overview]').click();
 await page.screenshot({path:path.join(screenshots,'overview-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});
 for(const section of ['overview','projects','media','inquiries']){
  await page.locator('[data-tab='+section+']').click();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow in '+section);
 }
 await page.locator('[data-tab=overview]').click();
 await page.screenshot({path:path.join(screenshots,'overview-mobile.png'),fullPage:true});
 await page.locator('[data-tab=projects]').click();await page.getByRole('button',{name:'Edit project →'}).first().click();
 await page.frameLocator('#inline-preview').locator('.media-card').first().waitFor();
 assert.equal(await page.locator('[data-inline-size=mobile]').getAttribute('aria-pressed'),'true');
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow in mobile editor');
 await page.screenshot({path:path.join(screenshots,'editor-mobile.png'),fullPage:true});
 assert.deepEqual(errors.filter(error=>!error.includes('503')),[]);
 console.log('PASS: actual Worker + SQLite, upload, crop, inline lightbox, draft privacy, publish, all seven previews, preview navigation, recovery, empty-editor preview, desktop and mobile layout; no JS/CSP errors.');
 console.log('Screenshots: '+screenshots);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));fixture.sql.close();}
