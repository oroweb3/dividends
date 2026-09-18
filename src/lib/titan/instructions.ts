import { z } from 'zod';
import { getBase58Decoder } from '@solana/kit';
export const TITAN_PROGRAM='T1TANpTeScyeqVzzgNViGDNrkQ6qHz9KrSBS4aNXvGT';
export const ATA_PROGRAM='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export const COMPUTE_PROGRAM='ComputeBudget111111111111111111111111111111';
const bytes=z.instanceof(Uint8Array);
const pubkey=bytes.refine(b=>b.length===32);
export const routeSchema=z.object({instructions:z.array(z.object({p:pubkey,a:z.array(z.object({p:pubkey,s:z.boolean(),w:z.boolean()})).max(128),d:bytes})).min(1).max(12),addressLookupTables:z.array(pubkey).max(8)});
export type TitanRoute=z.infer<typeof routeSchema>;
export type SwapExpectation={wallet:string;inputMint:string;outputMint:string;source:string;destination:string;inputProgram:string;outputProgram:string;atlas:string;amount:bigint;minimum:bigint};
const key=(b:Uint8Array)=>getBase58Decoder().decode(b);
export function validateTitanInstructions(value:unknown,e:SwapExpectation){
 const route=routeSchema.parse(value);let swaps=0,atas=0;
 const instructions=route.instructions.map(ix=>({program:key(ix.p),accounts:ix.a.map(a=>({address:key(a.p),signer:a.s,writable:a.w})),data:Buffer.from(ix.d)}));
 for(const ix of instructions){
  if(ix.accounts.some(a=>a.signer&&a.address!==e.wallet))throw new Error('Unexpected transaction signer');
  if(ix.program===COMPUTE_PROGRAM){
   // Discard provider budgets; locally add a fixed capped limit and zero priority fee.
   if(ix.accounts.length||!((ix.data[0]===2&&ix.data.length===5)||(ix.data[0]===3&&ix.data.length===9)))throw new Error('Unsupported compute instruction');
   continue;
  }
  if(ix.program===ATA_PROGRAM){
   atas++;
   const expected=[e.wallet,e.destination,e.wallet,e.outputMint,'11111111111111111111111111111111',e.outputProgram];
   if(atas>1||swaps||ix.data.length!==1||ix.data[0]!==1||ix.accounts.length!==6||expected.some((a,i)=>ix.accounts[i].address!==a)||!ix.accounts[0].signer||!ix.accounts[0].writable||!ix.accounts[1].writable)throw new Error('Unsupported token account creation');
   continue;
  }
  if(ix.program!==TITAN_PROGRAM)throw new Error('Unsupported top-level program');
  swaps++;
  const fixed=[e.wallet,e.atlas,e.inputMint,e.source,e.outputMint,e.destination,e.inputProgram,e.outputProgram];
  if(swaps!==1||ix.accounts.length<8||fixed.some((a,i)=>ix.accounts[i].address!==a)||!ix.accounts[0].signer||!ix.accounts[0].writable||!ix.accounts[3].writable||!ix.accounts[5].writable)throw new Error('Swap accounts do not match the preview');
  const discriminator=Buffer.from([249,91,84,33,69,22,0,135]);
  if(ix.data.length<33||!ix.data.subarray(0,8).equals(discriminator))throw new Error('Unsupported Titan swap version');
  if(ix.data.readBigUInt64LE(8)!==e.amount||ix.data.readBigUInt64LE(16)<e.minimum||e.minimum<=0n)throw new Error('Swap input or minimum output mismatch');
  if(ix.data.readUInt16LE(25)!==0||ix.data.readUInt16LE(27)!==0)throw new Error('Unexpected Titan service/provider fee');
  if(ix.data.readUInt32LE(29)===0)throw new Error('Empty swap route');
 }
 if(swaps!==1)throw new Error('Exactly one Titan swap is required');
 return {route,instructions:instructions.filter(ix=>ix.program!==COMPUTE_PROGRAM)};
}
