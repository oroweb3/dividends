/* eslint-disable @typescript-eslint/no-require-imports -- Operator migration runner; no signing. */
const {Client}=require('pg');const {readFileSync}=require('node:fs');
async function main(){
 const apply=process.argv.includes('--apply');
 if(process.argv.includes('--refresh-test-account'))throw Error('Retired: the one-off account refresh must not be repeated');
 if(process.env.DIVIDEND_EXECUTION_ENABLED==='true')throw Error('Keep automatic execution disabled');
 const u=new URL(process.env.TEST_DATABASE_URL);for(const k of ['sslmode','sslcert','sslkey','sslrootcert'])u.searchParams.delete(k);
 const c=new Client({connectionString:u.toString(),ssl:{rejectUnauthorized:true,ca:readFileSync('prod-ca-2021.crt','utf8')},connectionTimeoutMillis:12000,statement_timeout:15000,lock_timeout:5000});
 try{
  await c.connect();await c.query('begin');
  const exists=(await c.query("select to_regclass('public.dividend_tracking_checkpoints') is not null as present")).rows[0].present;
  if(!exists)await c.query(readFileSync('supabase/migrations/202609210009_forward_checkpoints.sql','utf8'));
  await c.query(apply?'commit':'rollback');
  console.log(JSON.stringify({migration:apply?'applied':'validated-and-rolled-back',checkpoint:null}));
 }finally{await c.query('rollback').catch(()=>{});await c.end();}
}
main().catch(e=>{console.error('Checkpoint operation rolled back:',e.code??'validation');process.exitCode=1;});
