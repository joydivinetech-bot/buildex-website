'use strict';
const $=selector=>document.querySelector(selector),element=(tag,text='',className='')=>{const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;return node;};
let inquiries=[];
function notice(message,error=false){const node=$('#notice');node.textContent=message;node.hidden=!message;node.classList.toggle('error',error);}
async function api(path,options={}){const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to load inquiries.');return data;}
function detailLine(inquiry){return [inquiry.details.address,inquiry.details.propertyType,inquiry.details.size,inquiry.details.startDate,inquiry.details.budget].filter(Boolean).join(' · ');}
function render(){
 const query=$('#search').value.trim().toLowerCase(),status=$('#status-filter').value;
 const filtered=inquiries.filter(inquiry=>(status==='all'||inquiry.status===status)&&(!query||[inquiry.name,inquiry.email,inquiry.phone,inquiry.service,inquiry.kind,inquiry.details.description,detailLine(inquiry)].join(' ').toLowerCase().includes(query)));
 $('#summary').replaceChildren(...[['All',inquiries.length],['New',inquiries.filter(i=>i.status==='new').length],['Contacted',inquiries.filter(i=>i.status==='contacted').length],['Closed',inquiries.filter(i=>i.status==='closed').length]].map(([label,value])=>{const card=element('div');card.append(element('strong',String(value)),element('span',label));return card;}));
 $('#result-count').textContent=filtered.length+' '+(filtered.length===1?'inquiry':'inquiries');const list=$('#inquiry-list');list.replaceChildren();
 if(!filtered.length){list.append(element('p','No inquiries match these filters.','empty-state'));return;}
 for(const inquiry of filtered){const card=element('article','','inquiry-card'),top=element('div','','inquiry-card-top'),heading=element('div');heading.append(element('small',new Date(inquiry.created_at).toLocaleString()+' · '+inquiry.kind.toUpperCase()),element('h2',inquiry.name));const select=document.createElement('select');select.setAttribute('aria-label','Status for '+inquiry.name);for(const value of ['new','contacted','closed']){const option=element('option',value[0].toUpperCase()+value.slice(1));option.value=value;option.selected=inquiry.status===value;select.append(option);}select.addEventListener('change',()=>updateStatus(inquiry,select));top.append(heading,select);
  const service=element('p',inquiry.service,'inquiry-service'),contact=element('div','','inquiry-actions'),email=element('a','Email customer'),phone=element('a','Call customer');email.href='mailto:'+inquiry.email;phone.href='tel:'+inquiry.phone.replace(/[^+0-9]/g,'');contact.append(email,phone);card.append(top,service,contact,element('p',inquiry.email+' · '+inquiry.phone,'contact-line'));
  const extra=detailLine(inquiry);if(extra)card.append(element('p',extra,'detail-line'));card.append(element('p',inquiry.details.description,'description'),element('small','Reference: '+inquiry.id,'reference'));list.append(card);
 }
}
async function load(showMessage=false){try{const data=await api('/admin/api/inquiries');inquiries=data.inquiries;$('#account').textContent='Signed in as '+data.user.email;$('#dashboard').hidden=false;render();if(showMessage)notice('Inbox refreshed.');}catch(error){notice(error.message,true);}}
async function updateStatus(inquiry,select){select.disabled=true;try{await api('/admin/api/inquiries',{method:'POST',body:JSON.stringify({action:'status',id:inquiry.id,status:select.value})});inquiry.status=select.value;notice('Inquiry marked '+select.value+'.');render();}catch(error){select.value=inquiry.status;notice(error.message,true);}finally{select.disabled=false;}}
$('#search').addEventListener('input',render);$('#status-filter').addEventListener('change',render);$('#refresh').addEventListener('click',()=>load(true));void load();
