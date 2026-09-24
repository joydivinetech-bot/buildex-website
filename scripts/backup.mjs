import { DatabaseSync,backup } from 'node:sqlite';
import { mkdir,cp } from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=path.resolve(root,process.env.DATA_DIR||'data');
const destination=path.join(root,'backups',new Date().toISOString().replace(/[:.]/g,'-'));
console.log('The web server should be stopped so the database and uploaded files remain consistent.');
const db=new DatabaseSync(path.join(directory,'buildex.sqlite'),{readOnly:true});
try{await mkdir(destination,{recursive:true});await backup(db,path.join(destination,'buildex.sqlite'));await cp(path.join(directory,'uploads'),path.join(destination,'uploads'),{recursive:true});console.log('Backup saved to '+destination);}finally{db.close();}
