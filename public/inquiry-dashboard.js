import {categories, pages, cropRect, formatBytes, photoMetadata, previewCollection} from './cms-utils.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const el = (tag, text = '', className = '') => {const node = document.createElement(tag); node.textContent = text; node.className = className; return node;};
const action = (label, handler, className = 'text-button') => {const button = el('button', label, className); button.type = 'button'; button.addEventListener('click', handler); return button;};
let projects = [], inquiries = [], working = null, dirty = false, busy = false, user = '', storageMode = 'database', challenge = '';
let recoveryTimer, previewTimer, dragIndex = null, crop = null, cropGeneration = 0, cropTimer;
let inlineSize = 'desktop', currentPage = 'home', restoreRecord = null, authLost = false;
const urls = new Set();
const objectURL = blob => {const url = URL.createObjectURL(blob); urls.add(url); return url;};
const photoURL = photo => photo.src || '/admin/api/media?key=' + encodeURIComponent(photo.key);
const badge = project => el('span', project.hasDraft ? 'Unpublished changes' : project.status === 'published' ? 'Published' : 'Draft', 'badge ' + (project.hasDraft ? 'changes' : project.status));
const date = value => new Date(value).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'});
const notice = (message, error = false) => {$('#notice').hidden = !message; $('#notice').textContent = message; $('#notice').classList.toggle('error', error);};
function fail(message) {notice(message, true);}
async function api(path, options = {}) {
  const response = await fetch(path, {...options, headers: options.body instanceof FormData ? {} : {'Content-Type':'application/json'}});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) authLost = true;
    throw Object.assign(Error(data.error || 'Could not complete the request. Please try again.'), {status: response.status});
  }
  return data;
}
const post = (path, body) => api(path, {method:'POST', body:JSON.stringify(body)});
function setBusy(value) {
  busy = value;
  $('#editor-fields').disabled = value;
  ['save-draft','publish-project','photo-upload','unpublish-project','discard-draft','refresh','sign-out'].forEach(id => $('#' + id).disabled = value);
  $('#dashboard').setAttribute('aria-busy', String(value));
}
async function run(task) {
  if (busy) return;
  setBusy(true);
  try {await task();} catch (error) {fail(error.message); if (authLost) showLogin('Your session expired. Sign in again to continue your edit.');}
  finally {setBusy(false);}
}
function confirmAction(title, copy, label = 'Continue', danger = false) {
  const dialog = $('#confirm-dialog');
  $('#confirm-title').textContent = title; $('#confirm-copy').textContent = copy;
  $('#confirm-ok').textContent = label; $('#confirm-ok').classList.toggle('danger', danger);
  dialog.returnValue = ''; dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'), {once:true}));
}
$('#confirm-ok').addEventListener('click', () => $('#confirm-dialog').close('yes'));
$('#confirm-cancel').addEventListener('click', () => $('#confirm-dialog').close('no'));

let localDB;
function draftDB() {
  return localDB ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('buildex-studio', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function recoveryStore(mode, value) {
  if (!user) return;
  const db = await draftDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', mode === 'get' ? 'readonly' : 'readwrite'), store = tx.objectStore('drafts');
    const request = mode === 'get' ? store.get(user) : mode === 'delete' ? store.delete(user) : store.put(value, user);
    tx.oncomplete = () => resolve(request.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
const cleanWorking = () => working && {...working, photos:working.photos.map(({src, ...photo}) => photo)};
async function clearRecovery() {clearTimeout(recoveryTimer); await recoveryStore('delete').catch(() => {}); $('#recovery').hidden = true;}
function changed() {
  if (!working) return;
  dirty = true; updateEditorState();
  clearTimeout(recoveryTimer);
  recoveryTimer = setTimeout(async () => {
    try {await recoveryStore('set', cleanWorking()); if (dirty) $('#edit-state').textContent = 'Unsaved changes · Recoverable on this device';}
    catch {$('#edit-state').textContent = 'Unsaved changes · Use Save draft to keep this edit';}
  }, 600);
  clearTimeout(previewTimer); previewTimer = setTimeout(sendPreviews, 220);
}
function updateEditorState() {
  $('#editor-title').textContent = working?.name || 'New project';
  $('#description-count').textContent = (working?.description.length || 0).toLocaleString() + ' / 3,000';
  $('#edit-state').textContent = dirty ? 'Unsaved changes' : working?.updated_at ? 'Draft saved · ' + new Date(working.updated_at).toLocaleString() : 'Not saved yet';
  if (!dirty && working?.status === 'published' && !working.hasDraft) $('#edit-state').textContent = 'Published · ' + date(working.updated_at);
  $('#publish-project').textContent = working?.status === 'published' ? 'Publish changes ↗' : 'Publish project ↗';
  $('#unpublish-project').hidden = working?.status !== 'published';
  $('#discard-draft').hidden = !working?.hasDraft;
}
function openTab(name) {
  if (!['overview','projects','media','inquiries'].includes(name)) name = 'overview';
  $$('[data-panel]').forEach(panel => panel.hidden = panel.dataset.panel !== name);
  $$('[data-tab]').forEach(button => {button.classList.toggle('active', button.dataset.tab === name); button.setAttribute('aria-current', button.dataset.tab === name ? 'page' : 'false');});
  $('#section-name').textContent = {overview:'Overview', projects:'Projects', media:'Photo library', inquiries:'Inquiries'}[name];
  history.replaceState(null, '', '#' + name);
  if (name === 'projects' && working) requestAnimationFrame(sizeInline);
}
$$('[data-tab]').forEach(button => button.addEventListener('click', () => openTab(button.dataset.tab)));
$$('[data-open]').forEach(button => button.addEventListener('click', () => openTab(button.dataset.open)));

function showLogin(message) {
  $('#login').hidden = false; $('#dashboard').hidden = true;
  $('#login-message').textContent = message || 'Sign in using the code sent to the Buildex administrator email.';
}
async function load(initial = false) {
  const [site, inbox] = await Promise.all([api('/admin/api/site'), api('/admin/api/inquiries')]);
  user = site.user.email; projects = site.projects; inquiries = inbox.inquiries;
  storageMode = site.storageMode || 'database'; authLost = false;
  $('#account').textContent = user; $('#dashboard').hidden = false; $('#login').hidden = true;
  renderAll();
  if (initial && !working) {
    restoreRecord = await recoveryStore('get').catch(() => null);
    $('#recovery').hidden = !restoreRecord;
  }
}
async function requestCode() {
  $('#send-code').disabled = $('#resend-code').disabled = true;
  try {const data = await post('/admin/api/auth/request-code', {}); challenge = data.challenge; $('#code-form').hidden = false; $('#login-message').textContent = 'Code sent to ' + data.destination; $('#login-code').focus();}
  catch (error) {$('#login-message').textContent = error.message;}
  finally {$('#send-code').disabled = $('#resend-code').disabled = false;}
}
$('#send-code').addEventListener('click', requestCode);
$('#resend-code').addEventListener('click', requestCode);
$('#code-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  try {await post('/admin/api/auth/verify', {challenge, code:$('#login-code').value.trim()}); await load(true); if (working) sendPreviews();}
  catch(error) {$('#login-message').textContent = error.message;}
  finally {button.disabled = false;}
});
$('#sign-out').addEventListener('click', async () => {
  if (busy || dirty && !await confirmAction('Sign out?', 'Your unfinished edit will be removed from this device. Save a draft first if you want to keep it.', 'Sign out')) return;
  await run(async () => {await post('/admin/api/auth/logout', {}); await clearRecovery(); releaseEditor(); working = null; inquiries = []; projects = []; $('#code-form').hidden = true; showLogin('Signed out securely.');});
});
$('#refresh').addEventListener('click', () => run(async () => {await load(); notice('Workspace refreshed.');}));
$('#mobile-sign-out').addEventListener('click',()=>$('#sign-out').click());
function renderAll() {renderOverview(); renderProjects(); renderMedia(); renderInquiries();}
function empty(container, heading, copy) {const box = el('div', '', 'empty-state'); box.append(el('strong', heading), el('p', copy)); container.append(box);}
function renderOverview() {
  const pending = inquiries.filter(item => item.status === 'new').length;
  $('#new-count').textContent = pending || ''; $('#project-count').textContent = projects.length || '';
  $('#summary').replaceChildren(...[
    ['Published projects', projects.filter(p => p.status === 'published').length, 'Visible on your website'],
    ['Drafts & changes', projects.filter(p => p.status === 'draft' || p.hasDraft).length, 'Ready for your attention'],
    ['Project photos', projects.reduce((n,p) => n + p.photos.length, 0), 'In your saved collection'],
    ['New inquiries', pending, 'Waiting for a conversation']
  ].map(([label, count, hint]) => {const card = el('div', '', 'stat'); card.append(el('span', label), el('strong', String(count)), el('small', hint)); return card;}));
  const recent = $('#recent-projects'); recent.replaceChildren();
  [...projects].sort((a,b) => b.updated_at - a.updated_at).slice(0,4).forEach(project => {
    const row = el('div', '', 'recent-row'), img = project.photos[0] ? document.createElement('img') : el('div', '', 'recent-placeholder');
    if (project.photos[0]) {img.src = photoURL(project.photos[0]); img.alt = '';}
    const copy = el('div', '', 'row-main'); copy.append(el('strong', project.name), el('small', project.category + ' · ' + date(project.updated_at)));
    row.append(img, copy, action('Edit →', () => editProject(project))); recent.append(row);
  });
  if (!projects.length) empty(recent, 'Your work belongs here', 'Add your first project to start your collection.');
  const latest = $('#recent-inquiries'); latest.replaceChildren();
  inquiries.slice(0,4).forEach(item => {const row = el('div', '', 'recent-row'), copy = el('div', '', 'row-main'); copy.append(el('strong', item.name), el('small', item.service + ' · ' + date(item.created_at))); row.append(copy, el('span', item.status, 'badge ' + item.status), action('View →', () => viewInquiry(item))); latest.append(row);});
  if (!inquiries.length) empty(latest, 'A clear inbox', 'New website inquiries will appear here.');
}
function renderProjects() {
  const query = $('#project-search').value.toLowerCase(), filter = $('#project-filter').value, category = $('#category-filter').value;
  const selected = projects.filter(p => (!query || [p.name,p.location].join(' ').toLowerCase().includes(query)) && (filter === 'all' || (filter === 'changes' ? p.hasDraft : p.status === filter)) && (category === 'all' || p.category === category));
  const list = $('#project-list'); list.replaceChildren(); $('#project-results').textContent = selected.length + ' projects';
  for (const project of selected) {
    const card = el('article', '', 'project-card'), image = el('div', '', 'project-image');
    if (project.photos[0]) {const img = document.createElement('img'); img.src = photoURL(project.photos[0]); img.alt = project.photos[0].label; img.loading = 'lazy'; image.append(img);}
    else image.append(el('span','▧'));
    image.append(badge(project));
    const copy = el('div', '', 'project-content'); copy.append(el('h3',project.name), el('p',[project.category,project.location].filter(Boolean).join(' · ')));
    const meta = el('div','','card-meta'); meta.append(el('span',project.photos.length + ' photos'),el('span','Updated ' + date(project.updated_at)));
    const actions = el('div','','card-actions'), move = el('div','','move'), index = projects.indexOf(project);
    actions.append(action('Edit project →', () => editProject(project)), action('Delete', () => deleteProject(project), 'text-button danger-text'));
    for (const [label,to] of [['↑',index-1],['↓',index+1]]) {const button = action(label, () => reorderProject(index,to)); button.disabled = to<0 || to>=projects.length; button.setAttribute('aria-label',(label==='↑'?'Move earlier: ':'Move later: ') + project.name); move.append(button);}
    actions.append(move); copy.append(meta,actions); card.append(image,copy); list.append(card);
  }
  if (!selected.length) empty(list,'No projects to show', projects.length ? 'Try another search or filter.' : 'Add a project, choose your photos and preview it before publishing.');
}
async function reorderProject(from,to) {
  if (!await confirmAction('Change project order?', 'This updates the order of published projects on the website.', 'Update order')) return;
  await run(async () => {const ordered = [...projects], [item] = ordered.splice(from,1); ordered.splice(to,0,item); await post('/admin/api/projects',{action:'reorder',ids:ordered.map(p=>p.id)}); projects = ordered; renderProjects(); sendPreviews(); notice('Project order updated.');});
}
async function deleteProject(project) {
  if (busy || !await confirmAction('Delete “' + project.name + '”?','This permanently removes the project, its saved draft and its uploaded photos.', 'Delete project',true)) return;
  await run(async () => {await post('/admin/api/projects',{action:'delete',id:project.id}); if (working?.id === project.id) {await clearRecovery(); releaseEditor(); working=null; $('#editor').hidden=true; $('#project-collection').hidden=false;} await load(); notice('Project deleted.');});
}
function renderMedia() {
  const query = $('#media-search').value.toLowerCase(), list = $('#media-list'); list.replaceChildren(); let count=0;
  for (const project of projects) for (const photo of project.photos) {
    if (query && ![project.name,photo.label].join(' ').toLowerCase().includes(query)) continue;
    count++;
    const card=el('article','','library-card'), image=document.createElement('img'), copy=el('div');
    image.src=photoURL(photo); image.alt=photo.label; image.loading='lazy';
    copy.append(el('h3',photo.label), el('p',project.name), el('p',photoMetadata(photo)), action('Open project →',()=>editProject(project)));
    card.append(image,copy); list.append(card);
  }
  $('#media-count').textContent=count+' photos';
  if(!count) empty(list,'Your saved photography lives here','Add photos from the project editor, then save your draft.');
}
function renderInquiries() {
  const query=$('#search').value.toLowerCase(), status=$('#status-filter').value, list=$('#inquiry-list');
  const selected=inquiries.filter(i=>(status==='all'||i.status===status)&&(!query||[i.name,i.phone,i.email,i.service].join(' ').toLowerCase().includes(query)));
  list.replaceChildren(); $('#result-count').textContent=selected.length+' inquiries'; $('#inquiry-empty').hidden=!!selected.length;
  selected.forEach(item=>{
    const row=el('tr'), customer=el('td'), service=el('td'), received=el('td',date(item.created_at)), state=el('td'), actions=el('td');
    customer.append(el('strong',item.name),el('small',item.phone)); service.append(el('strong',item.service),el('small',item.kind==='estimate'?'Estimate request':'Contact request'));
    const select=document.createElement('select'); select.setAttribute('aria-label','Status for '+item.name);
    for(const value of ['new','contacted','closed']) {const option=el('option',value[0].toUpperCase()+value.slice(1)); option.value=value; option.selected=value===item.status; select.append(option);}
    select.addEventListener('change',()=>run(async()=>{try {await post('/admin/api/inquiries',{action:'status',id:item.id,status:select.value}); item.status=select.value; renderOverview(); renderInquiries(); notice('Inquiry status updated.');} catch(error) {select.value=item.status; throw error;}}));
    state.append(select); actions.append(action('View details →',()=>viewInquiry(item))); row.append(customer,service,received,state,actions); list.append(row);
  });
}
function viewInquiry(item) {
  const root=$('#inquiry-detail'); root.replaceChildren();
  root.append(el('span',item.kind==='estimate'?'ESTIMATE REQUEST':'CONTACT REQUEST','eyebrow'));
  const title=el('h2',item.name); title.id='inquiry-title'; root.append(title,el('span',item.status,'badge '+item.status));
  const details=el('dl'), values={'Received':new Date(item.created_at).toLocaleString(),'Service':item.service,'Phone':item.phone,'Email':item.email,'Address':item.details.address,'Property':item.details.propertyType,'Project size':item.details.size,'Timeline':item.details.startDate,'Budget':item.details.budget,'Message':item.details.description};
  for (const [name,value] of Object.entries(values)) if(value) details.append(el('dt',name),el('dd',value));
  const actions=el('div','','actions');
  const call=el('a','Call customer','button'); call.href='tel:'+item.phone.replace(/[^+0-9]/g,''); actions.append(call);
  if(item.email) {const email=el('a','Email customer','button secondary'); email.href='mailto:'+item.email; actions.append(email);}
  root.append(details,actions,el('p','Reference: '+item.id,'field-hint')); $('#inquiry-dialog').showModal();
}
$('#close-inquiry').addEventListener('click',()=>$('#inquiry-dialog').close());

async function canLeave() {return !busy && (!(dirty||(!working&&!$('#recovery').hidden)) || await confirmAction('Leave this edit?','You have unsaved changes. Leaving will discard this device’s working copy.','Discard changes',true));}
function releaseEditor() {for(const url of urls) URL.revokeObjectURL(url); urls.clear(); $('#inline-preview').removeAttribute('src');}
async function editProject(project = null, recovery = false) {
  if(!recovery && !await canLeave())return;
  if(!recovery) await clearRecovery();
  releaseEditor();
  working = project ? structuredClone(project) : {id:'',name:'',category:categories[0],location:'',description:'',photos:[],status:'draft',updated_at:0};
  delete working.published;
  for(const photo of working.photos) {if(photo.blob) photo.src=objectURL(photo.blob);}
  selectedPhoto=0;
  dirty=recovery;
  for(const key of ['name','category','location','description']) $('#project-form').elements.namedItem(key).value=working[key]||'';
  $('#project-collection').hidden=true; $('#editor').hidden=false; $('#recovery').hidden=true;
  openTab('projects'); renderPhotos(); updateEditorState();
  if(innerWidth<=760)inlineSize='mobile';
  $$('[data-inline-size]').forEach(button=>{const selected=button.dataset.inlineSize===inlineSize;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));});
  $('#inline-viewport').dataset.loading='true';
  $('#inline-preview').src='/admin/preview?page=projects';
  requestAnimationFrame(sizeInline); window.scrollTo({top:0});
  if(recovery)changed();
}
$$('[data-new-project]').forEach(button=>button.addEventListener('click',()=>editProject()));
$('#back-projects').addEventListener('click',async()=>{if(!await canLeave())return; await clearRecovery(); releaseEditor(); working=null; dirty=false; $('#editor').hidden=true; $('#project-collection').hidden=false;});
$('#restore-edit').addEventListener('click',()=>editProject(restoreRecord,true));
$('#discard-recovery').addEventListener('click',()=>clearRecovery());
$('#project-form').addEventListener('submit',event=>event.preventDefault());
$('#project-form').addEventListener('input',event=>{
  if(!working||!['name','category','location','description'].includes(event.target.name))return;
  working[event.target.name]=event.target.value; changed();
});
let selectedPhoto=0;
function renderPhotos() {
  const list=$('#photo-list'), inspector=$('#selected-photo'); list.replaceChildren(); inspector.replaceChildren();
  selectedPhoto=Math.max(0,Math.min(selectedPhoto,working.photos.length-1));
  $('#album-count').textContent=working.photos.length+' / 20';
  working.photos.forEach((photo,index)=>{
    const card=el('button','', 'photo-card'+(index===selectedPhoto?' selected':''));card.type='button';card.draggable=true;
    card.setAttribute('aria-label','Select photo '+(index+1)+(index===0?' · Cover':''));card.setAttribute('aria-pressed',String(index===selectedPhoto));
    const image=document.createElement('img');image.src=photoURL(photo);image.alt=photo.label;
    card.append(image,el('span',index===0?'1 · Cover':String(index+1),'thumbnail-number'));
    card.addEventListener('click',()=>{selectedPhoto=index;renderPhotos();});
    card.addEventListener('dragstart',event=>{dragIndex=index;event.dataTransfer.setData('text/plain',String(index));});
    card.addEventListener('dragend',()=>{dragIndex=null;});
    card.addEventListener('dragover',event=>{if(dragIndex!==null)event.preventDefault();});
    card.addEventListener('drop',event=>{event.preventDefault();if(dragIndex!==null){movePhoto(dragIndex,index);dragIndex=null;}});
    list.append(card);
  });
  if(!working.photos.length)return;
  const photo=working.photos[selectedPhoto],index=selectedPhoto;
  const heading=el('div','','selected-heading');heading.append(el('strong','Photo '+(index+1)+' of '+working.photos.length),el('span',index===0?'Cover photo':'Album photo','muted'));
  const image=document.createElement('img');image.src=photoURL(photo);image.alt=photo.label;image.className='selected-image';
  const actions=el('div','','photo-actions');actions.append(action('Crop & resize',()=>openCrop(index)));
  if(index)actions.append(action('Make cover',()=>movePhoto(index,0)));
  for(const [label,target] of [['Move earlier',index-1],['Move later',index+1]]){const button=action(label,()=>movePhoto(index,target));button.disabled=target<0||target>=working.photos.length;actions.append(button);}
  actions.append(action('Remove',()=>{if(busy)return;working.photos.splice(index,1);renderPhotos();changed();},'text-button danger-text'));
  const details=el('details','','photo-details'),summary=el('summary','Photo description');
  const label=el('label','Describe this photo for accessibility'),input=document.createElement('input');input.value=photo.label;input.maxLength=150;
  input.addEventListener('input',()=>{photo.label=input.value;image.alt=input.value;changed();});label.append(input);details.append(summary,label);
  inspector.append(heading,image,el('p',photoMetadata(photo),'photo-meta'),actions,details,el('p','Drag thumbnails to reorder. The first photo is your project cover.','field-hint'));
}

function movePhoto(from,to) {if(busy)return;const [photo]=working.photos.splice(from,1);working.photos.splice(to,0,photo);selectedPhoto=to;renderPhotos();changed();}
function canvasBlob(canvas,quality) {return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('This browser could not export the photo.')),'image/webp',quality));}
async function exportPhoto(source,rect,quality=.82) {
  const canvas=document.createElement('canvas');canvas.width=rect.width;canvas.height=rect.height;
  canvas.getContext('2d').drawImage(source,rect.sx,rect.sy,rect.sw,rect.sh,0,0,canvas.width,canvas.height);
  let blob=await canvasBlob(canvas,quality), limit=storageMode==='r2'?8000000:1000000;
  while(blob.size>limit && quality>.45) {quality-=.1;blob=await canvasBlob(canvas,quality);}
  if(blob.size>limit)throw Error('This photo is still too large. Choose a smaller output size.');
  return {blob,width:canvas.width,height:canvas.height,bytes:blob.size};
}
async function addPhotos(files) {
  if(!working||!files.length||busy)return;
  if(working.photos.length+files.length>20){fail('A project can have up to 20 photos.');return;}
  await run(async()=>{
    let added=0;
    try {
      for(const file of files) {
        if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error(file.name+': use JPG, PNG or WebP.');
        if(file.size>8000000)throw Error(file.name+': choose an original under 8 MB.');
        $('#upload-progress').textContent='Preparing photo '+(added+1)+' of '+files.length+'…';
        const bitmap=await createImageBitmap(file);
        try {
          const result=await exportPhoto(bitmap,cropRect(bitmap.width,bitmap.height,bitmap.width/bitmap.height,1,.5,.5,1200));
          working.photos.push({...result,original:file,src:objectURL(result.blob),label:file.name.replace(/\.[^.]+$/,'').replace(/[_-]/g,' ')||'Project photo',filename:file.name});
          added++;renderPhotos();changed();
        }finally{bitmap.close();}
      }
    }finally{$('#upload-progress').textContent=added+' photos prepared. Save draft to upload and keep them.';}
  });
}
$('#photo-upload').addEventListener('change',event=>{const files=[...event.target.files];event.target.value='';void addPhotos(files);});
$('#drop-zone').addEventListener('dragover',event=>{event.preventDefault();$('#drop-zone').classList.add('dragover');});
$('#drop-zone').addEventListener('dragleave',()=>$('#drop-zone').classList.remove('dragover'));
$('#drop-zone').addEventListener('drop',event=>{event.preventDefault();$('#drop-zone').classList.remove('dragover');void addPhotos([...event.dataTransfer.files]);});

async function saveProject(status) {
  if(busy||!working)return;
  if(!$('#project-form').reportValidity())return;
  if(status==='published' && !working.photos.length){fail('Add at least one photo before publishing.');return;}
  if(status==='published' && !await confirmAction('Publish “'+working.name+'”?', working.photos.length+' photos and these project details will become visible on the website.','Publish now'))return;
  await run(async()=>{
    // Keep successfully uploaded keys for retry if a later upload or save fails.
    for(let index=0;index<working.photos.length;index++){
      const photo=working.photos[index];if(!photo.blob||photo.key)continue;
      $('#edit-state').textContent='Uploading photo '+(index+1)+' of '+working.photos.length+'…';
      const form=new FormData();form.set('photo',photo.blob,'project.webp');
      const result=await api('/admin/api/projects/upload',{method:'POST',body:form});photo.key=result.key;
    }
    const project={...working,status,expectedUpdatedAt:working.updated_at||0,photos:working.photos.map(({key,label,width,height,bytes})=>({key,label,width,height,bytes}))};
    const saved=await post('/admin/api/projects',{action:'save',project});
    const savedCopy={...project,id:saved.id,updated_at:saved.updated_at,hasDraft:status==='draft'&&working.status==='published',status:status==='draft'&&working.status==='published'?'published':status};
    working=savedCopy;dirty=false;await clearRecovery();
    for(const url of urls)URL.revokeObjectURL(url);urls.clear();
    renderPhotos();updateEditorState();sendPreviews();
    await load();const fresh=projects.find(p=>p.id===saved.id);if(fresh){working=structuredClone(fresh);delete working.published;updateEditorState();}
    notice(status==='published'?'Project published. Your website is updated.':'Draft saved. Your live website has not changed.');
  });
}
$('#save-draft').addEventListener('click',()=>saveProject('draft'));
$('#publish-project').addEventListener('click',()=>saveProject('published'));
$('#discard-draft').addEventListener('click',async()=>{
  if(!working||busy||!await confirmAction('Discard draft changes?','The current published version will be restored in the editor.','Discard changes',true))return;
  let restored=null;
  await run(async()=>{const id=working.id;await post('/admin/api/projects',{action:'discard',id});await clearRecovery();await load();dirty=false;restored=projects.find(p=>p.id===id);});
  if(restored)await editProject(restored);
});
$('#unpublish-project').addEventListener('click',async()=>{
  if(!working||busy||!await confirmAction('Unpublish this project?','The project will be removed from the public gallery. Its saved content will remain as a private draft. Unsaved edits stay in this editor.','Unpublish',true))return;
  await run(async()=>{await post('/admin/api/projects',{action:'unpublish',id:working.id});await load();const saved=projects.find(p=>p.id===working.id);working.status='draft';working.hasDraft=false;working.updated_at=saved.updated_at;updateEditorState();notice('Project unpublished.');});
});

// A single renderer powers both public and private gallery interactions.
function previewPayload() {
  const draft=working?{...working,name:working.name.trim()||'Untitled project',photos:working.photos.map(photo=>({key:photo.key,label:photo.label||'Project photo',src:photoURL(photo)}))}:null;
  return previewCollection(projects,draft).map(project=>({...project,published:undefined,photos:project.photos.map(photo=>({key:photo.key,label:photo.label,src:photoURL(photo)}))}));
}
function sendPreviews() {
  const payload={type:'buildex-preview',projects:previewPayload()};
  for(const frame of [$('#inline-preview'),$('#website-preview')])if(frame.getAttribute('src'))frame.contentWindow?.postMessage(payload,location.origin);
}
function sizeInline() {
  const viewport=$('#inline-viewport'),frame=$('#inline-preview');if(!working||viewport.clientWidth===0)return;
  const width=inlineSize==='mobile'?390:1280,available=viewport.clientWidth-24,scale=Math.min(1,available/width);
  frame.style.width=width+'px';frame.style.height=((viewport.clientHeight-24)/scale)+'px';
  frame.style.transform='translateX(-50%) scale('+scale+')';
}
new ResizeObserver(()=>requestAnimationFrame(sizeInline)).observe($('#inline-viewport'));
$$('[data-inline-size]').forEach(button=>button.addEventListener('click',()=>{inlineSize=button.dataset.inlineSize;$$('[data-inline-size]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});sizeInline();}));
function openPreview(page=currentPage) {
  if(!pages.includes(page))return;
  currentPage=page;$('#preview-page').value=page;$('#preview-error').hidden=true;
  $('#preview-viewport').dataset.loading='true';
  $('#website-preview').src='/admin/preview?page='+page;
  if(!$('#preview-dialog').open)$('#preview-dialog').showModal();
}
$('#global-preview').addEventListener('click',()=>openPreview(location.hash==='#projects'?'projects':'home'));
$('#preview-page').addEventListener('change',event=>openPreview(event.target.value));
$('#close-preview').addEventListener('click',()=>$('#preview-dialog').close());
$('#preview-dialog').addEventListener('close',()=>$('#website-preview').removeAttribute('src'));
$$('[data-preview-size]').forEach(button=>button.addEventListener('click',()=>{$('#preview-viewport').dataset.size=button.dataset.previewSize;$$('[data-preview-size]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});}));
addEventListener('message',event=>{
  if(event.origin!==location.origin)return;
  const frame=[$('#inline-preview'),$('#website-preview')].find(frame=>event.source===frame.contentWindow);if(!frame)return;
  if(event.data?.type==='buildex-preview-ready'){frame.parentElement.dataset.loading='false';sendPreviews();}
  if(event.data?.type==='buildex-preview-error'){fail('Preview is unavailable. '+event.data.message);return;}
  if(event.data?.type==='buildex-preview-navigate'&&pages.includes(event.data.page)){
    frame.parentElement.dataset.loading='true';
    frame.src='/admin/preview?page='+event.data.page;
    if(frame.id==='website-preview'){currentPage=event.data.page;$('#preview-page').value=currentPage;}
  }
});
for(const frame of [$('#inline-preview'),$('#website-preview')])frame.addEventListener('load',()=>{
  frame.parentElement.dataset.loading='false';
  try {if(frame.contentDocument?.querySelector('[data-admin-preview]'))sendPreviews();else if(frame.getAttribute('src')){notice('Preview could not load. Refresh the workspace or sign in again.',true);}}
  catch{notice('Preview could not load. Refresh the workspace and try again.',true);}
});

// Cropping is local, and saved photos are fetched only when opening their photo editor.
async function openCrop(index) {
  if(busy)return;
  const photo=working.photos[index];let source=photo.original||photo.blob;
  await run(async()=>{
    if(!source){const response=await fetch(photoURL(photo));if(!response.ok)throw Error('Could not load this photo. Sign in again and retry.');source=await response.blob();}
    const bitmap=await createImageBitmap(source);
    crop={photo,index,bitmap,original:source,rotation:0,rotated:null,result:null};
    resetCrop();$('#crop-dialog').showModal();await drawCrop();
  });
}
function resetCrop() {
  if(!crop)return;
  crop.rotation=0;$('#crop-ratio').value='original';$('#crop-zoom').value='1';$('#crop-x').value=$('#crop-y').value='0.5';$('#crop-size').value='1200';$('#crop-quality').value='0.82';
}
function cropSource() {
  const {bitmap,rotation}=crop,canvas=document.createElement('canvas'),swap=rotation%180!==0;
  canvas.width=swap?bitmap.height:bitmap.width;canvas.height=swap?bitmap.width:bitmap.height;
  const ctx=canvas.getContext('2d');ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(rotation*Math.PI/180);ctx.drawImage(bitmap,-bitmap.width/2,-bitmap.height/2);
  return canvas;
}
async function drawCrop() {
  if(!crop)return;const current=crop,generation=++cropGeneration;
  $('#apply-crop').disabled=true;$('#crop-output').textContent='Preparing preview…';
  try{
    const source=cropSource(),rect=cropRect(source.width,source.height,$('#crop-ratio').value==='original'?source.width/source.height:Number($('#crop-ratio').value),Number($('#crop-zoom').value),Number($('#crop-x').value),Number($('#crop-y').value),Number($('#crop-size').value));
    const canvas=$('#crop-canvas'),factor=Math.min(1,560/Math.max(rect.width,rect.height));
    canvas.width=Math.round(rect.width*factor);canvas.height=Math.round(rect.height*factor);const ctx=canvas.getContext('2d');ctx.drawImage(source,rect.sx,rect.sy,rect.sw,rect.sh,0,0,canvas.width,canvas.height);
    ctx.strokeStyle='#ffffff40';ctx.lineWidth=1;for(const t of [1/3,2/3]){ctx.beginPath();ctx.moveTo(canvas.width*t,0);ctx.lineTo(canvas.width*t,canvas.height);ctx.moveTo(0,canvas.height*t);ctx.lineTo(canvas.width,canvas.height*t);ctx.stroke();}
    $('#crop-meta').textContent='Source: '+current.bitmap.width+' × '+current.bitmap.height+' px · '+formatBytes(current.original.size);
    const result=await exportPhoto(source,rect,Number($('#crop-quality').value));
    if(crop!==current||generation!==cropGeneration)return;
    crop.result=result;$('#crop-output').textContent=result.width+' × '+result.height+' px · '+formatBytes(result.bytes)+' · WebP';$('#apply-crop').disabled=false;
  }catch(error){if(crop===current)$('#crop-output').textContent=error.message;}
}
function scheduleCrop(){cropGeneration++;$('#apply-crop').disabled=true;clearTimeout(cropTimer);cropTimer=setTimeout(drawCrop,100);}
for(const id of ['crop-ratio','crop-zoom','crop-x','crop-y','crop-size','crop-quality'])$('#'+id).addEventListener('input',scheduleCrop);
$('#crop-rotate').addEventListener('click',()=>{crop.rotation=(crop.rotation+90)%360;scheduleCrop();});
$('#crop-reset').addEventListener('click',()=>{resetCrop();scheduleCrop();});
let pointer=null;
$('#crop-canvas').addEventListener('pointerdown',event=>{pointer={x:event.clientX,y:event.clientY,startX:Number($('#crop-x').value),startY:Number($('#crop-y').value)};event.target.setPointerCapture(event.pointerId);});
$('#crop-canvas').addEventListener('pointermove',event=>{if(!pointer)return;const box=event.target.getBoundingClientRect();$('#crop-x').value=Math.max(0,Math.min(1,pointer.startX-(event.clientX-pointer.x)/box.width));$('#crop-y').value=Math.max(0,Math.min(1,pointer.startY-(event.clientY-pointer.y)/box.height));scheduleCrop();});
$('#crop-canvas').addEventListener('pointerup',()=>pointer=null);
$('#crop-canvas').addEventListener('pointercancel',()=>pointer=null);
$('#apply-crop').addEventListener('click',()=>{
  if(!crop?.result)return;
  const photo=crop.photo,result=crop.result;delete photo.key;
  Object.assign(photo,result,{original:crop.original,src:objectURL(result.blob)});
  renderPhotos();changed();$('#crop-dialog').close();
});
$('#close-crop').addEventListener('click',()=>$('#crop-dialog').close());
$('#crop-dialog').addEventListener('close',()=>{clearTimeout(cropTimer);cropGeneration++;crop?.bitmap.close();crop=null;pointer=null;});

for(const category of categories){for(const select of [$('#category-filter'),$('#project-form').elements.category]){const option=el('option',category);option.value=category;select.append(option);}}
for(const [id,handler] of [['project-search',renderProjects],['project-filter',renderProjects],['category-filter',renderProjects],['media-search',renderMedia],['search',renderInquiries],['status-filter',renderInquiries]])$('#'+id).addEventListener(id.includes('search')?'input':'change',handler);
addEventListener('beforeunload',event=>{if(dirty||busy){event.preventDefault();event.returnValue='';}});
openTab(location.hash.slice(1)||'overview');
showLogin('Checking your session…');
load(true).catch(error=>showLogin(error.status===401?'Sign in using a code sent to your administrator email.':error.message));
