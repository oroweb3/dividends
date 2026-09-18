/* eslint-disable @typescript-eslint/no-require-imports -- Database concurrency probe. */
const {Client}=require('pg');const {readFileSync}=require('node:fs');const {randomUUID}=require('node:crypto');
function client(){const u=new URL(process.env.TEST_DATABASE_URL);for(const k of ['sslmode','sslcert','sslkey','sslrootcert'])u.searchParams.delete(k);return new Client({connectionString:u.toString(),ssl:{rejectUnauthorized:true,ca:readFileSync('prod-ca-2021.crt','utf8')},connectionTimeoutMillis:12000,statement_timeout:5000});}
async function main(){
 const admin=client(),a=client(),b=client(),run=randomUUID(),ids=[];let acquired=false,cursor;
 try{
  await Promise.all([admin.connect(),a.connect(),b.connect()]);
  const lease=(await admin.query('select public.acquire_dividend_job($1) as lease',[run])).rows[0].lease;
  if(!lease)throw Error('Existing cron active; retry after completion');acquired=true;cursor=lease.cursor;
  for(let i=0;i<2;i++){
   const unique='queue-concurrency-'+randomUUID();
   const id=(await admin.query("insert into public.dividend_tracking(user_id,wallet_address,stock_mint,symbol,baseline) values($1,$1,$1,'TEST','{}') returning id",[unique])).rows[0].id;ids.push(id);
   await admin.query("update public.dividend_check_queue set next_check_at=$2 where tracking_id=$1",[id,new Date(i*1000)]);
  }
  await a.query('begin');
  const first=(await a.query('select public.claim_dividend_check($1) as item',[run])).rows[0].item;
  // The first queue row remains locked; the second connection must skip it.
  const second=(await b.query('select public.claim_dividend_check($1) as item',[run])).rows[0].item;
  if(first.tracking_id!==ids[0]||second.tracking_id!==ids[1])throw Error('Queue did not skip the locked row');
  await a.query('commit');
  console.log('Independent database workers claimed distinct accounts while the first row remained locked.');
 }finally{
  await Promise.all([a.query('rollback').catch(()=>{}),b.query('rollback').catch(()=>{})]);
  try{
   for(const id of ids)await admin.query('delete from public.dividend_tracking where id=$1',[id]);
   if(acquired)await admin.query("select public.finish_dividend_job($1,$2,'completed')",[run,cursor]);
  }finally{await Promise.all([admin.end(),a.end(),b.end()]);}
 }
 console.log('Synthetic queue records removed. No signing or wallet actions.');
}
main().catch(()=>{console.error('Queue concurrency check did not complete. No secret details logged.');process.exitCode=1;});
