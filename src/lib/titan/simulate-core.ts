import { verifySwapEffects } from './effects';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { address,blockhash,getBase58Decoder,getProgramDerivedAddress,createTransactionMessage,setTransactionMessageFeePayer,setTransactionMessageLifetimeUsingBlockhash,appendTransactionMessageInstructions,compressTransactionMessageUsingAddressLookupTables,compileTransaction,getTransactionEncoder,type Instruction,type AddressesByLookupTableAddress } from '@solana/kit';
import { findAssociatedTokenPda } from '@solana-program/token';
const TOKEN_2022='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export type SimulationRpc=(method:string,params:unknown[])=>Promise<unknown>;
import { routeSchema,validateTitanInstructions,TITAN_PROGRAM,COMPUTE_PROGRAM,ATA_PROGRAM } from './instructions';
import { exactUint } from './normalize';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const accountSchema=z.object({owner:z.string(),lamports:z.number().int().nonnegative().safe(),executable:z.boolean(),data:z.tuple([z.string(),z.literal('base64')])});
type Account=z.infer<typeof accountSchema>;
const responseSchema=z.object({context:z.object({slot:z.number().int().safe()}),value:z.array(accountSchema.nullable())});
const decodeKey=(b:Uint8Array)=>getBase58Decoder().decode(b);
function tokenAccount(account:Account|null,mint:string,wallet:string,program:string){
 if(!account||account.owner!==program||account.executable)throw new Error('Token account unavailable');
 const data=Buffer.from(account.data[0],'base64');
 if(data.length<165||decodeKey(data.subarray(0,32))!==mint||decodeKey(data.subarray(32,64))!==wallet||data[108]!==1)throw new Error('Token account owner, mint or state mismatch');
 return {amount:data.readBigUInt64LE(64),data};
}
export async function prepareTitanSwapWithRpc(rpc:SimulationRpc,args:{route:unknown;wallet:string;sponsor?:string;inputMint:string;outputMint:string;amount:string;minimum:string;sourceAccounts:{address:string;rawBaseUnits:string}[];expiresAt:number;expiresAfterSlot?:unknown;lifetime?:{blockhash:string;lastValidBlockHeight:number}}){
 const route=routeSchema.parse(args.route);
 const payer=args.sponsor??args.wallet;
 if(args.sponsor===args.wallet)throw Error('Sponsor must differ from user');
 const titan=route.instructions.find(ix=>decodeKey(ix.p)===TITAN_PROGRAM);
 if(!titan||titan.a.length<8)throw new Error('Titan instruction missing');
 const source=decodeKey(titan.a[3].p),destination=decodeKey(titan.a[5].p);
 if(!args.sourceAccounts.some(a=>a.address===source))throw new Error('Unexpected stock source account');
 const outputProgram=decodeKey(titan.a[7].p);
 if(![TOKEN,TOKEN_2022].includes(outputProgram))throw new Error('Unsupported GOLD token program');
 const [expectedDestination]=await findAssociatedTokenPda({owner:address(args.wallet),mint:address(args.outputMint),tokenProgram:address(outputProgram)});
 if(destination!==expectedDestination)throw new Error('GOLD must go to your associated token account');
 const [atlas]=await getProgramDerivedAddress({programAddress:address(TITAN_PROGRAM),seeds:[Buffer.from('atlas')]});
 const audit=validateTitanInstructions(route,{wallet:args.wallet,inputMint:args.inputMint,outputMint:args.outputMint,source,destination,inputProgram:TOKEN_2022,outputProgram,atlas,amount:BigInt(args.amount),minimum:BigInt(args.minimum)});
 // Provider routes are audited as user-owned; only the validated ATA payer is replaced.
 if(args.sponsor){
  if(audit.instructions.some(ix=>ix.program===payer||ix.accounts.some(a=>a.address===payer)))throw Error('Sponsor must not be a swap account');
  for(const ix of audit.instructions)if(ix.program===ATA_PROGRAM)ix.accounts[0]={address:payer,signer:true,writable:true};
 }
 // Verify actual mint programs and reject extensions that alter debit/receipt semantics.
 const mintSchema=z.object({owner:z.string(),data:z.object({parsed:z.object({type:z.literal('mint'),info:z.object({isInitialized:z.literal(true),extensions:z.array(z.object({extension:z.string(),state:z.unknown().optional()})).optional()})})})});
 const mintResponse=z.object({value:z.array(mintSchema)}).parse(await rpc('getMultipleAccounts',[[args.inputMint,args.outputMint],{encoding:'jsonParsed',commitment:'confirmed'}]));
 if(mintResponse.value.length!==2||mintResponse.value[0].owner!==TOKEN_2022||mintResponse.value[1].owner!==outputProgram)throw new Error('Mint token program mismatch');
 for(const mint of mintResponse.value){for(const ext of mint.data.parsed.info.extensions??[]){
  if(['transferFeeConfig','confidentialTransferMint','confidentialTransferFeeConfig','nonTransferable'].includes(ext.extension)){
   // xStocks expose confidentialTransferMint but public balances can still swap.
   if(ext.extension!=='confidentialTransferMint')throw new Error('Unsupported token extension');
  }
  if(ext.extension==='transferHook'&&(ext.state as {programId?:string|null})?.programId)throw new Error('Active transfer hooks are not supported');
  if(ext.extension==='pausableConfig'&&(ext.state as {paused?:boolean})?.paused)throw new Error('Mint is paused');
 }}
 const writable=[...new Set([args.wallet,source,destination,payer,...audit.instructions.flatMap(ix=>ix.accounts.filter(a=>a.writable).map(a=>a.address))])];
 if(writable.length>64)throw new Error('Too many writable accounts to inspect');
 const before=responseSchema.parse(await rpc('getMultipleAccounts',[writable,{encoding:'base64',commitment:'confirmed'}]));
 if(before.value.length!==writable.length)throw new Error('Account evidence missing');
 const sourceBefore=tokenAccount(before.value[writable.indexOf(source)],args.inputMint,args.wallet,TOKEN_2022);
 const goldBeforeAccount=before.value[writable.indexOf(destination)];
 const goldBefore=goldBeforeAccount?tokenAccount(goldBeforeAccount,args.outputMint,args.wallet,outputProgram).amount:0n;
 if(sourceBefore.amount.toString()!==args.sourceAccounts.find(a=>a.address===source)!.rawBaseUnits||sourceBefore.amount<BigInt(args.amount))throw new Error('Stock balance changed before simulation');
 // A CPI can touch only supplied writable accounts. Reject other wallet-owned token accounts.
 before.value.forEach((account,i)=>{if(account&&[TOKEN,TOKEN_2022].includes(account.owner)&&![source,destination].includes(writable[i])){const data=Buffer.from(account.data[0],'base64');if(data.length>=165&&decodeKey(data.subarray(32,64))===args.wallet)throw new Error('Route touches another wallet token account');}});
 const tables:AddressesByLookupTableAddress={};
 for(const bytes of route.addressLookupTables){
  const key=decodeKey(bytes);
  const raw=z.object({value:accountSchema}).parse(await rpc('getAccountInfo',[key,{encoding:'base64',commitment:'confirmed',minContextSlot:before.context.slot}])).value;
  const data=Buffer.from(raw.data[0],'base64');
  if(raw.owner!=='AddressLookupTab1e1111111111111111111111111'||data.length<56||(data.length-56)%32||data.readUInt32LE(0)!==1||data.readBigUInt64LE(4)!==2n**64n-1n)throw new Error('Invalid or deactivated lookup table');
  const entries=[];for(let offset=56;offset<data.length;offset+=32)entries.push(address(decodeKey(data.subarray(offset,offset+32))));tables[address(key)]=entries;
 }
 const latest=z.object({value:z.object({blockhash:z.string(),lastValidBlockHeight:z.number().int().safe()})}).parse(args.lifetime?{value:args.lifetime}:await rpc('getLatestBlockhash',[{commitment:'confirmed',minContextSlot:before.context.slot}]));
 const limit=Buffer.alloc(5);limit[0]=2;limit.writeUInt32LE(1400000,1);
 const instructions:Instruction[]=[{programAddress:address(COMPUTE_PROGRAM),data:limit},...audit.instructions.map(ix=>({programAddress:address(ix.program),data:ix.data,accounts:ix.accounts.map(a=>({address:address(a.address),role:(a.signer?(a.writable?3:2):(a.writable?1:0)) as 0|1|2|3}))}))];
 const message=appendTransactionMessageInstructions(instructions,setTransactionMessageLifetimeUsingBlockhash({blockhash:blockhash(latest.value.blockhash),lastValidBlockHeight:BigInt(latest.value.lastValidBlockHeight)},setTransactionMessageFeePayer(address(payer),createTransactionMessage({version:0}))));
 const transaction=compileTransaction(compressTransactionMessageUsingAddressLookupTables(message,tables));
 if(Object.keys(transaction.signatures).length!==(args.sponsor?2:1)||!(args.wallet in transaction.signatures)||!(payer in transaction.signatures))throw new Error('Unexpected compiled signer');
 const bytes=getTransactionEncoder().encode(transaction);
 if(bytes.length>1232)throw new Error('Transaction exceeds supported v0 size');
 const fee=z.object({value:z.number().int().nonnegative().safe().nullable()}).parse(await rpc('getFeeForMessage',[Buffer.from(transaction.messageBytes).toString('base64'),{commitment:'confirmed'}])).value;
 if(fee===null||fee>100000)throw new Error('Network fee unavailable or above cap');
 const walletBefore=before.value[writable.indexOf(payer)];
 if(!walletBefore||walletBefore.executable||walletBefore.data[0]!==''||walletBefore.owner!=='11111111111111111111111111111111')throw new Error('Fee payer unavailable');
 if(Date.now()>=args.expiresAt||args.expiresAfterSlot!==undefined&&BigInt(before.context.slot)>=exactUint(args.expiresAfterSlot))throw new Error('Titan route expired');
 const simulated=z.object({context:z.object({slot:z.number().int().safe()}),value:z.object({err:z.unknown(),accounts:z.array(accountSchema.nullable()).nullable().optional(),unitsConsumed:z.number().int().optional()})}).parse(await rpc('simulateTransaction',[Buffer.from(bytes).toString('base64'),{encoding:'base64',sigVerify:false,replaceRecentBlockhash:false,commitment:'confirmed',minContextSlot:before.context.slot,accounts:{encoding:'base64',addresses:writable}}]));
 if(simulated.value.err!==null)throw new Error('Unsigned simulation failed. Check stock and SOL funding.');
 if(simulated.context.slot<before.context.slot)throw new Error('Simulation predates balance evidence');
 const after=simulated.value.accounts;if(!after||after.length!==writable.length)throw new Error('Simulation account evidence missing');
 const sourceAfter=tokenAccount(after[writable.indexOf(source)],args.inputMint,args.wallet,TOKEN_2022);
 const goldAfter=tokenAccount(after[writable.indexOf(destination)],args.outputMint,args.wallet,outputProgram);
 if(sourceBefore.amount-sourceAfter.amount!==BigInt(args.amount)||goldAfter.amount-goldBefore<BigInt(args.minimum))throw new Error('Simulated stock debit or GOLD receipt mismatch');
 const sanitized=(data:Buffer)=>{const copy=Buffer.from(data);copy.fill(0,64,72);return copy;};
 if(!sanitized(sourceBefore.data).equals(sanitized(sourceAfter.data)))throw new Error('Stock account authority or configuration changed');
 if(goldBeforeAccount&&!sanitized(tokenAccount(goldBeforeAccount,args.outputMint,args.wallet,outputProgram).data).equals(sanitized(goldAfter.data)))throw new Error('GOLD account configuration changed');
 const walletAfter=after[writable.indexOf(payer)];if(!walletAfter||walletAfter.owner!==walletBefore.owner||walletAfter.executable||walletAfter.data[0]!==walletBefore.data[0])throw new Error('Fee payer changed');
 const rent=goldBeforeAccount?0:after[writable.indexOf(destination)]!.lamports;
 if(args.sponsor){
  const userBefore=before.value[writable.indexOf(args.wallet)],userAfter=after[writable.indexOf(args.wallet)];
  const emptySystem=(a:Account|null)=>!a||a.owner==='11111111111111111111111111111111'&&!a.executable&&a.data[0]==='';
  if(!emptySystem(userBefore)||!emptySystem(userAfter)||(userBefore?.lamports??0)!==(userAfter?.lamports??0))throw Error('Sponsored swap changed user SOL');
  if(walletBefore.lamports-walletAfter.lamports!==fee+rent)throw Error('Unexpected sponsor debit');
 }

 verifySwapEffects({stockBefore:sourceBefore.amount,stockAfter:sourceAfter.amount,input:BigInt(args.amount),goldBefore,goldAfter:goldAfter.amount,minimum:BigInt(args.minimum),solBefore:BigInt(walletBefore.lamports),solAfter:BigInt(walletAfter.lamports),fee:BigInt(fee),rent:BigInt(rent)});
 if(Date.now()>=args.expiresAt||args.expiresAfterSlot!==undefined&&BigInt(simulated.context.slot)>=exactUint(args.expiresAfterSlot))throw new Error('Quote expired during simulation');
 const simulation={status:'passed' as const,transactionHash:createHash('sha256').update(Buffer.from(bytes)).digest('hex'),slot:simulated.context.slot,unitsConsumed:simulated.value.unitsConsumed??null,networkFeeLamports:fee,rentLamports:rent,feePayer:payer,sponsored:!!args.sponsor,inputDebited:args.amount,goldReceived:(goldAfter.amount-goldBefore).toString(),minimumEnforced:BigInt(args.minimum).toString(),unsigned:true};
 return {simulation,unsignedTransaction:Buffer.from(bytes).toString('base64'),lifetime:latest.value};
}
export async function simulateTitanSwapWithRpc(rpc:SimulationRpc,args:Parameters<typeof prepareTitanSwapWithRpc>[1]){
 return (await prepareTitanSwapWithRpc(rpc,args)).simulation;
}
