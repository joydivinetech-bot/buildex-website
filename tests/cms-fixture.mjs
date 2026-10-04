import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
export async function createFixture(origin='https://buildex.test'){
 const sql=new DatabaseSync(':memory:');
 sql.exec(await readFile(new URL('../cloudflare/schema.sql',import.meta.url),'utf8'));
 const prepare=query=>{let args=[];return {bind(...values){args=values;return this;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){return sql.prepare(query).run(...args);}};};
 const env={ADMIN_ORIGIN:origin,PUBLIC_ORIGIN:origin,ADMIN_EMAILS:'studio@example.test',DB:{prepare,async batch(statements){sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}}};
 const token='local-test-session',hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');
 sql.prepare('INSERT INTO admin_sessions VALUES(?,?,?,?)').run(hash,env.ADMIN_EMAILS,Date.now()+3600000,Date.now());
 const request=(route,data,authenticated=true)=>new Request(env.ADMIN_ORIGIN+route,{method:data?'POST':'GET',headers:{...(authenticated?{Cookie:'buildex_admin='+token}:{}),...(data?{Origin:env.ADMIN_ORIGIN,'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
 return {env,sql,token,request};
}
export const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aStsAAAAASUVORK5CYII=','base64');
