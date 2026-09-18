import {createPrivateKey,sign} from 'node:crypto';
import canonicalize from 'canonicalize';
export function authorizationSignature(keyValue:string,url:string,body:object,headers:Record<string,string>){
 const raw=keyValue.trim();
 const key=createPrivateKey(raw.includes('BEGIN')?raw:{key:Buffer.from(raw.replace(/^wallet-auth:/,''),'base64'),format:'der',type:'pkcs8'});
 if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1')throw Error('Invalid authorization key');
 const payload=canonicalize({version:1,method:'POST',url,body,headers});
 if(!payload)throw Error('Invalid authorization payload');
 return sign('sha256',Buffer.from(payload),key).toString('base64');
}
