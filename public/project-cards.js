import {albumCard} from './album-ui.js';
const el=(tag,cls,text='')=>{const node=document.createElement(tag);node.className=cls;node.textContent=text;return node;};
export function projectCard(item,number,viewer){
  const card=el('article','media-card service-card project-service-card');
  const carousel=albumCard(item,(index,opener)=>viewer.open(item,index,opener),{priority:number===0?'high':'auto'});carousel.classList.add('media-cover');
  const copy=el('div','project-card-copy'),heading=el('h2',''),title=el('button','media-title',item.title);title.type='button';
  const open=trigger=>viewer.open(item,Number(carousel.dataset.photoIndex)||0,trigger);
  title.addEventListener('click',()=>open(title));heading.append(title);
  const eyebrow=el('span','eyebrow',String(number+1).padStart(2,'0')+' / '+(item.inspiration?'DESIGN INSPIRATION':item.category.toUpperCase()));
  const link=el('button','text-link','View project ↗');link.type='button';link.addEventListener('click',()=>open(link));
  copy.append(eyebrow,heading,el('p','project-card-description',item.description||'Explore the photos and details of this Buildex project.'),link);card.append(carousel,copy);
  return card;
}
export async function loadProjectStyles(){
  for(const file of ['projects.css','album-ui.css']){
    const href=new URL(file,import.meta.url).href;
    if([...document.querySelectorAll('link[rel=stylesheet]')].some(link=>link.href===href))continue;
    await new Promise((resolve,reject)=>{const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.onload=resolve;link.onerror=()=>reject(Error('Project styles could not load'));document.head.append(link);});
  }
}
