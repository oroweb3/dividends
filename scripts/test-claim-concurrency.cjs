/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS database test runner. */
const {Client}=require('pg');
const {randomUUID}=require('node:crypto');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
require('@next/env').loadEnvConfig(root);
function client(){const u=new URL(process.env.TEST_DATABASE_URL);for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])u.searchParams.delete(key);return new Client({connectionString:u.toString(),ssl:{rejectUnauthorized:true,ca:readFileSync(path.join(root,'prod-ca-2021.crt'),'utf8')},connectionTimeoutMillis:12000,statement_timeout:15000});}
const admin=client(), a=client(), b=client();
const user='concurrency-test-'+randomUUID();
let tracking;
async function scenario(sameRequest){
 const event=randomUUID();
 const evidence={blockers:[],history:{status:'no-activity-observed'},current:{rawBaseUnits:'1000000000'},event:{effectiveTimeUtc:new Date(Date.now()-86400000).toISOString(),multiplierOld:'1',multiplierNew:'1.002'}};
 const result=await admin.query("insert into public.dividend_verifications(tracking_id,event_id,event_version,status,evidence) values($1,$2,1,'history-checked',$3) returning id",[tracking,event,evidence]);
 const verification=result.rows[0].id, request=randomUUID();
 const sql='select public.reserve_dividend_claim($1,$2,$3) as id';
 await a.query('begin');
 const first=await a.query(sql,[user,verification,request]);
 const pid=(await b.query('select pg_backend_pid() as pid')).rows[0].pid;
 const pending=b.query(sql,[user,verification,sameRequest?request:randomUUID()]).then(r=>({ok:true,id:r.rows[0].id}),e=>({ok:false,code:e.code}));
 let blocked=false;
 for(let i=0;i<40;i++){
  const r=await admin.query('select cardinality(pg_blocking_pids($1))>0 as blocked',[pid]);
  if(r.rows[0].blocked){blocked=true;break;}
  await new Promise(resolve=>setTimeout(resolve,50));
 }
 await a.query('commit');
 const second=await pending;
 if(!blocked)throw new Error('Concurrent lock contention was not observed');
 if(sameRequest?(!second.ok||second.id!==first.rows[0].id):(second.ok||second.code!=='23505'))throw new Error('Unexpected duplicate reservation behavior');
 const count=await admin.query('select count(*)::int as count,min(raw_amount)::text as amount from public.dividend_claim_reservations where verification_id=$1',[verification]);
 if(count.rows[0].count!==1||count.rows[0].amount!=='1996007')throw new Error('Reservation count or amount mismatch');
 console.log(sameRequest?'PASS: concurrent same-request retry returned the same claim':'PASS: competing request rejected; exactly one claim');
}
(async()=>{let failed=false;try{
 await Promise.all([admin.connect(),a.connect(),b.connect()]);
 const t=await admin.query("insert into public.dividend_tracking(user_id,wallet_address,stock_mint,symbol,enabled_at,baseline) values($1,$2,$3,'TEST',clock_timestamp()-interval '2 days','{}') returning id",[user,'synthetic-'+randomUUID(),'synthetic-'+randomUUID()]);tracking=t.rows[0].id;
 await scenario(true);await scenario(false);
}catch(e){failed=true;console.log('FAIL:',e.code||'test assertion or connection failure');}
finally{
 await a.query('rollback').catch(()=>{});await b.query('rollback').catch(()=>{});
 if(tracking){try{
 await admin.query('begin');
 await admin.query('delete from public.dividend_claim_reservations where user_id=$1',[user]);
 await admin.query('delete from public.dividend_verifications where tracking_id=$1',[tracking]);
 await admin.query('delete from public.dividend_tracking where id=$1 and user_id=$2',[tracking,user]);
 await admin.query('commit');console.log('CLEANUP: synthetic fixtures removed');
 }catch{failed=true;console.log('CLEANUP FAILED: inspect synthetic fixture user',user);await admin.query('rollback').catch(()=>{});}}
 await Promise.all([admin.end(),a.end(),b.end()].map(p=>p.catch(()=>{})));if(failed)process.exitCode=1;
}})();
