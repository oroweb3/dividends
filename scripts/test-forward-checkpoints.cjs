/* eslint-disable @typescript-eslint/no-require-imports -- Isolated SQL verification runner. */
const {Client}=require('pg');
const {readFileSync,readdirSync}=require('node:fs');
const {randomUUID}=require('node:crypto');
async function main(){
 const u=new URL(process.env.TEST_DATABASE_URL);for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])u.searchParams.delete(key);
 const client=new Client({connectionString:u.toString(),ssl:{rejectUnauthorized:true,ca:readFileSync('prod-ca-2021.crt','utf8')},connectionTimeoutMillis:12000,statement_timeout:20000});
 const schema='checkpoint_test_'+randomUUID().replaceAll('-','');
 const isolate=sql=>sql.replaceAll('public.',schema+'.').replaceAll('search_path=public',`search_path=${schema}`).replaceAll('search_path = public',`search_path = ${schema}`);
 try{
  await client.connect();await client.query('begin');await client.query(`create schema ${schema}`);
  for(const file of readdirSync('supabase/migrations').sort().filter(f=>f.endsWith('.sql')&&!f.includes('0001_balance'))){
   await client.query(isolate(readFileSync('supabase/migrations/'+file,'utf8')));
  }
  await client.query(`set local search_path=${schema},pg_temp`);
  await client.query(readFileSync('supabase/tests/forward-checkpoints.sql','utf8'));
  await client.query(isolate(readFileSync('supabase/tests/baseline-rollover.sql','utf8')));
  await client.query('rollback');
  console.log('Isolated checkpoint and reservation/execution/rollover SQL tests passed. Schema, migrations and fixtures rolled back; production tables untouched.');
 }finally{await client.query('rollback').catch(()=>{});await client.end();}
}
main().catch(e=>{console.error('Isolated checkpoint test failed:',e.code??'connection',e.message?.startsWith('FAIL')?e.message:'');process.exitCode=1;});
