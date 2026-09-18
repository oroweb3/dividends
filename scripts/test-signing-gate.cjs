/* eslint-disable @typescript-eslint/no-require-imports -- Standalone database concurrency check. */
const {Client}=require('pg');const {readFileSync}=require('node:fs');const {randomUUID,createHash}=require('node:crypto');
function client(){const u=new URL(process.env.TEST_DATABASE_URL);for(const k of ['sslmode','sslcert','sslkey','sslrootcert'])u.searchParams.delete(k);return new Client({connectionString:u.toString(),ssl:{rejectUnauthorized:true,ca:readFileSync('prod-ca-2021.crt','utf8')},connectionTimeoutMillis:12000,statement_timeout:15000});}
async function main(){
 const admin=client(),a=client(),b=client(),user='signing-test-'+randomUUID();let tracking,claim;
 try{
  await Promise.all([admin.connect(),a.connect(),b.connect()]);
  tracking=(await admin.query("insert into public.dividend_tracking(user_id,wallet_address,stock_mint,symbol,enabled_at,baseline) values($1,$1,$1,'TEST',clock_timestamp()-interval '2 days','{}') returning id",[user])).rows[0].id;
  const evidence={blockers:[],history:{status:'no-activity-observed'},current:{rawBaseUnits:'1000000000'},event:{effectiveTimeUtc:new Date(Date.now()-86400000).toISOString(),multiplierOld:'1',multiplierNew:'1.002'}};
  const v=(await admin.query("insert into public.dividend_verifications(tracking_id,event_id,event_version,status,evidence) values($1,$2,1,'history-checked',$3) returning id",[tracking,randomUUID(),evidence])).rows[0].id;
  claim=(await admin.query('select public.reserve_dividend_claim($1,$2,$3) as id',[user,v,randomUUID()])).rows[0].id;
  await admin.query('select public.prepare_dividend_execution($1,$2,$3,$4,$5,$6)',[user,claim,createHash('sha256').update(Buffer.from([1])).digest('hex'),'AQ==',100,Date.now()+60000]);
  await a.query('begin');const first=(await a.query('select public.begin_dividend_signing($1,$2) as acquired',[user,claim])).rows[0].acquired;
  const pid=(await b.query('select pg_backend_pid() as pid')).rows[0].pid;
  const pending=b.query('select public.begin_dividend_signing($1,$2) as acquired',[user,claim]).then(r=>({ok:true,value:r.rows[0].acquired}),()=>({ok:false}));
  let blocked=false;
  for(let i=0;i<40;i++){if((await admin.query('select cardinality(pg_blocking_pids($1))>0 as blocked',[pid])).rows[0].blocked){blocked=true;break;}await new Promise(r=>setTimeout(r,50));}
  await a.query('commit');const second=await pending;
  if(!blocked||!first||!second.ok||second.value!==false)throw Error('Signing gate did not serialize');
  console.log('Two concurrent workers: one signing gate acquired, second rejected after observed lock contention.');
 }finally{
  await Promise.all([a.query('rollback').catch(()=>{}),b.query('rollback').catch(()=>{})]);
  try{
   if(claim){await admin.query('delete from public.dividend_executions where claim_id=$1',[claim]);await admin.query('delete from public.dividend_claim_reservations where id=$1',[claim]);}
   if(tracking){await admin.query('delete from public.dividend_verifications where tracking_id=$1',[tracking]);await admin.query('delete from public.dividend_tracking where id=$1',[tracking]);}
  }finally{await Promise.all([admin.end(),a.end(),b.end()]);}
 }
 console.log('Synthetic records cleaned up. No wallet signing occurred.');
}
main().catch(()=>{console.error('Signing-gate test failed. Inspect synthetic fixture cleanup before retrying.');process.exitCode=1;});
