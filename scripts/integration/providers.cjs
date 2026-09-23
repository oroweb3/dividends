/* eslint-disable @typescript-eslint/no-require-imports -- Standalone integration harness. */
const assert=require('node:assert/strict');
const {generateKeyPairSync,sign,randomUUID}=require('node:crypto');
const kit=require('@solana/kit');
const {findAssociatedTokenPda}=require('@solana-program/token');
const system='11111111111111111111111111111111';
const inputProgram='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const outputProgram='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const enc=s=>new Uint8Array(kit.getBase58Encoder().encode(s));
function keypair(){const pair=generateKeyPairSync('ed25519');return {...pair,address:kit.getBase58Decoder().decode(pair.publicKey.export({format:'der',type:'spki'}).subarray(-32))};}
function account(owner,lamports,data=Buffer.alloc(0)){return {owner,lamports,executable:false,data:[data.toString('base64'),'base64']};}
function partial(unsigned,key){
 const bytes=Buffer.from(unsigned,'base64'),tx=kit.getTransactionDecoder().decode(bytes);
 const index=Object.keys(tx.signatures).indexOf(key.address);assert.ok(index>=0);
 sign(null,tx.messageBytes,key.privateKey).copy(bytes,1+64*index);return bytes.toString('base64');
}
async function providers(app){
 const user=keypair(),sponsor=keypair(),gold=keypair().address,source=keypair().address;
 const stock=app('xstocks/assets').assets.find(s=>s.symbol==='NVDAx');
 const assets=app('xstocks/assets').assets;
 const titan=app('titan/instructions').TITAN_PROGRAM;
 const [destination]=await findAssociatedTokenPda({owner:kit.address(user.address),mint:kit.address(gold),tokenProgram:kit.address(outputProgram)});
 const [atlas]=await kit.getProgramDerivedAddress({programAddress:kit.address(titan),seeds:[Buffer.from('atlas')]});
 const key=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey.export({type:'pkcs8',format:'pem'});
 Object.assign(process.env,{SUPABASE_URL:'https://isolated.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-only',SOLANA_RPC_URL:'https://rpc.invalid',ORO_GOLD_MINT:gold,NEXT_PUBLIC_PRIVY_APP_ID:'fixture-app',PRIVY_APP_SECRET:'fixture-secret',PRIVY_AUTHORIZATION_PRIVATE_KEY:key,SWAP_PREVIEW_SECRET:'isolated-preview-secret-not-for-production',DIVIDEND_EXECUTION_ENABLED:'true'});
 let state;
 function reset(mode='good'){
  const now=Math.floor(Date.now()/1000);
  state={mode,now,eventTime:now-300,userId:'fixture:'+randomUUID(),raw:'1100000',authorized:true,finalized:false,signs:0,broadcasts:[],sql:[],delegations:0,balanceReads:0,historyReads:0,hold:null};
  state.event={eventId:'synthetic:'+randomUUID(),version:1,xstockSymbol:stock.symbol,caType:'CashDividend',status:'Initial',effectiveTimeUtc:new Date(state.eventTime*1000).toISOString(),multiplierOld:'1',multiplierNew:'1.1',createdTimeUtc:new Date((now-600)*1000).toISOString()};
  state.baseline={id:randomUUID(),user_id:state.userId,wallet_address:user.address,stock_mint:stock.mint,raw_balance:state.raw,active_multiplier:'1',decimals:8,balance_slot:100,mint_slot:101,chain_timestamp:now-600,observed_at:new Date((now-600)*1000).toISOString(),token_accounts:[{address:source,rawBaseUnits:state.raw}]};
  return state;
 }
 reset();
 function token(mint,program,amount){const bytes=Buffer.alloc(165);bytes.set(enc(mint));bytes.set(enc(user.address),32);bytes.writeBigUInt64LE(BigInt(amount),64);bytes[108]=1;return account(program,2039280,bytes);}
 const parsedMint=mint=>({owner:mint===gold?outputProgram:inputProgram,data:{parsed:{type:'mint',info:{decimals:mint===gold?6:8,isInitialized:true,extensions:mint===gold?[]:[{extension:'scaledUiAmountConfig',state:{multiplier:'1',newMultiplier:'1.1',newMultiplierEffectiveTimestamp:state.eventTime}}]}}}});
 app('xstocks/client').getIssuerData=async()=>{if(state.mode==='issuer-down')throw Error('Fixture issuer unavailable');if(state.hold)await state.hold;return {events:[state.event],warnings:[]};};
 app('privy/server').readUserWallet=async()=>({wallet:user.address,walletId:'fixture-user'});
 app('privy/delegation').getDelegation=async()=>{state.delegations++;return {configured:true,authorized:state.authorized};};
 const sponsorConfig=()=>({address:sponsor.address,walletId:'fixture-sponsor',key});
 app('privy/sponsor').sponsorConfig=sponsorConfig;
 app('privy/sponsor').verifySponsor=async()=>sponsorConfig();
 app('titan/quote').getGoldQuote=async(inputMint,outputMint,amount,wallet)=>{
  assert.equal(wallet,user.address);assert.equal(inputMint,stock.mint);assert.equal(outputMint,gold);
  if(state.mode==='quote-down')throw Error('Fixture quote unavailable');
  const data=Buffer.alloc(33);data.set([249,91,84,33,69,22,0,135]);data.writeBigUInt64LE(BigInt(amount),8);data.writeBigUInt64LE(200n,16);data.writeUInt32LE(1,29);
  const instructions=[
   {p:enc('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),a:[wallet,destination,wallet,gold,system,outputProgram].map((p,i)=>({p:enc(p),s:i===0,w:i<2})),d:Buffer.from([1])},
   {p:enc(titan),a:[wallet,atlas,inputMint,source,outputMint,destination,inputProgram,outputProgram].map((p,i)=>({p:enc(p),s:i===0,w:[0,3,5].includes(i)})),d:data},
  ];
  state.amount=amount;
  return {outAmount:'200',otherAmountThreshold:'200',rawRoute:{instructions,addressLookupTables:[]},router:'fixture',feeBps:0,slippageBps:50};
 };
 async function rpc(method,params){
  if(method==='getGenesisHash')return app('solana/rpc').MAINNET_GENESIS;
  if(method==='getTokenAccountsByOwner'){
   state.balanceReads++;
   if(state.mode==='balance-down')throw Error('Fixture balances unavailable');
   return {context:{slot:state.finalized?401:200},value:[{pubkey:source,account:{owner:inputProgram,data:{parsed:{type:'account',info:{mint:stock.mint,owner:user.address,tokenAmount:{amount:state.raw,decimals:8}}}}}}]};
  }
  if(method==='getAccountInfo')return {value:parsedMint(gold)};
  if(method==='getMultipleAccounts'&&params[1].encoding==='jsonParsed'){
   if(params[0].length===assets.length+1)return {context:{slot:state.finalized?402:201},value:[...assets.map(s=>parsedMint(s.mint)),{owner:system,data:{parsed:{type:'clock',info:{unixTimestamp:state.now}}}}]};
   return {value:params[0].map(parsedMint)};
  }
  if(method==='getMultipleAccounts'){
   state.simAccounts=params[0];
   const values={[user.address]:null,[source]:token(stock.mint,inputProgram,state.raw),[destination]:null,[sponsor.address]:account(system,10000000)};
   return {context:{slot:202},value:params[0].map(a=>{assert.ok(a in values,`Unexpected simulation account ${a}`);return values[a];})};
  }
  if(method==='getLatestBlockhash')return {value:{blockhash:system,lastValidBlockHeight:1000}};
  if(method==='getFeeForMessage')return {value:10000};
  if(method==='simulateTransaction'){
   const tx=kit.getTransactionDecoder().decode(Buffer.from(params[0],'base64'));
   assert.deepEqual(Object.keys(tx.signatures),[sponsor.address,user.address]);
   const values={[user.address]:null,[source]:token(stock.mint,inputProgram,BigInt(state.raw)-BigInt(state.amount)),[destination]:token(gold,outputProgram,200n),[sponsor.address]:account(system,10000000-10000-2039280)};
   return {context:{slot:203},value:{err:state.mode==='simulation-failed'?{InstructionError:[0,'Custom']}:null,accounts:state.simAccounts.map(a=>values[a])}};
  }
  if(method==='getTransactionsForAddress'){
   state.historyReads++;
   if(state.mode==='history-down')throw Error('Fixture history unavailable');
   if(state.mode==='history-malformed')return {data:[{slot:150}]};
   const tx={slot:300,meta:{err:null,preTokenBalances:[],postTokenBalances:[],innerInstructions:[]},transaction:{signatures:[state.signature??'fixture'],message:{accountKeys:[{pubkey:stock.mint}],instructions:[]}}};
   if(state.mode==='zero-net-transfer')return {data:[{...tx,slot:150}],paginationToken:null};
   return {data:state.finalized?[tx]:[],paginationToken:null};
  }
  if(method==='sendTransaction'){
   const signed=params[0],sig=kit.getBase58Decoder().decode(Buffer.from(signed,'base64').subarray(1,65));
   const rows=await state.executionRows();assert.equal(rows.length,1);assert.equal(rows[0].signed_transaction,signed,'Signed bytes must be durable before broadcast');
   state.signature=sig;state.signed=signed;state.broadcasts.push(signed);
   if(state.mode==='broadcast-timeout')throw Error('Fixture RPC response lost after receipt');
   return sig;
  }
  if(method==='getSignatureStatuses'){
   if(state.mode==='status-down')throw Error('Fixture status unavailable');
   return {value:[state.finalized?{err:null,confirmationStatus:'finalized'}:state.mode==='chain-failed'?{err:{InstructionError:[0,'Custom']},confirmationStatus:'finalized'}:state.mode==='confirmed-only'?{err:null,confirmationStatus:'confirmed'}:null]};
  }
  if(method==='getBlockHeight')return state.mode==='expired-blockhash'?1001:500;
  if(method==='getTransaction'){
   assert.ok(state.finalized);assert.equal(params[0],state.signature);
   const keys=kit.getCompiledTransactionMessageDecoder().decode(kit.getTransactionDecoder().decode(Buffer.from(state.signed,'base64')).messageBytes).staticAccounts;
   const balance=amount=>({accountIndex:keys.indexOf(source),mint:stock.mint,owner:user.address,uiTokenAmount:{amount,decimals:8}});
   return {slot:300,blockTime:state.now,transaction:[state.signed,'base64'],meta:{err:null,preTokenBalances:[balance(state.baseline.raw_balance)],postTokenBalances:[balance((BigInt(state.baseline.raw_balance)-BigInt(state.amount)).toString())]}};
  }
  throw Error(`Unexpected fixture RPC ${method}`);
 }
 async function privy(url,init){
  const body=JSON.parse(init.body);assert.equal(body.method,'signTransaction');assert.ok(init.headers['privy-authorization-signature']);
  const isUser=url.pathname==='/v1/wallets/fixture-user/rpc';assert.ok(isUser||url.pathname==='/v1/wallets/fixture-sponsor/rpc');
  assert.ok(init.headers['privy-idempotency-key'].endsWith(isUser?':user':':sponsor'));
  state.signs++;
  if(state.mode==='sign-timeout')throw Error('Fixture signing response lost');
  const signed=partial(body.params.transaction,isUser?user:sponsor);
  if(state.mode==='revoke-after-user-sign'&&isUser)state.authorized=false;
  return {method:'signTransaction',data:{signed_transaction:signed,encoding:'base64'}};
 }
 return {user,sponsor,stock,gold,source,reset,get state(){return state;},rpc,privy};
}
module.exports={providers};
