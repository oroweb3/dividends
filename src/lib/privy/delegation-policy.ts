import { z } from 'zod';
import { TITAN_PROGRAM, ATA_PROGRAM, COMPUTE_PROGRAM } from '../titan/instructions';
const condition=z.object({field_source:z.literal('solana_program_instruction'),field:z.literal('programId'),operator:z.literal('in'),value:z.array(z.string()).length(3)}).strict();
const rule=z.object({id:z.string().optional(),name:z.string(),method:z.literal('signTransaction'),action:z.literal('ALLOW'),conditions:z.array(condition).length(1)}).strict();
export function assertDelegationPolicy(value:unknown,policyId:string){
 const p=z.object({id:z.literal(policyId),version:z.literal('1.0'),chain_type:z.literal('solana'),rules:z.array(rule).length(1)}).parse(value);
 const programs=p.rules[0].conditions[0].value;
 if(new Set(programs).size!==3||![TITAN_PROGRAM,ATA_PROGRAM,COMPUTE_PROGRAM].every(k=>programs.includes(k)))throw new Error('Unexpected signing policy');
}
export function inspectDelegation(value:unknown,walletId:string,wallet:string,signerId:string,policyId:string){
 const data=z.object({id:z.literal(walletId),address:z.literal(wallet),chain_type:z.literal('solana'),additional_signers:z.array(z.object({signer_id:z.string(),override_policy_ids:z.array(z.string()).optional()}))}).parse(value);
 const own=data.additional_signers.filter(s=>s.signer_id===signerId);
 const authorized=own.length===1&&own[0].override_policy_ids?.length===1&&own[0].override_policy_ids[0]===policyId;
 return {authorized:!!authorized,hasSigners:data.additional_signers.length>0,canAuthorize:data.additional_signers.length===0};
}
