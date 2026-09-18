/** Claim just in time so slow jobs do not strand a prefetched batch. */
export async function drainQueue<T>(options:{concurrency:number;maxItems:number;startUntil:number},ports:{now:()=>number;claim:()=>Promise<T|null>;process:(item:T)=>Promise<boolean>;finish:(item:T,success:boolean)=>Promise<void>}){
 let claimed=0,completed=0,failed=0;
 const workers=await Promise.allSettled(Array.from({length:options.concurrency},async()=>{
  while(claimed<options.maxItems&&ports.now()<options.startUntil){
   claimed++; // Reserve a batch slot before awaiting a competing claim.
   const item=await ports.claim();if(item===null)return;
   let success=false;
   try{success=await ports.process(item);}catch{success=false;}
   await ports.finish(item,success);
   completed++;if(!success)failed++;
  }
 }));
 if(workers.some(w=>w.status==='rejected'))throw Error('Queue infrastructure unavailable');
 return {completed,failed};
}
