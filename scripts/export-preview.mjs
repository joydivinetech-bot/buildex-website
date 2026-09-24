import {mkdir,copyFile,readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'preview');await mkdir(output,{recursive:true});
for(const file of await readdir(path.join(root,'public'))){if(!['projects.html','projects.css','projects.js','about.html','index.html','services.html','flooring.html','estimate.html','contact.html','styles.css','site.js','favicon.svg','buildex-logo.png'].includes(file))continue;
 if(file.endsWith('.png')){await copyFile(path.join(root,'public',file),path.join(output,file));continue;}
 let source=await readFile(path.join(root,'public',file),'utf8');
 if(file.endsWith('.html')){source=source.replace(/<body([^>]*)>/,'<body$1 data-preview="true"><div class="sample-notice" role="note">Design preview — contact details and images are samples. Forms and administrator access are not enabled.</div>');source=source.replace(/<a href="\/admin">Administrator<\/a>/g,'');}
 if(file==='site.js'){source=source.replace("  if (!onWeb) throw", "  if (document.body.dataset.preview) throw new Error('This is a design preview. Submissions are not enabled.');\n  if (!onWeb) throw");source=source.replace("if (form) {", "if (form && !document.body.dataset.preview) {");}
 await writeFile(path.join(output,file),source);
}
console.log('Design-only files exported to '+output);
