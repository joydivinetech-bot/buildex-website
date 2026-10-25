// Pointer sorting shared by the two Studio collections. The real card is the
// placeholder; a non-interactive copy follows the pointer above the interface.
export function collectionSort(list,{idAttribute,locked,onDrop}){
 let drag=null,frame=0;
 const cards=()=>[...list.querySelectorAll(':scope > .project-card')];
 const id=card=>card.getAttribute(idAttribute);
 function place(){
  if(!drag?.moving)return;
  const d=drag,edge=80,scroll=d.y<edge?-12:d.y>innerHeight-edge?12:0;
  if(scroll)window.scrollBy(0,scroll);
  d.ghost.style.transform=`translate3d(${d.x-d.startX}px,${d.y-d.startY}px,0) rotate(1deg)`;
  const target=document.elementFromPoint(d.x,d.y)?.closest('.project-card');
  if(target&&target.parentElement===list&&target!==d.card){
   const box=target.getBoundingClientRect(),columns=getComputedStyle(list).gridTemplateColumns.split(' ').length;
   const before=columns>1?d.x<box.x+box.width/2:d.y<box.y+box.height/2;
   const marker=before?target:target.nextSibling;
   if(marker!==d.card&&d.card.nextSibling!==marker){
    const previous=new Map(cards().map(card=>[card,card.getBoundingClientRect()]));
    list.insertBefore(d.card,marker);d.target={id:id(target),before};
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches)for(const card of cards()){
     if(card===d.card)continue;const old=previous.get(card),now=card.getBoundingClientRect();
     if(old&&(old.x!==now.x||old.y!==now.y))card.animate([{transform:`translate(${old.x-now.x}px,${old.y-now.y}px)`},{transform:'translate(0,0)'}],{duration:180,easing:'ease-out'});
    }
   }
  }
  frame=requestAnimationFrame(place);
 }
 list.addEventListener('pointerdown',event=>{
  const handle=event.target.closest('.project-drag-handle'),card=handle?.closest('.project-card');
  if(!card||card.parentElement!==list||locked()||event.button!==0||drag)return;
  drag={card,handle,pointer:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,order:cards(),target:null,moving:false};
  list.setPointerCapture(event.pointerId);
 });
 addEventListener('pointermove',event=>{
  if(!drag||event.pointerId!==drag.pointer)return;const d=drag;d.x=event.clientX;d.y=event.clientY;
  if(!d.moving&&Math.hypot(d.x-d.startX,d.y-d.startY)<6)return;
  event.preventDefault();
  if(!d.moving){
   d.moving=true;const box=d.card.getBoundingClientRect(),ghost=d.card.cloneNode(true);
   ghost.removeAttribute('id');ghost.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));ghost.inert=true;ghost.setAttribute('aria-hidden','true');ghost.classList.add('collection-drag-ghost');
   Object.assign(ghost.style,{left:box.x+'px',top:box.y+'px',width:box.width+'px',height:box.height+'px'});
   // Preserve list styling outside the collection without inheriting its layout.
   const wrapper=document.createElement('div');wrapper.className='collection-drag-layer project-grid';wrapper.dataset.view=list.dataset.view;wrapper.append(ghost);document.body.append(wrapper);
   d.ghost=ghost;d.layer=wrapper;d.card.classList.add('collection-sort-placeholder');document.body.classList.add('collection-sorting');
  }
  cancelAnimationFrame(frame);place();
 },{passive:false});
 function finish(event,cancelled=false){
  if(!drag||event.pointerId!==drag.pointer)return;const d=drag;drag=null;cancelAnimationFrame(frame);
  const box=list.getBoundingClientRect(),inside=d.x>=box.left&&d.x<=box.right&&d.y>=box.top&&d.y<=box.bottom;
  const changed=cards().some((card,i)=>card!==d.order[i]);
  d.card.classList.remove('collection-sort-placeholder');d.layer?.remove();document.body.classList.remove('collection-sorting');
  if(list.hasPointerCapture(d.pointer))list.releasePointerCapture(d.pointer);
  // Restore DOM before the controller renders its staged data (or cancels).
  for(const card of d.order)list.append(card);
  if(!cancelled&&inside&&changed&&d.target)onDrop(id(d.card),d.target.id,d.target.before);
 }
 addEventListener('pointerup',event=>finish(event));addEventListener('pointercancel',event=>finish(event,true));
 addEventListener('keydown',event=>{if(event.key==='Escape'&&drag){event.preventDefault();finish({pointerId:drag.pointer},true);}});
}
