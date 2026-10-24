import {albumCard,albumViewer} from './album-ui.js';

const photo=id=>'https://images.pexels.com/photos/'+id+'/pexels-photo-'+id+'.jpeg?auto=compress&w=1400&q=80';
let items=[
  ['Room for the outdoors','Patios & outdoor living','13600836'],
  ['A beautiful foundation','Flooring & finishes','8288962'],
  ['Details that make a space','Construction & remodeling','38071645'],
  ['Living beyond the walls','Patio inspiration','13600836'],
  ['Texture. Tone. Character.','Flooring inspiration','8288962']
].map(([title,category,id],index)=>({id:id+'-'+index,title,category,type:'photo',inspiration:true,description:'Stock inspiration image — not a completed Buildex project.',photos:[{src:photo(id)}]}));
const grid=document.querySelector('#portfolio-grid'),dialog=document.querySelector('#media-viewer');
const viewer=albumViewer(dialog);
const el=(tag,cls,text='')=>{const node=document.createElement(tag);node.className=cls;node.textContent=text;return node;};
let filter='all';
function render(){
  grid.replaceChildren();
  const filtered=items.filter(item=>filter==='all'||item.type===filter);
  filtered.forEach(item=>{
    const card=el('article','media-card');
    const carousel=albumCard(item,(index,opener)=>viewer.open(item,index,opener));
    carousel.classList.add('media-cover');
    carousel.append(el('span','media-tag',item.inspiration?'PHOTO / INSPIRATION':'PROJECT ALBUM'));
    const meta=el('div','media-meta'),copy=el('div'),title=el('button','media-title',item.title);title.type='button';
    title.addEventListener('click',()=>viewer.open(item,0,title));
    copy.append(title,el('span','media-subtitle',item.category));meta.append(copy,el('span','media-arrow','↗'));card.append(carousel,meta);grid.append(card);
  });
  document.querySelector('#media-count').textContent=filtered.length+(items.some(item=>item.inspiration)?' inspiration photos':filtered.length===1?' project':' projects');
}
document.querySelectorAll('[data-media-filter]').forEach(button=>button.addEventListener('click',()=>{
  filter=button.dataset.mediaFilter;document.querySelectorAll('[data-media-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));render();
}));
const album=(project,photos)=>({id:project.id,title:project.name,category:project.category,type:'photo',description:project.description,photos});
async function loadPhotos(){
  if(document.body.dataset.adminPreview){items=[];render();return;}
  if(document.body.dataset.preview||location.protocol==='file:'){render();return;}
  grid.textContent='Loading projects…';
  try{
    const response=await fetch('/api/projects',{signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error();
    const projects=await response.json();
    const published=projects.map(project=>album(project,(project.photos||[]).filter(p=>/^projects\/[a-z0-9-]+\.(jpg|png|webp)$/.test(p.key)).map(p=>({src:'/api/media?key='+encodeURIComponent(p.key)})))).filter(project=>project.photos.length);
    if(published.length){items=published;document.querySelector('.portfolio-note').textContent='Completed Buildex projects — browse each album to see the whole project.';}
  }catch{document.querySelector('.portfolio-note').textContent='The project gallery is temporarily unavailable. Showing clearly labeled inspiration photos.';}
  render();
}
document.addEventListener('buildex-projects-preview',event=>{
  if(!document.body.dataset.adminPreview)return;
  const viewed=viewer.id;
  items=event.detail.map(project=>album(project,(project.photos||[]).map(p=>({src:p.src})))).filter(project=>project.photos.length);
  filter='all';document.querySelectorAll('[data-media-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mediaFilter==='all')));
  document.querySelector('.portfolio-note').textContent='Private preview — includes your drafts and unpublished changes.';render();
  if(dialog.open){const project=items.find(project=>project.id===viewed);if(project)viewer.update(project);else dialog.close();}
  if(!items.length)grid.append(el('p','gallery-empty','Your projects will appear here as you add photos.'));
});
void loadPhotos();
