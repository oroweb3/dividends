/* eslint-disable @typescript-eslint/no-require-imports -- Standalone database test runner. */
const {Client}=require('pg');const {readFileSync}=require('node:fs');
async function main(){
 const u=new URL(process.env.TEST_DATABASE_URL);for(const k of ['sslmode','sslcert','sslkey','sslrootcert'])u.searchParams.delete(k);
 const c=new Client({connectionString:u.toString(),ssl:{rejectUnauthorized:true,ca:readFileSync('prod-ca-2021.crt','utf8')},connectionTimeoutMillis:12000,statement_timeout:15000});
 try{
  await c.connect();await c.query('begin');
  const exists=await c.query("select to_regclass('public.dividend_executions') is not null as present");
  if(!exists.rows[0].present)await c.query(readFileSync('supabase/migrations/202609180004_execution_journal.sql','utf8'));
  const test=readFileSync('supabase/tests/execution-journal.sql','utf8').replace(/^begin;$/m,'').replace(/^rollback;$/m,'');
  await c.query(test);await c.query('rollback');console.log('Execution journal SQL checks passed; all migration/test changes rolled back.');
 }finally{await c.query('rollback').catch(()=>{});await c.end();}
}
main().catch(()=>{console.error('Execution journal checks failed; transaction rolled back.');process.exitCode=1;});
