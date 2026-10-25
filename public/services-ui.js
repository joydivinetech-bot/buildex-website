const node=(tag,text,cls)=>{const element=document.createElement(tag);if(text)element.textContent=text;if(cls)element.className=cls;return element;};
const photoSrc=image=>image.src||(document.body.hasAttribute('data-admin-preview')?'/admin/api/media?key=':'/api/media?key=')+encodeURIComponent(image.key);
export function renderServices(services){
 const grid=document.querySelector('.page-services .service-grid');
 if(grid){
  grid.replaceChildren(...services.map((service,index)=>{
   const card=node('article','','service-card'),image=node(service.image?'img':'div');if(service.image){image.src=photoSrc(service.image);image.alt=service.image.alt||service.name;image.loading=index<2?'eager':'lazy';}else{image.className='service-photo-placeholder';image.textContent='Choose a service photo';}
   const copy=node('div'),link=node('a',service.link==='flooring'?'Explore flooring ↗':'Get an estimate ↗','text-link');link.href=service.link==='flooring'?'flooring.html':'estimate.html?service='+encodeURIComponent(service.name);
   copy.append(node('span',String(index+1).padStart(2,'0')+' / BUILDEX SERVICES','eyebrow'),node('h2',service.name),node('p',service.description),link);card.append(image,copy);return card;
  }));
  if(!services.length)grid.append(node('p','Contact our team to discuss your project.'));
 }
 const home=document.querySelector('.page-index .service-list');
 if(home)home.replaceChildren(...services.map(service=>{const link=node('a',service.name+' ↗');link.href='services.html';return link;}));
 const select=document.querySelector('select[name=service]');
 if(select){const value=select.value||new URLSearchParams(location.search).get('service'),flooring=services.some(s=>s.link==='flooring'),extras=flooring?['Vinyl flooring','Hardwood flooring','Engineered wood','Laminate flooring','Tile & porcelain','Carpet']:[],names=[...new Set([...services.map(s=>s.name),...extras])];select.replaceChildren(new Option('Please select',''),...names.map(name=>new Option(name,name)));if([...select.options].some(option=>option.value===value))select.value=value;}
}
let previewApplied=false;
document.addEventListener('buildex-services-preview',event=>{previewApplied=true;renderServices(event.detail);});
if(document.buildexServicePreview){previewApplied=true;renderServices(document.buildexServicePreview);}
if(!previewApplied)fetch('/api/services',{cache:'no-store'}).then(async response=>{if(!response.ok)throw Error('Services unavailable');const services=await response.json();if(!previewApplied&&Array.isArray(services))renderServices(services);}).catch(()=>{});
