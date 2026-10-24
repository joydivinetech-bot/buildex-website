// Shared album interactions for the public gallery, private preview and Studio.
const node = (tag, className = '', text = '') => {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
};
const control = (text, label, handler, className) => {
  const button = node('button', className, text);
  button.type = 'button'; button.setAttribute('aria-label', label);
  button.addEventListener('click', handler);
  return button;
};
function swipe(element, move) {
  let start,suppressUntil=0;
  element.addEventListener('click',event=>{
    if(performance.now()<suppressUntil&&event.target.closest('.album-open')){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  element.addEventListener('pointerdown', event => {
    if (event.target.closest('button') && !event.target.closest('.album-open')) return;
    start = {x:event.clientX, y:event.clientY};
  });
  element.addEventListener('pointerup', event => {
    if (!start) return;
    const dx=event.clientX-start.x, dy=event.clientY-start.y;
    start=null;
    if (Math.abs(dx)>45 && Math.abs(dx)>Math.abs(dy)*1.4) {
      // Suppress the click generated after a swipe over the photo.
      suppressUntil=performance.now()+500;
      move(dx<0?1:-1);
    }
  });
  element.addEventListener('pointercancel', ()=>start=null);
}

export function albumCard(album, onOpen) {
  const photos=album.photos||[], root=node('div','album-carousel');
  let index=0;
  const image=node('img'); image.loading='lazy'; image.decoding='async'; image.draggable=false;
  const open=control('', 'Open '+album.title, ()=>onOpen(index,open), 'album-open');
  open.append(image); root.append(open);
  const count=node('span','album-count'), dots=node('div','album-dots');
  function show() {
    image.src=photos[index].src;
    image.alt=album.title+' — photo '+(index+1);
    root.dataset.photoIndex=String(index);
    count.textContent=(index+1)+' / '+photos.length;
    [...dots.children].forEach((dot,i)=>{dot.setAttribute('aria-pressed',String(i===index));});
  }
  function move(delta) {index=(index+delta+photos.length)%photos.length;show();}
  if (photos.length>1) {
    root.append(control('‹','Previous photo in '+album.title,()=>move(-1),'album-arrow album-prev'),control('›','Next photo in '+album.title,()=>move(1),'album-arrow album-next'),count);
    photos.forEach((_,i)=>dots.append(control('', 'Show photo '+(i+1)+' in '+album.title, ()=>{index=i;show();},'album-dot')));
    root.append(dots); swipe(root,move);
  }
  image.addEventListener('error',()=>image.alt='Photo unavailable — '+album.title);
  if(photos.length)show();
  return root;
}

export function albumViewer(dialog, {prefix='media', edit}={}) {
  dialog.classList.add('album-lightbox');
  dialog.setAttribute('aria-labelledby',prefix+'-title');
  const header=node('header','album-viewer-header'), position=node('span','album-position');position.id=prefix+'-position';position.setAttribute('aria-live','polite');
  const close=control('×','Close project viewer',()=>dialog.close(),'album-close');close.id=prefix+'-close';header.append(position,close);
  const stage=node('div','album-stage');stage.id=prefix+'-stage';
  const image=node('img');image.draggable=false;
  const previous=control('‹','Previous photo',()=>move(-1),'album-arrow album-prev'),next=control('›','Next photo',()=>move(1),'album-arrow album-next');
  previous.id=prefix+'-prev';next.id=prefix+'-next';stage.append(image,previous,next);
  const thumbnails=node('div','album-thumbnails');thumbnails.setAttribute('aria-label','Project photos');
  const caption=node('footer','album-caption'),copy=node('div'), category=node('p','album-category'), title=node('h2'), description=node('p','album-description');
  category.id=prefix+'-category';title.id=prefix+'-title';description.id=prefix+'-description';copy.append(category,title,description);caption.append(copy);
  let album=null,index=0,opener=null;
  if(edit)caption.append(control('Edit project','Edit this project',()=>{const project=album;dialog.close();edit(project);},'button'));
  dialog.replaceChildren(header,stage,thumbnails,caption);
  function display() {
    const photo=album.photos[index];
    image.src=photo.src;image.alt=album.title+' — photo '+(index+1);
    position.textContent=(index+1)+' / '+album.photos.length+' · '+(album.inspiration?'INSPIRATION':'PROJECT PHOTOS');
    title.textContent=album.title;category.textContent=album.category||'';description.textContent=album.description||'';
    description.hidden=!album.description;
    previous.hidden=next.hidden=album.photos.length<2;
    [...thumbnails.children].forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
  }
  function move(delta) {if(!album?.photos.length)return;index=(index+delta+album.photos.length)%album.photos.length;display();}
  function update(value) {
    album=value;index=Math.max(0,Math.min(index,album.photos.length-1));
    thumbnails.replaceChildren();
    album.photos.forEach((photo,i)=>{
      const button=control('','View photo '+(i+1),()=>{index=i;display();},'album-thumb');
      const thumb=node('img');thumb.src=photo.src;thumb.alt='';thumb.loading='lazy';button.append(thumb);thumbnails.append(button);
    });
    thumbnails.hidden=album.photos.length<2;
    display();
  }
  dialog.addEventListener('keydown',event=>{
    if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();move(event.key==='ArrowRight'?1:-1);}
  });
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  dialog.addEventListener('close',()=>{image.removeAttribute('src');thumbnails.replaceChildren();album=null;if(opener?.isConnected)opener.focus();});
  swipe(stage,move);
  return {open(value,photoIndex=0,trigger=null){if(!value.photos?.length)return;opener=trigger;index=photoIndex;update(value);if(!dialog.open)dialog.showModal();},update,get id(){return album?.id;}};
}
