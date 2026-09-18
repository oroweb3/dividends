/* eslint-disable @typescript-eslint/no-require-imports -- Standalone database migration/test runner. */
const {Client}=require('pg');const {readFileSync}=require('node:fs');
async function main(){
 const apply=process.argv.includes('--apply');
 const u=new URL(process.env.TEST_DATABASE_URL);for(const k of ['sslmode','sslcert','sslkey','sslrootcert'])u.searchParams.delete(k);
 const c=new Client({connectionString:u.toString(),ssl:{rejectUnauthorized:true,ca:readFileSync('prod-ca-2021.crt','utf8')},connectionTimeoutMillis:12000,statement_timeout:15000});
 try{
  await c.connect();await c.query('begin');
  const exists=await c.query("select to_regclass('public.dividend_sponsor_spend') is not null as present");
  if(!exists.rows[0].present)await c.query(readFileSync('supabase/migrations/202609180006_sponsor_budget.sql','utf8'));
  await c.query('savepoint fixtures');
  await c.query(readFileSync('supabase/tests/sponsor-budget.sql','utf8'));
  await c.query('rollback to savepoint fixtures');
  await c.query(apply?'commit':'rollback');
  console.log(apply?'Sponsor budget migration applied; SQL tests passed and fixtures removed.':'Sponsor budget SQL checks passed; migration and fixtures rolled back.');
 }finally{await c.query('rollback').catch(()=>{});await c.end();}
}
main().catch(e=>{console.error('Sponsor budget checks failed; transaction rolled back. SQL code:',e.code??'connection',e.message?.startsWith('FAIL')?e.message:'');process.exitCode=1;});
