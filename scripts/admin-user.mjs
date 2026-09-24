import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore,setAdmin } from '../server/store.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let muted=false;
const output=new Writable({write(chunk,encoding,done){if(!muted)process.stdout.write(chunk);done();}});
const rl=createInterface({input:process.stdin,output,terminal:!!process.stdin.isTTY});
try{
  console.log('Create a Buildex administrator, or reset the password for an existing email.');
  const email=await rl.question('Administrator email: ');
  process.stdout.write('Password (14+ characters; hidden): ');muted=true;
  const password=await rl.question('');muted=false;process.stdout.write('\n');
  process.stdout.write('Confirm password: ');muted=true;
  const confirmation=await rl.question('');muted=false;process.stdout.write('\n');
  if(password!==confirmation)throw new Error('Passwords do not match.');
  const db=openStore(path.resolve(root,process.env.DATA_DIR||'data'));
  try{await setAdmin(db,email,password);console.log('Administrator saved. Sign in at /admin.');}finally{db.close();}
}catch(error){muted=false;console.error(error.message);process.exitCode=1;}finally{rl.close();}
