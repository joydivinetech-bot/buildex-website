import {mkdir,readFile,writeFile,copyFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const out=path.join(root,'cloudflare-dist');await mkdir(out,{recursive:true});
for(const name of await readdir(path.join(root,'public')))await copyFile(path.join(root,'public',name),path.join(out,name));
const auth=(await readFile(path.join(root,'cloudflare/access.mjs'),'utf8')).replace('export async function verifyAccess','async function verifyAccess');
const worker=(await readFile(path.join(root,'cloudflare/worker.mjs'),'utf8')).replace("import {verifyAccess} from './access.mjs';",'');
await writeFile(path.join(out,'_worker.js'),auth+'\n'+worker);
await writeFile(path.join(out,'_routes.json'),JSON.stringify({version:1,include:['/api/*','/admin*'],exclude:[]}));
await writeFile(path.join(out,'_headers'),`/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n  Content-Security-Policy: default-src 'self'; img-src 'self' https://images.pexels.com data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'\n`);
// Hosted administration authenticates at Cloudflare Access; there are no website passwords.
let admin=await readFile(path.join(out,'admin.html'),'utf8');admin=admin.replace(/<section id="login-panel"[\s\S]*?<\/section>/,'<section id="login-panel" class="admin-block" hidden><h2>Administrator access</h2><p>Sign in through your organization’s Cloudflare Access application.</p><a class="button" href="/admin">Sign in securely</a></section>');await writeFile(path.join(out,'admin.html'),admin);
let js=await readFile(path.join(out,'admin.js'),'utf8');js=js.replace("$('#setup-notice').hidden=data.configured;","if($('#setup-notice'))$('#setup-notice').hidden=data.configured;").replace("$('#login-form').addEventListener","$('#login-form')?.addEventListener");js=js.replace("await api('/logout',{method:'POST'});","const result=await api('/logout',{method:'POST'});if(result.redirect){location.assign(result.redirect);return;}");await writeFile(path.join(out,'admin.js'),js);
console.log('Cloudflare deployment files built at '+out);
