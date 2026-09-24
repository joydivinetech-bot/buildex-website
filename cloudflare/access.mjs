// Access assertions are verified cryptographically; identity headers alone are never trusted.
const cachedKeys = new Map();
const decode = value => Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0));
export async function verifyAccess(request,env,fetcher=fetch){
 const issuer=env.ACCESS_ISSUER,audience=env.ACCESS_AUD;
 if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer||'')||!audience||!env.ADMIN_EMAILS)throw Object.assign(new Error('Administrator access is not configured.'),{status:503});
 const token=request.headers.get('Cf-Access-Jwt-Assertion');if(!token||token.length>16000)throw Object.assign(new Error('Sign in through Cloudflare Access.'),{status:401});
 try{
  const parts=token.split('.');if(parts.length!==3)throw Error();
  const header=JSON.parse(new TextDecoder().decode(decode(parts[0]))),claims=JSON.parse(new TextDecoder().decode(decode(parts[1])));
  const now=Math.floor(Date.now()/1000);if(header.alg!=='RS256'||typeof header.kid!=='string'||claims.iss!==issuer||!Array.isArray(claims.aud)||!claims.aud.includes(audience)||!Number.isFinite(claims.exp)||claims.exp<=now||!Number.isFinite(claims.iat)||claims.iat>now+30||(claims.nbf&&claims.nbf>now+30))throw Error();
  let cached=cachedKeys.get(issuer);if(!cached||cached.expires<Date.now()||!cached.keys.some(k=>k.kid===header.kid)){
   const response=await fetcher(issuer+'/cdn-cgi/access/certs');if(!response.ok)throw Error();const body=await response.json();if(!Array.isArray(body.keys))throw Error();cached={keys:body.keys,expires:Date.now()+300000};cachedKeys.set(issuer,cached);
  }
  const jwk=cached.keys.find(k=>k.kid===header.kid&&k.kty==='RSA');if(!jwk)throw Error();
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))throw Error();
  const email=String(claims.email||'').toLowerCase();if(!env.ADMIN_EMAILS.split(',').map(s=>s.trim().toLowerCase()).includes(email))throw Error();return {email};
 }catch{throw Object.assign(new Error('Administrator authorization failed.'),{status:401});}
}
