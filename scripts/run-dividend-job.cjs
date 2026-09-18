// Invoke from a trusted scheduler after deployment. No schedule is enabled here.
async function main(){
 const secret=process.env.DIVIDEND_JOB_SECRET,base=process.env.DIVIDEND_APP_URL||'http://127.0.0.1:3000';
 if(!secret)throw Error('Configure DIVIDEND_JOB_SECRET');
 const url=new URL('/api/jobs/dividends',base);
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))throw Error('Use HTTPS outside localhost');
 let cursor;
 for(let page=0;page<1000;page++){
  const response=await fetch(url,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:JSON.stringify(cursor?{cursor}:{}),signal:AbortSignal.timeout(300000)});
  if(!response.ok)throw Error('Dividend job request failed');
  const result=await response.json();
  console.log(`Processed ${result.results.length} tracking records (${result.enabled?'execution enabled':'monitoring only'}).`);
  if(!result.nextCursor)return;
  if(result.nextCursor===cursor)throw Error('Job cursor did not advance');cursor=result.nextCursor;
 }
 throw Error('Job page limit reached');
}
main().catch(()=>{console.error('Dividend job did not finish. Retry with existing claims; no secret details logged.');process.exitCode=1;});
