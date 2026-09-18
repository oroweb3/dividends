// Invoke from a trusted scheduler after deployment. No schedule is enabled here.
async function main(){
 const secret=process.env.DIVIDEND_JOB_SECRET,base=process.env.DIVIDEND_APP_URL||'http://127.0.0.1:3000';
 if(!secret)throw Error('Configure DIVIDEND_JOB_SECRET');
 const url=new URL('/api/jobs/dividends',base);
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))throw Error('Use HTTPS outside localhost');
 const response=await fetch(url,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(300000)});
 if(!response.ok)throw Error('Dividend job request failed');
 const result=await response.json();
 console.log(JSON.stringify({status:result.status,completed:result.completed,failed:result.failed,executionEnabled:result.enabled}));
 if(result.failed)throw Error('Some queued checks failed');
}
main().catch(()=>{console.error('Dividend job did not finish. Retry with existing claims; no secret details logged.');process.exitCode=1;});
