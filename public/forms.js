'use strict';
(() => {
 const form=document.querySelector('[data-online-form]');if(!form)return;
 const submit=form.querySelector('[type=submit]'),alert=form.querySelector('[role=alert]');
 const info=document.createElement('p');info.className='form-note';info.textContent='Preparing secure online inquiries…';form.prepend(info);
 const widget=document.createElement('div');widget.className='inquiry-verification';submit.before(widget);
 const privacy=document.createElement('p');privacy.className='form-note';privacy.textContent='Your contact and project details will be used to respond to this inquiry.';widget.before(privacy);
 let widgetId,submissionId=crypto.randomUUID(),busy=false,ready=false,verified=false;
 const update=()=>{submit.disabled=busy||!ready||!verified;};update();
 function error(message){alert.textContent=message;alert.hidden=false;}
 async function setup(){try{
  const r=await fetch('/api/form-config',{signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error();const config=await r.json();if(!config.enabled||!config.siteKey)throw Error();
  await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.onload=resolve;script.onerror=reject;document.head.append(script);});
  window.turnstile.ready(()=>{widgetId=window.turnstile.render(widget,{sitekey:config.siteKey,action:'inquiry',size:'flexible',callback:()=>{verified=true;update();},'expired-callback':()=>{verified=false;update();},'error-callback':()=>{verified=false;update();error('Verification could not load. Please refresh or call us.');}});ready=true;info.textContent='Complete the fields below to send your inquiry securely.';update();});
 }catch{info.textContent='Online inquiries are temporarily unavailable. Please call or text (346) 538-5357.';}}
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!ready||!verified||!form.reportValidity())return;
  busy=true;update();alert.hidden=true;const original=submit.textContent;submit.textContent='Sending…';
  try{const data={...Object.fromEntries(new FormData(form)),kind:form.dataset.inquiry,submissionId};
   const r=await fetch('/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(15000)});const result=await r.json();if(!r.ok||!result.ok)throw Error(result.error||'Unable to save your inquiry.');
   const success=document.createElement('section');success.className='success';success.setAttribute('role','status');success.tabIndex=-1;
   const heading=document.createElement('h2');heading.textContent='Thank you. Your inquiry is saved.';const message=document.createElement('p');message.textContent='Our team will review your project and contact you. For urgent questions, call (346) 538-5357.';success.append(heading,message);form.replaceWith(success);success.focus();
  }catch(e){error(e.name==='TimeoutError'?'The connection timed out. Please retry; your inquiry will not be saved twice.':e.message||'Please try again or call us.');verified=false;if(widgetId!==undefined)window.turnstile.reset(widgetId);}
  finally{busy=false;submit.textContent=original;update();}
 });
 void setup();
})();
