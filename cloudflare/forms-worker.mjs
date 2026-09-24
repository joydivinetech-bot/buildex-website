// This deployment exposes only inquiry endpoints; CMS/admin remain offline.
import {handleInquiry} from './inquiries.mjs';
export default {async fetch(request,env,ctx){const path=new URL(request.url).pathname;if(path==='/api/inquiries'||path==='/api/form-config')return handleInquiry(request,env,ctx);if(path.startsWith('/api/')||path.startsWith('/admin'))return new Response('Not found',{status:404});return env.ASSETS.fetch(request);}};
