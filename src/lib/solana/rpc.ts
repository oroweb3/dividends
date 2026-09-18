import 'server-only';
export const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const MAINNET_GENESIS = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
export async function rpc(method: string, params: unknown[] = []): Promise<unknown> {
  const url=process.env.SOLANA_RPC_URL;
  if (!url) throw new Error('Solana RPC is not configured');
  // Never include URL or provider response in errors: URLs can contain API keys.
  try {
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),cache:'no-store',signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw new Error();
    const data=await response.json();
    if (data.error || !('result' in data)) throw new Error();
    return data.result;
  } catch {throw new Error('Solana RPC request failed');}
}
