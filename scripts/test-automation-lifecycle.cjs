/* eslint-disable @typescript-eslint/no-require-imports -- Standalone integration harness. */
const assert=require('node:assert/strict');
const {resolve}=require('node:path');
const {randomUUID}=require('node:crypto');
const Module=require('node:module');
const {database}=require('./integration/database.cjs');
const {providers}=require('./integration/providers.cjs');

// Compiled server modules run without Next's bundler; no production exports or
// flags are changed. Network access is denied except this fixture DB connection.
const originalLoad=Module._load;
Module._load=function(id,parent,isMain){
 if(id==='server-only')return {};
 if(id.startsWith('@/'))id=resolve('.test-build/integration',id.slice(2));
 return originalLoad.call(this,id,parent,isMain);
};
const app=id=>require(resolve('.test-build/integration/lib',id+'.js'));
let db;
async function main(){
 const databaseUrl=process.env.TEST_DATABASE_URL;
 assert.ok(databaseUrl,'TEST_DATABASE_URL is required; never substitute the application REST endpoint');
 // Keep only the DB connection supplied to this harness; provider credentials
 // cannot be inherited by accidentally adding a new integration later.
 for(const key of Object.keys(process.env))if(/PRIVY|SUPABASE|SOLANA|TITAN|JUPITER|TOKENS_XYZ|SWAP_PREVIEW|ORO_GOLD|DIVIDEND_EXECUTION/.test(key))delete process.env[key];
 const f=await providers(app);
 global.fetch=async(input,init={})=>{
  const url=new URL(String(input));let result;
  if(url.origin==='https://isolated.invalid'&&url.pathname.startsWith('/rest/v1/')){
   const path=url.pathname.slice('/rest/v1/'.length)+url.search;
   f.state.sql.push(path.split('?')[0]);
   if(path==='rpc/record_dividend_signature'&&f.state.mode==='journal-down')return new Response(null,{status:503});
   try{result=await db.request(path,init);}catch(error){f.state.databaseErrors??=[];f.state.databaseErrors.push({code:error.code,message:error.message});throw error;}
   if(path==='rpc/begin_sponsored_dividend_signing'&&result&&f.state.mode==='revoke-after-gate')f.state.authorized=false;
   if(path==='rpc/prepare_dividend_execution'&&f.state.mode==='holdings-changed')f.state.raw='1200000';
   // PostgREST returns JSON numeric values, unlike pg's int8 text parser.
   return new Response(JSON.stringify(result,(key,value)=>['quote_expires_at','last_valid_block_height'].includes(key)?Number(value):value),{headers:{'Content-Type':'application/json'}});
  }
  if(url.origin==='https://rpc.invalid'){
   const {method,params}=JSON.parse(init.body);result=await f.rpc(method,params);
   return Response.json({jsonrpc:'2.0',id:1,result});
  }
  if(url.origin==='https://api.privy.io')return Response.json(await f.privy(url,init));
  throw Error(`Integration blocked unexpected network host: ${url.hostname}`);
 };
 db=await database(databaseUrl);
 const rows=async table=>(await db.q(`select * from ${db.schema}.${table}`)).rows;
 const run=()=>app('jobs/scheduled').runScheduledTracking();
 const due=()=>db.q(`update ${db.schema}.dividend_check_queue set next_check_at=clock_timestamp()-interval '1 second'`);
 async function seed(mode='good'){
  // Explicit isolated schema, never public tables. A fresh enrollment per case.
  await db.q(`truncate ${db.schema}.dividend_tracking cascade`);
  await db.q(`update ${db.schema}.dividend_job_state set run_id=null,lease_until=null,last_status='idle'`);
  const s=f.reset(mode);s.executionRows=()=>rows('dividend_executions');
  const result=await db.q(`insert into ${db.schema}.dividend_tracking(user_id,wallet_address,stock_mint,symbol,enabled_at,baseline) values($1,$2,$3,$4,$5,$6) returning id`,[s.userId,f.user.address,f.stock.mint,f.stock.symbol,s.baseline.observed_at,s.baseline]);
  s.trackingId=result.rows[0].id;return s;
 }
 async function submitted(mode='good'){
  const s=await seed(mode),result=await run();
  assert.equal(result.failed,0,JSON.stringify(s.databaseErrors??[]));
  assert.equal((await rows('dividend_executions'))[0]?.status,mode==='broadcast-timeout'?'signed':'submitted',JSON.stringify(s.databaseErrors??[]));
  assert.equal(s.signs,2);assert.equal(s.broadcasts.length,1);
  assert.equal((await rows('dividend_claim_reservations'))[0].raw_amount,'100000');
  return s;
 }
 let count=0;
 async function check(name,fn){await fn();console.log(`PASS ${++count}: ${name}`);}
 await check('scheduled worker signs once, finalizes, rolls checkpoint forward, and excludes the consumed event',async()=>{
  const s=await submitted();s.finalized=true;s.raw='1000000';await due();assert.equal((await run()).failed,0);
  const claim=(await rows('dividend_claim_reservations'))[0],tracking=(await rows('dividend_tracking'))[0];
  assert.equal(claim.status,'confirmed');assert.equal(claim.rollover_status,'complete');
  assert.equal(tracking.baseline.raw_balance,'1000000');assert.equal(tracking.baseline.active_multiplier,'1.1');
  assert.deepEqual(tracking.initial_baseline,s.baseline);assert.equal(tracking.enabled_at.toISOString(),s.baseline.observed_at);
  await due();await run();assert.equal((await rows('dividend_claim_reservations')).length,1);assert.equal(s.signs,2);assert.equal(s.broadcasts.length,1);
 });
 await check('execution off monitors without reservation or signing and unchanged observations are not rewritten',async()=>{
  const s=await seed();process.env.DIVIDEND_EXECUTION_ENABLED='false';
  try{await run();const first=(await rows('dividend_monitor_state'))[0];await due();await run();const second=(await rows('dividend_monitor_state'))[0];assert.equal(first.changed_at.toISOString(),second.changed_at.toISOString());assert.equal((await rows('dividend_verifications')).length,0);assert.equal((await rows('dividend_claim_reservations')).length,0);assert.equal(s.signs,0);}finally{process.env.DIVIDEND_EXECUTION_ENABLED='true';}
 });
 for(const mode of ['issuer-down','balance-down','history-down','history-malformed','zero-net-transfer','quote-down','simulation-failed'])await check(`${mode} cannot reach signing`,async()=>{
  const s=await seed(mode);await run();assert.equal(s.signs,0);assert.equal(s.broadcasts.length,0);assert.equal((await rows('dividend_claim_reservations')).length,0);
 });
 await check('late enrollment never converts an earlier dividend',async()=>{
  const s=await seed();await db.q(`update ${db.schema}.dividend_tracking set enabled_at=clock_timestamp()`);await run();assert.equal(s.signs,0);assert.equal((await rows('dividend_claim_reservations')).length,0);
 });
 for(const mode of ['revoke-before','revoke-after-gate','revoke-after-user-sign','holdings-changed','sign-timeout','journal-down'])await check(`${mode} stops before broadcast; uncertain attempts remain blocked on retry`,async()=>{
  const s=await seed(mode);if(mode==='revoke-before')s.authorized=false;
  await run();assert.equal(s.broadcasts.length,0);const signs=s.signs;
  assert.equal(signs,mode==='journal-down'?2:['sign-timeout','revoke-after-user-sign'].includes(mode)?1:0);
  s.mode='good';s.authorized=true;
  // Revocation before reserving creates no uncertain attempt; reauthorization
  // legitimately permits a new conversion. Other cases keep the consumed gate.
  if(mode!=='revoke-before'){await due();await run();assert.equal(s.signs,signs);assert.equal(s.broadcasts.length,0);}
 });
 await check('lost broadcast response reconciles finalized transaction without another signature',async()=>{
  const s=await submitted('broadcast-timeout');s.mode='good';s.finalized=true;s.raw='1000000';s.authorized=false;
  await due();await run();assert.equal(s.signs,2);assert.equal(s.broadcasts.length,1);assert.equal((await rows('dividend_claim_reservations'))[0].rollover_status,'complete');
 });
 await check('unseen transaction rebroadcasts only identical durable bytes',async()=>{
  const s=await submitted();await due();await run();assert.equal(s.signs,2);assert.equal(s.broadcasts.length,2);assert.equal(s.broadcasts[0],s.broadcasts[1]);
 });
 for(const mode of ['status-down','confirmed-only','expired-blockhash','chain-failed','revoked'])await check(`${mode} never signs or blindly rebroadcasts`,async()=>{
  const s=await submitted();s.mode=mode;if(mode==='revoked')s.authorized=false;await due();await run();assert.equal(s.signs,2);assert.equal(s.broadcasts.length,1);
  assert.equal((await rows('dividend_executions'))[0].status,['expired-blockhash','chain-failed'].includes(mode)?'review-required':'submitted');
 });
 await check('overlapping scheduled workers acquire only one global lease',async()=>{
  const s=await seed();let release;s.hold=new Promise(r=>{release=r;});
  const first=run();
  try{
   // Wait for the real committed lease, with a bounded deadline.
   const deadline=Date.now()+5000;
   while(!(await rows('dividend_job_state'))[0].run_id){assert.ok(Date.now()<deadline);await new Promise(r=>setTimeout(r,10));}
   assert.equal((await run()).status,'already-running');
  }finally{release();}
  assert.equal((await first).failed,0);assert.equal(s.signs,2);assert.equal((await rows('dividend_sponsor_spend')).length,1);
 });
 await check('concurrent signing gates across database connections consume sponsorship once',async()=>{
  const s=await seed('holdings-changed');await run();
  const [claim]=await rows('dividend_claim_reservations');assert.ok(claim);
  const args={p_user_id:s.userId,p_claim_id:claim.id,p_sponsor:f.sponsor.address,p_cost:2049280};
  const results=await Promise.all([db.rpc('begin_sponsored_dividend_signing',args),db.rpc('begin_sponsored_dividend_signing',args)]);
  assert.deepEqual(results.sort(),[false,true]);assert.equal((await rows('dividend_sponsor_spend')).length,1);assert.equal(s.signs,0);
 });
 await check('simultaneous conversion requests with different request IDs cannot sell the same dividend twice',async()=>{
  const s=await seed(),preview=await app('swaps/preview').createGoldPreview(s.userId,f.user.address,f.stock);
  const results=await Promise.allSettled(Array.from({length:2},()=>app('swaps/convert').convertDividend(s.userId,f.user.address,'fixture-user',f.stock,randomUUID(),preview.token)));
  assert.ok(results.some(r=>r.status==='fulfilled'));
  assert.equal((await rows('dividend_claim_reservations')).length,1);assert.equal((await rows('dividend_executions')).length,1);
  assert.equal(s.signs,2);assert.equal(s.broadcasts.length,1);assert.equal((await rows('dividend_sponsor_spend')).length,1);
 });
 for(const first of ['reset','reserve'])await check(`checkpoint/reservation race: ${first} wins, competing stale operation is rejected`,async()=>{
  const s=await seed();
  const verified=await app('dividends/inspect').inspectDividend(s.userId,f.user.address,f.stock);assert.equal(verified.historyVerified,true);
  const fresh={...s.baseline,id:randomUUID(),balance_slot:200,mint_slot:201,chain_timestamp:s.now,observed_at:new Date(Date.now()-1000).toISOString(),active_multiplier:'1.1'};
  const operations={reset:['restart_dividend_checkpoint',{p_user_id:s.userId,p_tracking_id:s.trackingId,p_expected_baseline_id:s.baseline.id,p_baseline:fresh}],reserve:['reserve_dividend_claim',{p_user_id:s.userId,p_verification_id:verified.verificationId,p_request_id:randomUUID()}]};
  const a=await db.pool.connect(),b=await db.pool.connect();let contender;
  try{
   await a.query('begin');await b.query('begin');
   const pidA=(await a.query('select pg_backend_pid() as pid')).rows[0].pid,pidB=(await b.query('select pg_backend_pid() as pid')).rows[0].pid;
   await db.rpc(...operations[first],a);
   contender=db.rpc(...operations[first==='reset'?'reserve':'reset'],b).then(value=>({value}),error=>({error}));
   // Prove real lock contention, not just two sequential calls.
   const deadline=Date.now()+5000;
   while(!(await db.q('select $1::integer=any(pg_blocking_pids($2::integer)) as blocked',[pidA,pidB])).rows[0].blocked){assert.ok(Date.now()<deadline,'Competing transaction did not block on checkpoint lock');await new Promise(r=>setTimeout(r,10));}
   await a.query('commit');const result=await contender;
   assert.ok(result.error);assert.match(result.error.message,first==='reset'?/Verification checkpoint changed/:/Resolve existing conversion/);
   await b.query('rollback');
   assert.equal((await rows('dividend_claim_reservations')).length,first==='reserve'?1:0);
   assert.equal((await rows('dividend_tracking'))[0].baseline.id,first==='reset'?fresh.id:s.baseline.id);
  }finally{await a.query('rollback');await b.query('rollback');a.release();b.release();}
 });
 await check('expired quote prevents rebroadcast even while blockhash is still valid',async()=>{
  const s=await submitted();await db.q(`update ${db.schema}.dividend_executions set quote_expires_at=$1`,[Date.now()-1000]);
  await due();await run();assert.equal(s.signs,2);assert.equal(s.broadcasts.length,1);assert.equal((await rows('dividend_executions'))[0].status,'review-required');
 });
 await check('finalized conversion waits for complete rollover history, then recovers without another sale',async()=>{
  const s=await submitted();s.finalized=true;s.raw='1000000';s.mode='history-down';await due();await run();
  const claim=(await rows('dividend_claim_reservations'))[0];assert.equal(claim.status,'confirmed');assert.equal(claim.rollover_status,'pending');
  assert.equal((await rows('dividend_tracking'))[0].baseline.id,s.baseline.id);
  s.mode='good';await due();await run();assert.equal((await rows('dividend_claim_reservations'))[0].rollover_status,'complete');assert.equal(s.signs,2);assert.equal(s.broadcasts.length,1);
 });
 console.log(`All ${count} connected automation scenarios passed. Providers were fixtures; no live wallet or chain transactions were used.`);
}
main().catch(error=>{
 // Fixture assertions are safe; avoid logging connection errors/URLs or stacks
 // that could contain a supplied database credential.
 console.error('Automation integration failed:',error.code??error.name,error.name==='AssertionError'?error.message:'See the failing stage; provider and connection details are intentionally suppressed.');
 process.exitCode=1;
}).finally(async()=>{
 if(db){try{await db.close();console.log('Disposable lifecycle schema removed.');}catch{console.error('Disposable schema cleanup failed:',db.schema);process.exitCode=1;}}
});
