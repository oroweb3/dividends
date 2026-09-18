import {createHash,createPublicKey,verify} from 'node:crypto';
import {getBase58Decoder,getBase58Encoder,getTransactionDecoder,getTransactionEncoder} from '@solana/kit';
function bytes(value:string){
 const decoded=Buffer.from(value,'base64');
 if(decoded.length>1232||decoded.length<=65||decoded.toString('base64')!==value)throw Error('Invalid transaction encoding');
 return decoded;
}
export function transactionSigners(unsigned:string,wallet:string){
 const raw=bytes(unsigned),tx=getTransactionDecoder().decode(raw),signers=Object.keys(tx.signatures);
 if(![1,2].includes(signers.length)||raw[0]!==signers.length||!signers.includes(wallet)||signers.length===2&&signers[0]===wallet)throw Error('Unexpected transaction signer');
 if(raw.subarray(1,1+64*signers.length).some(b=>b!==0)||!Buffer.from(getTransactionEncoder().encode(tx)).equals(raw))throw Error('Noncanonical unsigned transaction');
 return signers;
}
function checked(unsigned:string,signed:string,wallet:string,hash:string,required?:string){
 const before=bytes(unsigned),after=bytes(signed),signers=transactionSigners(unsigned,wallet),offset=1+64*signers.length;
 if(createHash('sha256').update(before).digest('hex')!==hash)throw Error('Unsigned transaction hash mismatch');
 if(after[0]!==before[0]||!before.subarray(offset).equals(after.subarray(offset)))throw Error('Signed transaction message changed');
 if(required&&!signers.includes(required))throw Error('Unexpected transaction signer');
 for(const [i,signer] of signers.entries()){
  const signature=after.subarray(1+64*i,65+64*i);
  if(required&&signer!==required&&!signature.some(b=>b!==0))continue;
  const publicKey=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(getBase58Encoder().encode(signer))]),format:'der',type:'spki'});
  if(!verify(null,after.subarray(offset),publicKey,signature))throw Error('Invalid wallet signature');
 }
 return {after,signers};
}
/** Verify and combine independent Privy signTransaction responses over identical bytes. */
export function combineSponsoredSignatures(unsigned:string,userSigned:string,sponsorSigned:string,wallet:string,sponsor:string,hash:string){
 const a=checked(unsigned,userSigned,wallet,hash,wallet),b=checked(unsigned,sponsorSigned,wallet,hash,sponsor);
 if(a.signers.length!==2||a.signers[0]!==sponsor)throw Error('Unexpected sponsor');
 const out=Buffer.from(bytes(unsigned));
 for(const [i,key] of a.signers.entries())(key===wallet?a.after:b.after).copy(out,1+i*64,1+i*64,65+i*64);
 return verifySignedTransaction(unsigned,out.toString('base64'),wallet,hash).signedTransaction;
}
export function verifyPartialSignature(unsigned:string,signed:string,wallet:string,hash:string,signer:string){checked(unsigned,signed,wallet,hash,signer);}
export function verifySignedTransaction(unsigned:string,signed:string,wallet:string,expectedHash:string){
 const {after}=checked(unsigned,signed,wallet,expectedHash);
 return {signedTransaction:signed,signature:getBase58Decoder().decode(after.subarray(1,65))};
}
