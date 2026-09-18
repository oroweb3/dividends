import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const supabaseUrl = process.env.SUPABASE_URL || `https://${process.env.SUPABASE_PROJECT_ID}.supabase.co`;
const checks = [
  ['Solana RPC', process.env.SOLANA_RPC_URL, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getGenesisHash'})}],
  ['Supabase', `${supabaseUrl}/rest/v1/`, {headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`}}],
];
for (const [label,url,options] of checks) {
  try {
    const response = await fetch(url,{...options,signal:AbortSignal.timeout(15000)});
    const data=await response.json();
    console.log(label, 'HTTP',response.status, label==='Solana RPC' ? (data.result==='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'?'mainnet verified':data.error?'RPC error':`unexpected chain: ${String(data.result)}`) : '');
  } catch { console.log(label,'connection failed (details hidden to protect credentials)'); process.exitCode=1; }
}
