'use strict';
const text=(tag,value,className='')=>{const node=document.createElement(tag);node.textContent=value;if(className)node.className=className;return node;};
function apply(settings){
 const primary=settings.primaryPhone,secondary=settings.secondaryPhone,hero=document.querySelector('.hero-content');
 if(hero){const eyebrow=hero.querySelector(':scope > .eyebrow'),lines=hero.querySelectorAll('.hero-title-line'),description=hero.querySelector(':scope > p');if(eyebrow&&settings.heroEyebrow)eyebrow.lastChild.textContent=' '+settings.heroEyebrow;if(lines[0])lines[0].textContent=settings.heroTitleLine1||'';if(lines[1])lines[1].textContent=settings.heroTitleLine2||'';if(description){description.replaceChildren(...String(settings.heroDescription||'').split('\n').flatMap((line,index)=>index?[document.createElement('br'),document.createTextNode(line)]:[document.createTextNode(line)]));}}
 const topbar=document.querySelector('.topbar span');if(topbar&&settings.serviceArea)topbar.lastChild.textContent=' Proudly serving '+settings.serviceArea+' & surrounding areas';
 document.querySelectorAll('a[href^="tel:"]').forEach(link=>{if(!primary)return;link.href='tel:'+primary.replace(/[^+\d]/g,'');if(/^\(832\)/.test(link.textContent.trim()))link.textContent=primary;});
 const footer=[...document.querySelectorAll('.footer p')].find(node=>node.textContent.includes('Residential'));if(footer&&settings.serviceArea)footer.innerHTML='Residential &amp; commercial construction<br>'+settings.serviceArea.replace(/[&<>]/g,value=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[value]));
}
addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='buildex-preview')return;apply(event.data.settings||{});});
document.addEventListener('click',event=>{const link=event.target.closest('a');if(link&&!link.closest('.hero'))event.preventDefault();});
const banner=text('div','PRIVATE PREVIEW · CHANGES ARE NOT PUBLISHED','preview-only-banner');document.body.prepend(banner);parent.postMessage({type:'buildex-preview-ready'},location.origin);
