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
 const grid=document.querySelector('#portfolio-grid'),dialog=document.querySelector('#media-viewer'),stage=document.querySelector('#media-stage');let filtered=items,current=0,opener;
 const el=(tag,cls,content)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(content)n.textContent=content;return n};
 function display(){const item=filtered[current];stage.querySelector('video')?.pause();stage.replaceChildren();const media=el(item.type==='video'?'video':'img');if(item.type==='video'){media.controls=true;media.playsInline=true;media.preload='metadata';}else media.alt=item.label||item.title+' — stock inspiration photo';media.src=item.src;media.addEventListener('error',()=>{stage.replaceChildren(el('p','','This sample media could not load. Please try another item.'));});stage.append(media);document.querySelector('#media-title').textContent=item.title;document.querySelector('#media-category').textContent=item.category.toUpperCase();document.querySelector('#media-description').textContent=item.type==='video'?'Demo playback clip (flowers), used only to demonstrate video controls. Replace with your project footage.':(item.real?item.description:'Stock inspiration image — not a completed Buildex project.');document.querySelector('#media-position').textContent=`${current+1} / ${filtered.length} · PHOTO COLLECTION`;}
 function render(){grid.replaceChildren();filtered.forEach((item,index)=>{const button=el('button','media-card');button.type='button';button.setAttribute('aria-label','View '+item.title);const cover=el('span','media-cover'),img=el('img');img.src=item.poster||item.src;img.alt=item.label||item.title+' — sample';img.loading=index?'lazy':'eager';img.decoding='async';cover.append(img,el('span','media-tag',item.real?'PROJECT PHOTO':'PHOTO / INSPIRATION'));if(item.type==='video')cover.append(el('span','media-play','▶'));const meta=el('span','media-meta'),copy=el('span');copy.append(el('span','media-title',item.title),el('span','media-subtitle',item.category));meta.append(copy,el('span','media-arrow','↗'));button.append(cover,meta);button.addEventListener('click',()=>{opener=button;current=index;display();dialog.showModal();});grid.append(button);});document.querySelector('#media-count').textContent=filtered.length+(filtered.length===1?' item':' items');}
 document.querySelectorAll('[data-media-filter]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-media-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));filtered=items.filter(i=>button.dataset.mediaFilter==='all'||i.type===button.dataset.mediaFilter);render();}));
 document.querySelector('#media-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{stage.querySelector('video')?.pause();stage.replaceChildren();opener?.focus();});
 function move(delta){current=(current+delta+filtered.length)%filtered.length;display();}
 document.querySelector('#media-prev').addEventListener('click',()=>move(-1));document.querySelector('#media-next').addEventListener('click',()=>move(1));dialog.addEventListener('keydown',event=>{if(event.target.tagName==='VIDEO')return;if(event.key==='ArrowRight'){event.preventDefault();move(1);}if(event.key==='ArrowLeft'){event.preventDefault();move(-1);}});dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();});
 async function loadPhotos(){
  if(document.body.dataset.adminPreview){items=[];filtered=items;render();return;}
  if(document.body.dataset.preview||location.protocol==='file:'){render();return;}
  grid.textContent='Loading project photos…';
  try{const response=await fetch('/api/projects',{signal:AbortSignal.timeout(8000)});if(!response.ok)throw new Error();const projects=await response.json();
   const published=projects.flatMap(project=>(project.photos||[]).filter(f=>/^projects\/[a-z0-9-]+\.(jpg|png|webp)$/.test(f.key)).map(f=>({title:project.name,category:project.category,type:'photo',src:'/api/media?key='+encodeURIComponent(f.key),label:f.label,description:project.description,real:true})));
   if(published.length){items=published;filtered=items;document.querySelector('.portfolio-note').textContent='Completed Buildex projects — explore the photos and details.';}
  }catch{document.querySelector('.portfolio-note').textContent='The project gallery is temporarily unavailable. Showing clearly labeled inspiration photos.';}
  render();
 }
 void loadPhotos();
})();
