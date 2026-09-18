/* eslint-disable @typescript-eslint/no-require-imports -- Standalone migration utility. */
const {Client}=require('pg');const {readFileSync}=require('node:fs');
async function main(){
 const url=new URL(process.env.TEST_DATABASE_URL);for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
 const client=new Client({connectionString:url.toString(),ssl:{rejectUnauthorized:true,ca:readFileSync('prod-ca-2021.crt','utf8')},connectionTimeoutMillis:12000,statement_timeout:15000});
 try{
  await client.connect();await client.query('begin');
  const check=await client.query("select to_regclass('public.dividend_executions') is not null as present");
  if(check.rows[0].present){await client.query('rollback');console.log('Journal already exists; skipped. Verify migration version before using it.');return;}
  await client.query(readFileSync('supabase/migrations/202609180004_execution_journal.sql','utf8'));
  await client.query('commit');console.log('Execution journal migration 004 applied. No wallet access or execution switch changed.');
 }finally{await client.query('rollback').catch(()=>{});await client.end();}
}
main().catch(()=>{console.error('Migration could not be confirmed. Inspect database before retrying.');process.exitCode=1;});
