/** Shared orchestration for authenticated requests and a future scheduler.
 * Retries look up a durable request before doing eligibility work or signing. */
export async function conversionFlow<P,R>(ports:{
 existing:()=>Promise<R|null>;
 prepare:()=>Promise<P>;
 reserve:(prepared:P)=>Promise<string>;
 persist:(prepared:P,claimId:string)=>Promise<void>;
 execute:(prepared:P,claimId:string)=>Promise<R>;
}){
 const existing=await ports.existing();if(existing!==null)return existing;
 const prepared=await ports.prepare();
 const claimId=await ports.reserve(prepared);
 await ports.persist(prepared,claimId);
 return ports.execute(prepared,claimId);
}
