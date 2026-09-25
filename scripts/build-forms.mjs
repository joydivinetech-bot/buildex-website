// Explicit opt-in build: use only after D1 and Turnstile are configured in Pages.
import './export-launch.mjs';
import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'public-launch');
// Restore the connected runtime files after the static export intentionally disables APIs.
await copyFile(path.join(root,'public','site.js'),path.join(out,'site.js'));
await copyFile(path.join(root,'public','projects.js'),path.join(out,'projects.js'));
for(const name of ['contact','estimate']){
 const source=await readFile(path.join(root,'public',name+'.html'),'utf8');const form=source.match(/<form\b[^>]*data-inquiry=[\s\S]*?<\/form>/)?.[0];if(!form)throw Error('Missing '+name+' form');
 let html=await readFile(path.join(out,name+'.html'),'utf8');html=html.replace(/<section class="inquiry-form">[\s\S]*?<\/section>/,form.replace('<form ','<form data-online-form '));html=html.replace('</head>','<script src="forms.js" defer></script></head>');await writeFile(path.join(out,name+'.html'),html);
}
let site=await readFile(path.join(out,'site.js'),'utf8');site=site.replace('if (form) {','if (form && !form.hasAttribute(\'data-online-form\')) {');await writeFile(path.join(out,'site.js'),site);await copyFile(path.join(root,'public/forms.js'),path.join(out,'forms.js'));
await mkdir(path.join(out,'admin'),{recursive:true});for(const [source,target] of [['inquiry-dashboard.html','dashboard.html'],['inquiry-dashboard.js','dashboard.js'],['inquiry-dashboard.css','dashboard.css'],['admin-preview.js','preview.js']])await copyFile(path.join(root,'public',source),path.join(out,'admin',target));
await writeFile(path.join(out,'_headers'),"/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n  Content-Security-Policy: default-src 'self'; img-src 'self' https://images.pexels.com data:; script-src 'self' https://challenges.cloudflare.com https://static.cloudflareinsights.com; frame-src https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com https://cloudflareinsights.com; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'\n");
console.log('Forms deployment ready; configure DB, PUBLIC_ORIGIN, TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY before deploying.');
