'use strict';
(() => {
 const photo=(id)=>`https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&w=1400&q=80`;
 let items=[
 {title:'Room for the outdoors',category:'Patios & outdoor living',type:'photo',src:photo('13600836')},
 {title:'A beautiful foundation',category:'Flooring & finishes',type:'photo',src:photo('8288962')},
 {title:'Details that make a space',category:'Construction & remodeling',type:'photo',src:photo('38071645')},
 {title:'Living beyond the walls',category:'Patio inspiration',type:'photo',src:photo('13600836')},
 {title:'Texture. Tone. Character.',category:'Flooring inspiration',type:'photo',src:photo('8288962')}
 ];
 const grid=document.querySelector('#portfolio-grid'),dialog=document.querySelector('#media-viewer'),stage=document.querySelector('#media-stage');let filtered=items,current=0,photoIndex=0,opener;
 const el=(tag,cls,content)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(content)n.textContent=content;return n};
 function display(){const project=filtered[current], photos=project.photos||[project];photoIndex=Math.min(photoIndex,photos.length-1);const item={...project,...photos[photoIndex]};stage.querySelector('video')?.pause();stage.replaceChildren();const media=el(item.type==='video'?'video':'img');if(item.type==='video'){media.controls=true;media.playsInline=true;media.preload='metadata';}else media.alt=item.label||item.title+' — stock inspiration photo';media.src=item.src;media.addEventListener('error',()=>{stage.replaceChildren(el('p','','This sample media could not load. Please try another item.'));});stage.append(media);document.querySelector('#media-title').textContent=item.title;document.querySelector('#media-category').textContent=item.category.toUpperCase();document.querySelector('#media-description').textContent=item.type==='video'?'Demo playback clip (flowers), used only to demonstrate video controls. Replace with your project footage.':(item.real?item.description:'Stock inspiration image — not a completed Buildex project.');document.querySelector('#media-position').textContent=`${photoIndex+1} / ${photos.length} · ${project.real?'PROJECT PHOTOS':'INSPIRATION'}`;renderThumbnails();}
 const thumbnails=el('div','album-thumbnails');thumbnails.setAttribute('aria-label','Project photos');stage.after(thumbnails);
 function renderThumbnails(){thumbnails.replaceChildren();const item=filtered[current],photos=item.photos||[item];photos.forEach((photo,index)=>{const button=el('button');button.type='button';button.setAttribute('aria-label','View photo '+(index+1));button.setAttribute('aria-pressed',String(index===photoIndex));const image=el('img');image.src=photo.src;image.alt=photo.label||'Project photo '+(index+1);button.append(image);button.addEventListener('click',()=>{photoIndex=index;display();});thumbnails.append(button);});document.querySelector('#media-prev').disabled=photos.length<2;document.querySelector('#media-next').disabled=photos.length<2;}
 function render(){grid.replaceChildren();filtered.forEach((item,index)=>{const button=el('button','media-card');button.type='button';button.setAttribute('aria-label','View '+item.title);const cover=el('span','media-cover'),img=el('img');img.src=item.poster||item.src;img.alt=item.label||item.title+' — sample';img.loading=index?'lazy':'eager';img.decoding='async';cover.append(img,el('span','media-tag',item.real?(item.photos.length+' PHOTO'+(item.photos.length===1?'':'S')+' · VIEW PROJECT'):'PHOTO / INSPIRATION'));if(item.type==='video')cover.append(el('span','media-play','▶'));const meta=el('span','media-meta'),copy=el('span');copy.append(el('span','media-title',item.title),el('span','media-subtitle',item.category));meta.append(copy,el('span','media-arrow','↗'));button.append(cover,meta);button.addEventListener('click',()=>{opener=button;current=index;photoIndex=0;display();dialog.showModal();});grid.append(button);});document.querySelector('#media-count').textContent=filtered.length+(filtered.length===1?' project':' projects');}
 document.querySelectorAll('[data-media-filter]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-media-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));filtered=items.filter(i=>button.dataset.mediaFilter==='all'||i.type===button.dataset.mediaFilter);render();}));
 document.querySelector('#media-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{stage.querySelector('video')?.pause();stage.replaceChildren();opener?.focus();});
 function move(delta){if(!filtered.length)return;const count=(filtered[current].photos||[filtered[current]]).length;photoIndex=(photoIndex+delta+count)%count;display();}
 document.querySelector('#media-prev').addEventListener('click',()=>move(-1));document.querySelector('#media-next').addEventListener('click',()=>move(1));dialog.addEventListener('keydown',event=>{if(event.target.tagName==='VIDEO')return;if(event.key==='ArrowRight'){event.preventDefault();move(1);}if(event.key==='ArrowLeft'){event.preventDefault();move(-1);}});dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();});
 function album(project,photos){return {title:project.name,category:project.category,type:'photo',src:photos[0]?.src,label:photos[0]?.label,description:project.description,real:true,photos};}
 async function loadPhotos(){
  if(document.body.dataset.adminPreview){items=[];filtered=items;render();return;}
  if(document.body.dataset.preview||location.protocol==='file:'){render();return;}
  grid.textContent='Loading project photos…';
  try{const response=await fetch('/api/projects',{signal:AbortSignal.timeout(8000)});if(!response.ok)throw new Error();const projects=await response.json();
   const published=projects.map(project=>album(project,(project.photos||[]).filter(f=>/^projects\/[a-z0-9-]+\.(jpg|png|webp)$/.test(f.key)).map(f=>({...f,src:'/api/media?key='+encodeURIComponent(f.key)})))).filter(project=>project.photos.length);
   if(published.length){items=published;filtered=items;document.querySelector('.portfolio-note').textContent='Completed Buildex projects — explore the photos and details.';}
  }catch{document.querySelector('.portfolio-note').textContent='The project gallery is temporarily unavailable. Showing clearly labeled inspiration photos.';}
  render();
 }
 document.addEventListener('buildex-projects-preview',event=>{
  if(!document.body.dataset.adminPreview)return;
  const viewing=dialog.open;
  items=event.detail.map(project=>album(project,project.photos||[])).filter(project=>project.photos.length);
  filtered=items;
  document.querySelectorAll('[data-media-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mediaFilter==='all')));
  document.querySelector('.portfolio-note').textContent='Private preview — includes your drafts and unpublished changes.';
  render();
  if(viewing){if(filtered.length){current=Math.min(current,filtered.length-1);display();}else dialog.close();}
  if(!items.length)grid.append(el('p','gallery-empty','Your project photos will appear here as you add them.'));
 });
 void loadPhotos();
})();
