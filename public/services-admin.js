import {collectionSort} from './collection-sort.js';
export function initServices({api,post,run,confirmAction,notice,preview,openPhoto}){
 const $=selector=>document.querySelector(selector),el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
 const button=(text,click,cls='text-button')=>{const b=el('button',text,cls);b.type='button';b.addEventListener('click',click);return b;};
 let state=null,items=[],selected=null,changed=false,view='grid',locked=false;
 try{view=localStorage.getItem('buildex-service-view')==='list'?'list':'grid';}catch{}
 const imageURL=image=>image?.src||(image?.key?'/admin/api/media?key='+encodeURIComponent(image.key):'');
 function update(){notice('');changed=true;$('#services-state').textContent='Unpublished changes · Save draft or publish when ready';render();preview();}
 function render(){
  document.querySelectorAll('[data-save-services=publish]').forEach(b=>b.hidden=!(changed||state?.draft)||(!b.closest('.filterbar')&&!selected));
  const list=$('#services-list');list.dataset.view=view;list.replaceChildren();
  document.querySelectorAll('[data-service-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.serviceView===view)));
  const query=$('#service-search').value.toLowerCase();
  items.forEach((item,index)=>{
   if(query&&!item.name.toLowerCase().includes(query))return;
   const card=el('article','','project-card');card.dataset.serviceId=item.id;card.classList.toggle('is-hidden',!!item.hidden);
   const image=el('div','','project-image');if(item.image){const img=el('img');img.src=imageURL(item.image);img.alt=item.name;image.append(img);}else image.append(el('span','▧'));
   if(item.hidden)image.append(el('span','Hidden','badge hidden-project'));
   const copy=el('div','','project-content');copy.append(button(item.name||'Untitled service',()=>edit(item.id),'project-name'),el('p',item.description));
   const actions=el('div','','card-actions'),move=el('div','','move');actions.append(button('Edit service →',()=>edit(item.id)),button('Remove',async()=>{
    if(locked||!await confirmAction('Remove this service?','The removal stays private until you publish services.','Remove service',true))return;
    if(item.image?.blob)URL.revokeObjectURL(item.image.src);items=items.filter(s=>s.id!==item.id);if(selected===item.id)close();update();
   },'text-button danger-text'));
   for(const [label,to] of [['↑',index-1],['↓',index+1]]){const b=button(label,()=>reorder(index,to));b.disabled=to<0||to>=items.length;b.setAttribute('aria-label',(label==='↑'?'Move earlier: ':'Move later: ')+item.name);move.append(b);}
   actions.append(button(item.hidden?'Unhide':'Hide',()=>{if(locked)return;item.hidden=!item.hidden;update();}));
   actions.append(move);copy.append(actions);
   const handle=button('⠿',()=>{},'project-drag-handle');handle.setAttribute('aria-label','Drag to reorder service: '+item.name);handle.title='Drag to reorder · Arrow keys move earlier or later';
   handle.addEventListener('keydown',e=>{const delta=['ArrowUp','ArrowLeft'].includes(e.key)?-1:['ArrowDown','ArrowRight'].includes(e.key)?1:0;if(delta){e.preventDefault();reorder(index,index+delta);}});
   card.append(image,copy,handle);list.append(card);
  });
  if(!list.children.length)list.append(el('p',items.length?'No matching services.':'Add a service to get started.','empty-state'));
 }
 function reorder(from,to){if(locked||from===to||to<0||to>=items.length)return;const [item]=items.splice(from,1);items.splice(to,0,item);update();}
 collectionSort($('#services-list'),{idAttribute:'data-service-id',locked:()=>locked,onDrop:(id,target,before)=>{
 const from=items.findIndex(s=>s.id===id),remaining=items.filter(s=>s.id!==id),to=remaining.findIndex(s=>s.id===target)+(before?0:1);reorder(from,to);
 }});
 function edit(id){selected=id;render();const item=items.find(s=>s.id===id),form=$('#service-form');form.elements.name.value=item.name;form.elements.description.value=item.description;form.elements.link.value=item.link;$('#service-editor-title').textContent=item.name||'New service';$('#service-editor').hidden=false;$('#services-collection').hidden=true;showImage(item);$('#services-preview').src='/admin/preview?page=services';form.elements.name.focus();preview();}
 function showImage(item){$('#service-recrop').hidden=!(item.image?.key||item.image?.blob);const image=$('#service-cover');image.hidden=!item.image;if(item.image)image.src=imageURL(item.image);else image.removeAttribute('src');}
 function close(){selected=null;$('#service-editor').hidden=true;$('#services-collection').hidden=false;$('#services-preview').removeAttribute('src');render();}
 let previewSize='desktop';
 function sizePreview(){const viewport=$('#services-viewport'),frame=$('#services-preview');if(!viewport.clientWidth)return;const width=previewSize==='mobile'?390:1280,scale=Math.min(1,(viewport.clientWidth-24)/width);frame.style.width=width+'px';frame.style.height=(viewport.clientHeight-24)/scale+'px';frame.style.transform='translateX(-50%) scale('+scale+')';}
 new ResizeObserver(sizePreview).observe($('#services-viewport'));
 document.querySelectorAll('[data-service-size]').forEach(b=>b.addEventListener('click',()=>{previewSize=b.dataset.serviceSize;document.querySelectorAll('[data-service-size]').forEach(other=>{other.classList.toggle('active',other===b);other.setAttribute('aria-pressed',String(other===b));});sizePreview();}));
 $('#service-back').addEventListener('click',close);
 $('#service-add').addEventListener('click',()=>{if(locked)return;const item={id:crypto.randomUUID(),name:'',description:'',image:null,link:'estimate'};items.push(item);update();edit(item.id);});
 $('#service-reload').addEventListener('click',async()=>{if(locked||changed&&!await confirmAction('Reload saved services?','Your unsaved service edits will be replaced by the latest saved collection.','Reload services'))return;locked=true;await run(async()=>{try{const fresh=await api('/admin/api/services');for(const item of items)if(item.image?.blob)URL.revokeObjectURL(item.image.src);state=fresh;items=structuredClone(state.draft??state.published);changed=false;close();$('#services-state').textContent=status();preview();notice('Saved services reloaded.');}finally{locked=false;}});});
 $('#service-search').addEventListener('input',render);
 document.querySelectorAll('[data-service-view]').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.serviceView;try{localStorage.setItem('buildex-service-view',view);}catch{}render();}));
 $('#service-form').addEventListener('submit',e=>e.preventDefault());
 $('#service-form').addEventListener('input',()=>{const item=items.find(s=>s.id===selected);if(!item||locked)return;const form=$('#service-form');Object.assign(item,{name:form.elements.name.value,description:form.elements.description.value,link:form.elements.link.value});$('#service-editor-title').textContent=item.name||'New service';update();});
 $('#service-photo').addEventListener('change',async e=>{
  const file=e.target.files[0];e.target.value='';if(!file||locked)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8000000){notice('Choose a JPG, PNG or WebP photo under 8 MB.',true);return;}
  const item=items.find(s=>s.id===selected);await editPhoto(item,file);
 });
 async function editPhoto(item,file){await openPhoto(file,result=>{if(!items.includes(item))return;if(item.image?.blob)URL.revokeObjectURL(item.image.src);item.image={src:URL.createObjectURL(result.blob),blob:result.blob,original:file,alt:item.name};showImage(item);update();});}
 $('#service-recrop').addEventListener('click',async()=>{const item=items.find(s=>s.id===selected);if(!item?.image||locked)return;try{let source=item.image.original||item.image.blob;if(!source){const response=await fetch(imageURL(item.image));if(!response.ok)throw Error('Could not load the service photo.');source=await response.blob();}await editPhoto(item,source);}catch(error){notice(error.message,true);}});
 function status(){return changed?'Unsaved changes':state?.draft?'Saved draft · Your public services have not changed':'Published services · Ready to edit';}
 async function save(action){
  if(locked||!state)return;
  if(action!=='discard'&&items.some(s=>!s.name.trim()||!s.image)){notice('Every service needs a name and photo. Complete it or remove it before saving.',true);return;}
  if(action==='discard'&&!await confirmAction('Discard service changes?','Restore the published collection, including its original order.','Discard changes',true))return;
  notice('Saving services…');locked=true;$('#service-form fieldset').disabled=true;document.querySelectorAll('[data-save-services]').forEach(b=>b.disabled=true);
  await run(async()=>{
   try{
    if(action!=='discard')for(const item of items)if(item.image?.blob){const form=new FormData();form.set('photo',item.image.blob,'service.webp');const uploaded=await api('/admin/api/projects/upload',{method:'POST',body:form});URL.revokeObjectURL(item.image.src);item.image={key:uploaded.key,alt:item.name};}
    state=await post('/admin/api/services',{action,version:state.version,services:items.map(({image,...item})=>({...item,image:image?.key?{key:image.key}:image?{src:image.src,alt:image.alt}:null}))});
    for(const item of items)if(item.image?.blob)URL.revokeObjectURL(item.image.src);items=structuredClone(state.draft??state.published);changed=false;$('#services-state').textContent=status();close();preview();notice(action==='publish'?'Services published. Website order updated.':action==='draft'?'Services draft saved. Your public website has not changed.':'Published services restored.');
   }finally{locked=false;$('#service-form fieldset').disabled=false;document.querySelectorAll('[data-save-services]').forEach(b=>b.disabled=false);}
  });
 }
 document.querySelectorAll('[data-save-services]').forEach(b=>b.addEventListener('click',()=>save(b.dataset.saveServices)));
 return {get dirty(){return changed;},reset(){for(const item of items)if(item.image?.blob)URL.revokeObjectURL(item.image.src);items=[];state=null;changed=false;close();},preview(){return state?items.map(({image,...item})=>({...item,name:item.name||'Untitled service',image:image?{src:imageURL(image),alt:image.alt||item.name}:null})):null;},async load(){if(changed)return;state=await api('/admin/api/services');items=structuredClone(state.draft??state.published);$('#services-state').textContent=status();render();}};
}
