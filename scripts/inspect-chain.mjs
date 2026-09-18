import nextEnv from '@next/env';
import fs from 'node:fs';
nextEnv.loadEnvConfig(process.cwd());
try {
 const r=await fetch(process.env.SOLANA_RPC_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getMultipleAccounts',params:[['XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp','XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W','SysvarC1ock11111111111111111111111111111111'],{encoding:'jsonParsed',commitment:'finalized'}]}),signal:AbortSignal.timeout(15000)});
 const d=await r.json();fs.writeFileSync('/private/tmp/dividends-chain.json',JSON.stringify(d));console.log(JSON.stringify(d));
} catch {console.log('RPC inspection failed');process.exitCode=1;}
