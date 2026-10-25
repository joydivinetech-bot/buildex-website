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
 assert.equal(await page.locator('#project-list .project-card').count(),1,'Projects opens with existing saved projects');
 assert.match(await page.locator('#project-list').textContent(),/Existing bathroom project/);
 await page.getByRole('button',{name:'Add new',exact:false}).first().click();
 await page.locator('#inline-preview').waitFor({state:'visible'});
 const form=page.locator('#project-form');await form.locator('[name=name]').fill('Sugar Land patio renovation');
 await form.locator('[name=category]').selectOption('Patios');
 await form.locator('[name=location]').fill('Sugar Land, TX');await form.locator('[name=description]').fill('A calm outdoor retreat with room for the whole family.');
 const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1500;c.height=1000;const x=c.getContext('2d'),g=x.createLinearGradient(0,0,1500,1000);g.addColorStop(0,'#9fb7b7');g.addColorStop(1,'#304953');x.fillStyle=g;x.fillRect(0,0,1500,1000);x.fillStyle='#cbd1c5';x.fillRect(200,250,1000,580);x.fillStyle='#193b49';x.fillRect(320,320,330,400);x.fillRect(710,320,360,400);x.fillStyle='#e3ddc9';x.fillRect(150,800,1100,80);return c.toDataURL('image/png').split(',')[1];});
 await page.locator('#photo-upload').setInputFiles([{name:'Completed patio.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')},{name:'Patio detail.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')}]);
 await page.locator('#crop-dialog').waitFor({state:'visible'});
 assert.equal(await page.locator('.photo-card').count(),0,'Photo editor opens before importing photos');
 assert.equal(await page.locator('#crop-title').textContent(),'Edit photo 1 of 2');
 assert.equal(await page.locator('#photo-upload').getAttribute('multiple'),'');
 assert.equal(await page.locator('#crop-selection .crop-thumb').count(),2);
 await page.locator('#crop-zoom').fill('1.2');
 await page.locator('#crop-selection .crop-thumb-select').nth(1).click();
 await page.waitForFunction(()=>document.querySelector('#crop-title').textContent==='Edit photo 2 of 2');
 await page.locator('#crop-selection .crop-thumb-select').first().click();
 await page.waitForFunction(()=>document.querySelector('#crop-title').textContent==='Edit photo 1 of 2');
 assert.equal(await page.locator('#crop-zoom').inputValue(),'1.2','Switching thumbnails preserves crop controls');
 const chooserPromise=page.waitForEvent('filechooser');await page.locator('#crop-add').click();
 const chooser=await chooserPromise;assert.equal(chooser.isMultiple(),true);
 await chooser.setFiles([{name:'Extra one.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')},{name:'Extra two.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')}]);
 await page.waitForFunction(()=>document.querySelectorAll('#crop-selection .crop-thumb').length===4);
 await page.locator('#crop-selection .crop-thumb-remove').last().click();
 await page.locator('#crop-selection .crop-thumb-select').last().click();
 await page.waitForFunction(()=>document.querySelector('#crop-title').textContent==='Edit photo 3 of 3');
 await page.locator('#crop-selection .crop-thumb-remove').last().click();
 await page.waitForFunction(()=>document.querySelector('#crop-title').textContent==='Edit photo 2 of 2');
 await page.locator('#crop-selection .crop-thumb-select').first().click();
 await page.waitForFunction(()=>document.querySelector('#crop-title').textContent==='Edit photo 1 of 2');

 assert.equal(await page.locator('#crop-size').inputValue(),'2560');assert.equal(await page.locator('#crop-quality').inputValue(),'0.92','High quality is the default');
 await page.locator('#crop-rotate').click();await page.locator('#crop-rotate-left').click();
 await page.locator('#crop-flip').click();await page.locator('#crop-flip').click();
 await page.locator('#crop-ratio').selectOption('1');
 await page.locator('#crop-size').selectOption('800');
 await page.locator('#crop-zoom').fill('1.4');await page.locator('#crop-x').fill('0.7');
 await page.waitForFunction(()=>!document.querySelector('#apply-crop').disabled);
 await page.screenshot({path:path.join(screenshots,'photo-editor.png')});
 await page.locator('#apply-crop').click();
 await page.waitForFunction(()=>document.querySelector('#crop-title').textContent==='Edit photo 2 of 2');
 await page.locator('#crop-rotate').click();
 await page.waitForFunction(()=>!document.querySelector('#apply-crop').disabled);
 assert.match(await page.locator('#crop-output').textContent(),/1000 × 1500/);
 await page.locator('#apply-crop').click();await page.locator('#crop-dialog').waitFor({state:'hidden'});
 await page.locator('.photo-card').first().click();
 assert.match(await page.locator('.photo-meta').first().textContent(),/714 × 714/);
 assert.equal(await page.locator('.photo-details').count(),0,'The project has one shared caption, no individual photo captions');
 const oldCover=await page.locator('.photo-card img').first().getAttribute('src');
 await page.locator('.photo-card').nth(1).dragTo(page.locator('.photo-card').first());
 assert.notEqual(await page.locator('.photo-card img').first().getAttribute('src'),oldCover,'Drag and drop changes the cover');
 assert.match(await page.locator('.photo-meta').first().textContent(),/1000 × 1500/);
 await page.evaluate(()=>window.scrollTo(0,0));
 const inline=page.frameLocator('#inline-preview');
 await inline.locator('.media-card').first().waitFor();
 assert.equal(await inline.locator('.media-card').count(),1,'Multiple photos stay in one project album');
 assert.equal(await inline.locator('.media-title').first().textContent(),'Sugar Land patio renovation');
 const inlineCard=inline.locator('.media-card').first();await inlineCard.locator('.album-next').click();assert.equal(await inlineCard.locator('.album-carousel').getAttribute('data-photo-index'),'1');
 await inlineCard.locator('.album-open').click();await inline.locator('#media-viewer').waitFor({state:'visible'});assert.match(await inline.locator('#media-position').textContent(),/2 \/ 2/);await inline.locator('#media-prev').click();assert.match(await inline.locator('#media-position').textContent(),/1 \/ 2/);await inline.locator('#media-close').click();
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
 assert.equal((await(await fetch(origin+'/api/projects')).json())[0].photos[0].height,1500,'Cover ordering and higher-resolution orientation are saved');
 const publicPhotos=(await(await fetch(origin+'/api/projects')).json())[0].photos;
 const publicPage=await context.newPage();let releaseImage;const imageGate=new Promise(resolve=>releaseImage=resolve);
 await publicPage.route('**/api/media?key='+encodeURIComponent(publicPhotos[1].key),async route=>{await imageGate;await route.continue();});
 await publicPage.goto(origin+'/projects.html',{waitUntil:'domcontentloaded'});
 await publicPage.locator('.media-card .album-open').first().waitFor();assert.equal(await publicPage.locator('.media-card').count(),1);
 assert.equal(await publicPage.locator('.media-card .album-open>img:not(.album-outgoing)').getAttribute('loading'),'eager','The first project cover loads immediately');
 assert.equal(await publicPage.locator('.media-card .album-arrow svg').count(),2,'Navigation uses slim SVG chevrons');
 await publicPage.locator('.media-card .album-open').click();
 await publicPage.waitForFunction(()=>document.querySelector('#media-stage>img').naturalWidth>0&&document.querySelector('#media-stage').getAttribute('aria-busy')==='false');
 const previousPhoto=await publicPage.locator('#media-stage>img').getAttribute('src');await publicPage.locator('#media-next').click();
 assert.equal(await publicPage.locator('#media-stage').getAttribute('aria-busy'),'true');assert.equal(await publicPage.locator('#media-stage>img').getAttribute('src'),previousPhoto,'Keep the current image visible while the next photo loads');
 releaseImage();await publicPage.waitForFunction(()=>document.querySelector('#media-stage').getAttribute('aria-busy')==='false');
 assert.notEqual(await publicPage.locator('#media-stage>img').getAttribute('src'),previousPhoto);
 assert.match(await publicPage.locator('#media-position').textContent(),/2 \/ 2/);await publicPage.locator('#media-prev').click();
 assert.match(await publicPage.locator('#media-position').textContent(),/1 \/ 2/);
 const left=await publicPage.locator('#media-prev').boundingBox(),right=await publicPage.locator('#media-next').boundingBox(),stage=await publicPage.locator('#media-stage').boundingBox();
 assert(left.x-stage.x<30&&stage.x+stage.width-right.x-right.width<30,'Popup arrows are at opposite image edges');
 await publicPage.screenshot({path:path.join(screenshots,'public-project-album.png')});await publicPage.close();
 // Every project gets a taller row; four progress dots run through a complete loop.
 const layoutPage=await context.newPage();await layoutPage.emulateMedia({reducedMotion:'no-preference'});
 const published=(await(await fetch(origin+'/api/projects')).json())[0];
 await layoutPage.route('**/api/projects',route=>route.fulfill({contentType:'application/json',body:JSON.stringify([0,1,2].map(i=>({...published,id:'layout-'+i,name:['Patio renovation','Outdoor project','Project collection'][i],photos:[...published.photos,...published.photos]})))}));
 await layoutPage.goto(origin+'/projects.html');await layoutPage.locator('.project-service-card').nth(2).waitFor();
 const rows=await layoutPage.locator('.project-service-card').evaluateAll(cards=>cards.map(card=>{
   const box=card.getBoundingClientRect(),photo=card.querySelector('.album-carousel').getBoundingClientRect(),copy=card.querySelector('.project-card-copy').getBoundingClientRect();
   return {x:box.x,y:box.y,width:box.width,height:box.height,photoX:photo.x,copyX:copy.x,photoY:photo.y,copyY:copy.y};
 }));
 for(let i=0;i<rows.length;i++){assert(rows[i].height>=440,'Desktop project rows are taller');assert(i%2?rows[i].photoX>rows[i].copyX:rows[i].photoX<rows[i].copyX,'Project rows alternate photo sides');assert(Math.abs(rows[i].photoY-rows[i].copyY)<2);if(i)assert(rows[i].y>=rows[i-1].y+rows[i-1].height,'Projects stack as full-width rows');}
 assert.equal(await layoutPage.locator('.album-playback').count(),0,'The visible pause icon is removed');
 const carousel=layoutPage.locator('.album-carousel').first();await carousel.scrollIntoViewIfNeeded();
 assert.equal(await carousel.locator('.album-dot').count(),4,'One progress dot per photo');
 await carousel.locator('.album-dot').first().click();
 const cycleStart=Date.now();
 await layoutPage.waitForFunction(()=>{const root=document.querySelector('.album-carousel');return root.dataset.photoIndex==='0'&&Number(root.dataset.progress)>.2&&Number(root.dataset.progress)<.8;},null,{timeout:2500});
 assert.match(await carousel.locator('.album-dot').first().evaluate(dot=>getComputedStyle(dot,'::after').backgroundImage),/linear-gradient/,'The active indicator fills as a straight bar');
 await layoutPage.waitForFunction(()=>document.querySelector('.album-carousel').dataset.photoIndex==='1',null,{timeout:4500});
 assert(Date.now()-cycleStart>=2800&&Date.now()-cycleStart<4500,'Each photo advances after three seconds');
 for(const next of ['2','3','0'])await layoutPage.waitForFunction(next=>document.querySelector('.album-carousel').dataset.photoIndex===next,next,{timeout:4500});
 assert.equal(await carousel.getAttribute('data-autoplay'),'playing','The fourth photo loops continuously to the first');
 await carousel.locator('.album-next').click();assert.equal(await carousel.getAttribute('data-photo-index'),'1','Manual arrows remain available');
 assert(Number(await carousel.getAttribute('data-progress'))<.15,'Manual selection resets the dot timer');
 await carousel.locator('.album-prev').click();
 await layoutPage.waitForFunction(()=>{const image=document.querySelector('.album-open>img:not(.album-outgoing)');return image.complete&&image.getAnimations().every(animation=>animation.playState==='finished');});
 await layoutPage.screenshot({path:path.join(screenshots,'project-rows-desktop.png'),fullPage:true});
 await layoutPage.setViewportSize({width:390,height:844});assert(await layoutPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Project rows fit mobile');
 const mobileRow=await layoutPage.locator('.project-service-card').first().evaluate(card=>{const photo=card.querySelector('.album-carousel').getBoundingClientRect(),copy=card.querySelector('.project-card-copy').getBoundingClientRect();return {photoBottom:photo.bottom,copyTop:copy.top};});assert(mobileRow.copyTop>=mobileRow.photoBottom,'Mobile stacks details under the photo');
 await layoutPage.screenshot({path:path.join(screenshots,'project-rows-mobile.png'),fullPage:true});await layoutPage.close();
 // The hero must start even while another image keeps window.load pending.
 const heroPage=await context.newPage();await heroPage.emulateMedia({reducedMotion:'no-preference'});await heroPage.route('**/buildex-logo.png',()=>{});
 await heroPage.route('https://images.pexels.com/**',route=>route.fulfill({body:Buffer.from(image,'base64'),contentType:'image/png'}));
 await heroPage.goto(origin+'/',{waitUntil:'domcontentloaded'});
 await heroPage.bringToFront();
 try{await heroPage.waitForFunction(()=>[...document.querySelectorAll('.hero-slide')].findIndex(image=>image.classList.contains('is-active'))>0,null,{timeout:10000});}
 catch(error){console.log(await heroPage.evaluate(()=>({hidden:document.hidden,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,ready:document.readyState,slides:[...document.querySelectorAll('.hero-slide')].map(image=>({complete:image.complete,width:image.naturalWidth,active:image.classList.contains('is-active')}))})));throw error;}
 assert.equal(await heroPage.evaluate(()=>document.readyState),'interactive','Hero playback does not wait for window.load');
 await heroPage.locator('#project-results .album-open').first().waitFor();assert.equal(await heroPage.locator('#project-results .project-service-card').count(),1,'Homepage uses the shared Services-style album');
 await heroPage.locator('#project-results .album-next').click();await heroPage.locator('#project-results .album-open').click();
 assert.match(await heroPage.locator('#project-position').textContent(),/2 \/ 2/);await heroPage.locator('#project-prev').click();assert.match(await heroPage.locator('#project-position').textContent(),/1 \/ 2/);await heroPage.locator('#project-close').click();
 await heroPage.close();
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
 await page.locator('#crop-dialog').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#apply-crop').disabled);await page.locator('#apply-crop').click();await page.locator('#crop-dialog').waitFor({state:'hidden'});
 await page.locator('.photo-card').nth(2).waitFor();
 await page.waitForFunction(()=>document.querySelector('#edit-state').textContent.includes('Recoverable'));
 page.once('dialog',dialog=>dialog.accept());
 await page.reload();await page.locator('#restore-edit').waitFor();await page.locator('#restore-edit').click();
 assert.equal(await page.locator('#project-form [name=description]').inputValue(),'Recovered on this device');
 assert.equal(await page.locator('.photo-card').count(),3);
 assert(await page.locator('.photo-card img').last().evaluate(image=>image.complete&&image.naturalWidth>0),'Local photo blobs recover too');
 await page.locator('#back-projects').click();await page.locator('#confirm-ok').click();
 assert.equal(await page.locator('#project-list .project-card').count(),2,'Saved projects are retained alongside new posts');
 const posted=page.locator('.project-card').filter({hasText:'Private new project title'});
 await posted.locator('.album-next').click();await posted.locator('.album-open').click();await page.locator('#project-viewer').waitFor({state:'visible'});
 assert.match(await page.locator('#project-viewer-position').textContent(),/2 \/ 2/);await page.locator('#project-viewer-prev').click();assert.match(await page.locator('#project-viewer-position').textContent(),/1 \/ 2/);
 await page.screenshot({path:path.join(screenshots,'admin-project-album.png')});await page.locator('#project-viewer-close').click();
 await page.screenshot({path:path.join(screenshots,'project-collection.png'),fullPage:true});
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
 await page.locator('[data-tab=projects]').click();await page.locator('.project-card').filter({hasText:'Private new project title'}).getByRole('button',{name:'Edit project →'}).click();
 await page.frameLocator('#inline-preview').locator('.media-card').first().waitFor();
 assert.equal(await page.locator('[data-inline-size=mobile]').getAttribute('aria-pressed'),'true');
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow in mobile editor');
 await page.screenshot({path:path.join(screenshots,'editor-mobile.png'),fullPage:true});
 // Returning via the Projects navigation always shows the saved collection.
 await page.locator('[data-tab=projects]').click();await page.locator('#project-collection').waitFor({state:'visible'});
 await page.getByRole('button',{name:'Add new',exact:false}).first().click();
 await page.locator('#photo-upload').setInputFiles([{name:'Skip.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')},{name:'Cancel.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')}]);
 await page.locator('#crop-dialog').waitFor({state:'visible'});await page.screenshot({path:path.join(screenshots,'photo-editor-mobile.png')});
 await page.locator('#skip-crop').click();await page.waitForFunction(()=>document.querySelector('#crop-title').textContent==='Edit photo 2 of 2');
 await page.keyboard.press('Escape');await page.locator('#crop-dialog').waitFor({state:'hidden'});
 await page.waitForFunction(()=>!document.querySelector('#photo-upload').disabled);
 assert.equal(await page.locator('.photo-card').count(),0);assert.equal(await page.locator('#photo-upload').isEnabled(),true,'Cancel releases the import queue');
 await page.locator('#back-projects').click();await page.locator('#project-collection').waitFor({state:'visible'});
 await page.locator('.project-card').filter({hasText:'Private new project title'}).locator('.album-open').click();await page.locator('#project-viewer').waitFor({state:'visible'});
 await page.locator('#project-viewer-next').click();assert.match(await page.locator('#project-viewer-position').textContent(),/2 \/ 2/);
 assert(await page.locator('#project-viewer').evaluate(dialog=>dialog.scrollWidth<=dialog.clientWidth+1),'Mobile album has no horizontal overflow');
 await page.screenshot({path:path.join(screenshots,'project-album-mobile.png')});await page.locator('#project-viewer-close').click();

 // Admin-only collection views and arbitrary drag ordering both persist correctly.
 await page.setViewportSize({width:1512,height:1050});
 for(const view of ['grid','list']){
   await page.locator('[data-project-view='+view+']').click();
   assert.equal(await page.locator('#project-list').getAttribute('data-view'),view);
   const ids=await page.locator('#project-list .project-card').evaluateAll(cards=>cards.map(c=>c.dataset.projectId));
   const handle=page.locator('#project-list .project-card').first().locator('.project-drag-handle');
   await handle.scrollIntoViewIfNeeded();const start=await handle.boundingBox(),target=await page.locator('#project-list .project-card').last().boundingBox();
   await page.mouse.move(start.x+start.width/2,start.y+start.height/2);await page.mouse.down();await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:12});await page.mouse.up();
   await page.locator('#confirm-dialog').waitFor({state:'visible'});await page.locator('#confirm-ok').click();
   await page.waitForFunction(id=>document.querySelector('#project-list .project-card:last-child').dataset.projectId===id,ids[0]);
   const saved=await (await context.request.get(origin+'/admin/api/site')).json();assert.equal(saved.projects.at(-1).id,ids[0],'Drag order is saved');
   await page.screenshot({path:path.join(screenshots,'collection-'+view+'.png'),fullPage:true});
 }
 await page.reload();await page.locator('#project-collection').waitFor({state:'visible'});assert.equal(await page.locator('#project-list').getAttribute('data-view'),'list','View preference survives reload');
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(screenshots,'collection-list-mobile.png'),fullPage:true});
 assert.equal(fixture.sql.prepare('SELECT name FROM projects WHERE id=?').get(existingId).name,'Existing bathroom project','Existing projects are preserved');
 assert.deepEqual(errors.filter(error=>!error.includes('503')),[]);
 console.log('PASS: actual Worker + SQLite, upload, crop, inline lightbox, draft privacy, publish, all seven previews, preview navigation, recovery, empty-editor preview, desktop and mobile layout; no JS/CSP errors.');
 console.log('Screenshots: '+screenshots);
}catch(error){
 const page=browser?.contexts()[0]?.pages()[0];
 if(page)await page.screenshot({path:path.join(screenshots,'failure.png'),fullPage:true}).catch(()=>{});
 throw error;
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));fixture.sql.close();}
