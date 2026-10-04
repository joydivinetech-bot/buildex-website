// This deployment exposes public inquiry forms and the protected inquiry dashboard.
import {handleInquiry} from './inquiries.mjs';
import {handleInquiryAdmin} from './inquiry-admin.mjs';
import {verifyAdminSession,handleAdminAuth} from './admin-auth.mjs';
import {handlePublicSite,handleSiteAdmin} from './site-admin.mjs';
const secure=response=>{const headers=new Headers(response.headers);headers.set('Cache-Control','private, no-store');headers.set('X-Content-Type-Options','nosniff');headers.set('X-Frame-Options','DENY');headers.set('Referrer-Policy','no-referrer');headers.set('Content-Security-Policy',"default-src 'self'; img-src 'self' https://images.pexels.com data: blob:; script-src 'self'; frame-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");return new Response(response.body,{status:response.status,headers});};
export async function preview(request,env,authorize=verifyAdminSession){
 if(new URL(request.url).origin!==env.ADMIN_ORIGIN)return new Response('Not found',{status:404});
 await authorize(request,env);
 const page=new URL(request.url).searchParams.get('page')||'home';
 const pages={home:'/',services:'/services',flooring:'/flooring',estimate:'/estimate',projects:'/projects',about:'/about',contact:'/contact'};
 if(!Object.hasOwn(pages,page))return new Response('Page not found',{status:404});
 let assetURL=new URL(pages[page],request.url),asset;
 // Static asset bindings can return canonical redirects. Consume those internally
 // so the iframe never leaves the private route for an unembeddable public page.
 for(let attempt=0;attempt<4;attempt++){
  asset=await env.ASSETS.fetch(new Request(assetURL,{method:'GET'}));
  if(![301,302,307,308].includes(asset.status))break;
  const target=new URL(asset.headers.get('location'),assetURL);
  if(target.origin!==new URL(request.url).origin)throw Error('Invalid asset redirect');
  assetURL=target;
 }
 if(!asset.ok||!asset.headers.get('content-type')?.includes('text/html'))throw Error('Preview page unavailable');
 let html=await asset.text();
 html=html.replace(/<script\b[^>]*src="forms\.js"[^>]*><\/script>/gi,'')
   .replace('<head>','<head><base href="/">')
   .replace(/<body([^>]*)>/i,'<body$1 data-admin-preview="true">')
   .replace('</head>','<script type="module" src="/admin/preview.js"></script></head>');
 return new Response(html,{headers:{
  'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
  'X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'no-referrer',
  'Content-Security-Policy':"default-src 'self'; img-src 'self' https://images.pexels.com data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'; base-uri 'self'; form-action 'none'"
 }});
}
export default {async fetch(request,env,ctx){const url=new URL(request.url),path=url.pathname;if(path==='/api/inquiries'||path==='/api/form-config')return handleInquiry(request,env,ctx);if(['/api/projects','/api/settings','/api/media'].includes(path))return handlePublicSite(request,env);if(path.startsWith('/admin/api/auth/'))return handleAdminAuth(request,env);if(path==='/admin/api/inquiries'||path==='/admin/api/inquiries.csv'||path==='/admin/api/session')return handleInquiryAdmin(request,env);if(path.startsWith('/admin/api/'))return handleSiteAdmin(request,env);if(path==='/admin/preview')return preview(request,env).catch(error=>error.response||new Response('Unable to open preview. Sign in again and retry.',{status:error.status||500}));if(path==='/admin'||path==='/admin/'||path.startsWith('/admin/')){if(path==='/admin'||path==='/admin/')url.pathname='/admin/dashboard.html';return secure(await env.ASSETS.fetch(new Request(url,request)));}if(path.startsWith('/api/'))return new Response('Not found',{status:404});return env.ASSETS.fetch(request);}};
