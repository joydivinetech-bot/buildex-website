import {previewPage} from './cms-utils.js';
let lastProjects = '';
const safePhoto = photo => {
  if(typeof photo.src==='string'){
    const url=new URL(photo.src,location.origin);
    if(url.origin===location.origin&&(url.protocol==='blob:'||url.pathname==='/admin/api/media'))return {...photo,src:url.href};
  }
  return {...photo,src:'/admin/api/media?key='+encodeURIComponent(photo.key||'')};
};
addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='buildex-preview'||!Array.isArray(event.data.projects))return;
  const signature=JSON.stringify(event.data.projects);
  if(signature===lastProjects)return;
  lastProjects=signature;
  const projects=event.data.projects.map(project=>({...project,photos:(project.photos||[]).map(safePhoto)}));
  document.dispatchEvent(new CustomEvent('buildex-projects-preview',{detail:projects}));
});
document.addEventListener('click',event=>{
  const link=event.target.closest('a');if(!link)return;
  const href=link.getAttribute('href');if(!href)return;
  if(href.startsWith('#')){event.preventDefault();document.getElementById(href.slice(1))?.scrollIntoView();return;}
  const page=previewPage(link.href,location.origin+'/');if(!page)return;
  event.preventDefault();const url=new URL(link.href,location.origin);
  parent.postMessage({type:'buildex-preview-navigate',page,search:url.search,hash:url.hash},location.origin);
});
document.addEventListener('submit',event=>{event.preventDefault();event.stopImmediatePropagation();},true);
parent.postMessage({type:'buildex-preview-ready'},location.origin);
