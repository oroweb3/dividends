/* eslint-disable @typescript-eslint/no-require-imports -- Standalone integration harness. */
const {Pool}=require('pg');
const {readFileSync,readdirSync}=require('node:fs');
const {randomUUID}=require('node:crypto');
const assert=require('node:assert/strict');

// This adapter replaces PostgREST transport only. All tables, constraints,
// triggers, SQL functions and locks come from the application migrations.
async function database(connectionString){
 const url=new URL(connectionString);
 for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
 const pool=new Pool({connectionString:url.toString(),ssl:{rejectUnauthorized:true,ca:readFileSync('prod-ca-2021.crt','utf8')},max:4,connectionTimeoutMillis:12000,statement_timeout:20000});
 const schema='lifecycle_test_'+randomUUID().replaceAll('-','');
 assert.match(schema,/^lifecycle_test_[a-f0-9]{32}$/);
 const q=(sql,values=[])=>pool.query(sql,values);
 const isolate=sql=>sql.replaceAll('public.',schema+'.').replaceAll('search_path=public',`search_path=${schema}`).replaceAll('search_path = public',`search_path = ${schema}`)
  // Isolated tests must not contend with the production sponsor-budget lock.
  .replaceAll('1886351475,1936748398','1886351475,1936748399');
 const setup=await pool.connect();
 try{
  await setup.query('begin');await setup.query(`create schema ${schema}`);
  for(const file of readdirSync('supabase/migrations').sort().filter(f=>f.endsWith('.sql')&&!f.includes('0001_balance')))
   await setup.query(isolate(readFileSync('supabase/migrations/'+file,'utf8')));
  await setup.query('commit');
 }catch(error){await setup.query('rollback');setup.release();await pool.end();throw error;}
 setup.release();
 const ident=value=>{assert.match(value,/^[a-z_][a-z0-9_]*$/);return `"${value}"`;};
 const tables=new Set((await q('select table_name from information_schema.tables where table_schema=$1',[schema])).rows.map(r=>r.table_name));
 const functions=new Set((await q('select routine_name from information_schema.routines where routine_schema=$1',[schema])).rows.map(r=>r.routine_name));
 async function rpc(name,args,client=pool){
  assert.ok(functions.has(name),`Unknown isolated RPC ${name}`);
  const keys=Object.keys(args);
  const result=await client.query(`select ${schema}.${ident(name)}(${keys.map((k,i)=>`${ident(k)} => $${i+1}`).join(',')}) as result`,Object.values(args));
  return result.rows[0].result;
 }
 async function request(path,init={}){
  const url=new URL(path,'https://isolated.invalid/');
  if(url.pathname.startsWith('/rpc/')){assert.equal(init.method,'POST');return rpc(url.pathname.slice(5),JSON.parse(init.body));}
  const table=url.pathname.slice(1);assert.ok(tables.has(table),`Unknown isolated table ${table}`);
  if(init.method==='POST'){
   assert.equal(table,'dividend_verifications');assert.equal(url.searchParams.get('on_conflict'),'tracking_id,event_id');
   const body=JSON.parse(init.body),keys=Object.keys(body);
   return (await q(`insert into ${schema}.${ident(table)} (${keys.map(ident).join(',')}) values (${keys.map((_,i)=>'$'+(i+1)).join(',')}) on conflict(tracking_id,event_id) do update set ${keys.filter(k=>!['tracking_id','event_id'].includes(k)).map(k=>`${ident(k)}=excluded.${ident(k)}`).join(',')} returning *`,Object.values(body))).rows;
  }
  assert.ok(!init.method||init.method==='GET');
  const values=[],where=[];
  for(const [key,value] of url.searchParams){
   if(['select','limit','order'].includes(key))continue;
   if(key==='or'){assert.equal(value,'(status.neq.confirmed,rollover_status.eq.pending)');where.push("(status<>'confirmed' or rollover_status='pending')");continue;}
   assert.ok(value.startsWith('eq.'));values.push(value.slice(3));where.push(`${ident(key)}=$${values.length}`);
  }
  const select=url.searchParams.get('select')??'*';
  const columns=select==='*'?'*':select.split(',').map(ident).join(',');
  let sql=`select ${columns} from ${schema}.${ident(table)}${where.length?' where '+where.join(' and '):''}`;
  if(url.searchParams.has('order')){const [column,dir]=url.searchParams.get('order').split('.');assert.ok(['asc','desc'].includes(dir));sql+=` order by ${ident(column)} ${dir}`;}
  if(url.searchParams.has('limit')){const limit=url.searchParams.get('limit');assert.match(limit,/^\d+$/);sql+=` limit ${limit}`;}
  return (await q(sql,values)).rows;
 }
 return {schema,pool,q,rpc,request,async close(){try{await q(`drop schema ${schema} cascade`);}finally{await pool.end();}}};
}
module.exports={database};
