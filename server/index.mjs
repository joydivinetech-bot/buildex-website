import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT||4174),host=process.env.HOST||'127.0.0.1';
const origin=process.env.APP_ORIGIN||`http://127.0.0.1:${port}`;
const app=await createApp({dataDir:path.resolve(root,process.env.DATA_DIR||'data'),origin,production:process.env.NODE_ENV==='production'});
app.server.listen(port,host,()=>console.log(`Buildex is running at ${origin}\nAdministrator: ${origin}/admin`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.close().then(()=>process.exit(0)));
