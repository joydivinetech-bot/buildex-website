import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const out=path.join(root,'public-launch');await mkdir(out,{recursive:true});
const pages=['index','services','flooring','estimate','contact','about','projects'];
for(const file of [...pages.map(p=>p+'.html'),'styles.css','site.js','projects.css','projects.js','buildex-logo.png','favicon.svg']){
 if(file.endsWith('.png')){await copyFile(path.join(root,'public',file),path.join(out,file));continue;}
 let s=await readFile(path.join(root,'public',file),'utf8');
 if(file.endsWith('.html')){
 s=s.replace(/<form\b[^>]*data-inquiry=[\s\S]*?<\/form>/g,'<section class="inquiry-form"><span class="eyebrow">LET’S TALK ABOUT YOUR PROJECT</span><h2>Request your free estimate</h2><p>Call or text our team to discuss your ideas, location and preferred timeline.</p><div class="actions"><a class="button" href="tel:+13465385357">Call (346) 538-5357</a><a class="text-link" href="sms:+13465385357">Text us ↗</a></div><p style="margin-top:24px">You can also reach us at <a href="tel:+18322311684">(832) 231-1684</a> or <a href="tel:+18327435009">(832) 743-5009</a>.</p></section>');
 s=s.replace(/<p class="sample-notice">[\s\S]*?<\/p>/g,'');
 s=s.replace(/<div>\s*<svg[^>]*class="lucide lucide-(?:mail|clock)"[\s\S]*?<\/div>/g,'');
 s=s.replace('</head>',`<link rel="canonical" href="https://buildexconstructions.com/${file==='index.html'?'':file}"></head>`);
 }
 if(file==='site.js'){s=s.replace("  if (!onWeb) throw","  throw new Error('Please call or text our team.');\n  if (!onWeb) throw");s=s.replace('if (contact && onWeb)','if (false && contact && onWeb)');}
 if(file==='projects.js')s=s.replace("document.body.dataset.preview||location.protocol==='file:'","true");
 await writeFile(path.join(out,file),s);
}
await writeFile(path.join(out,'robots.txt'),'User-agent: *\nAllow: /\nSitemap: https://buildexconstructions.com/sitemap.xml\n');
await writeFile(path.join(out,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+pages.map(p=>'<url><loc>https://buildexconstructions.com/'+(p==='index'?'':p+'.html')+'</loc></url>').join('')+'</urlset>');
await writeFile(path.join(out,'_headers'),"/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n");
console.log('Public launch prepared: '+out);
