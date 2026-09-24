// Explicit opt-in build: use only after D1 and Turnstile are configured in Pages.
import './export-launch.mjs';
import {readFile,writeFile,copyFile} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'public-launch');
for(const name of ['contact','estimate']){
 const source=await readFile(path.join(root,'public',name+'.html'),'utf8');const form=source.match(/<form\b[^>]*data-inquiry=[\s\S]*?<\/form>/)?.[0];if(!form)throw Error('Missing '+name+' form');
 let html=await readFile(path.join(out,name+'.html'),'utf8');html=html.replace(/<section class="inquiry-form">[\s\S]*?<\/section>/,form.replace('<form ','<form data-online-form '));html=html.replace('</head>','<script src="forms.js" defer></script></head>');await writeFile(path.join(out,name+'.html'),html);
}
let site=await readFile(path.join(out,'site.js'),'utf8');site=site.replace('if (form) {','if (form && !form.hasAttribute(\'data-online-form\')) {');await writeFile(path.join(out,'site.js'),site);await copyFile(path.join(root,'public/forms.js'),path.join(out,'forms.js'));
await writeFile(path.join(out,'_headers'),"/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n  Content-Security-Policy: default-src 'self'; img-src 'self' https://images.pexels.com data:; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'\n");
console.log('Forms deployment ready; configure DB, PUBLIC_ORIGIN, TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY before deploying.');
