import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyStockTransaction,scanStockHistory } from '../src/lib/dividends/stock-history';
function tx(mint='other',before='10',after='10') {
 return {slot:100,meta:{err:null,preTokenBalances:[{mint,owner:'wallet',accountIndex:0,uiTokenAmount:{amount:before}}],postTokenBalances:[{mint,owner:'wallet',accountIndex:0,uiTokenAmount:{amount:after}}],innerInstructions:[]},transaction:{signatures:['sig'],message:{accountKeys:[{pubkey:'wallet'}],instructions:[]}}};
}
test('unrelated stock activity does not block; target deposits, withdrawals and zero-net transfers do',()=>{
 assert.equal(classifyStockTransaction(tx(),'target',[]),'unrelated');
 for(const [a,b] of [['10','20'],['20','10'],['10','10']])assert.equal(classifyStockTransaction(tx('target',a,b),'target',[]),'activity-detected');
});
test('known token account references and missing metadata fail closed',()=>{
 assert.equal(classifyStockTransaction(tx(),'target',['wallet']),'activity-detected');
 assert.equal(classifyStockTransaction({...tx(),meta:null},'target',[]),'incomplete');
});
test('pagination follows short pages and catches later stock activity',async()=>{
 let calls=0;
 const result=await scanStockHistory(async cursor=>{calls++;return cursor?{data:[tx('target')]}:{data:[tx()],paginationToken:'next'};},'target',[],90,110);
 assert.equal(result.status,'activity-detected');assert.equal(calls,2);
});
test('empty terminal history passes; looping pagination and out-of-range data block',async()=>{
 assert.equal((await scanStockHistory(async()=>({data:[]}),'target',[],90,110)).status,'no-activity-observed');
 assert.equal((await scanStockHistory(async()=>({data:[],paginationToken:'loop'}),'target',[],90,110)).status,'incomplete');
 assert.equal((await scanStockHistory(async()=>({data:[tx()]}),'target',[],101,110)).status,'incomplete');
});
test('rollover exemption requires exactly one matching confirmed conversion',async()=>{
 const proof={signature:'sig',slot:100};
 assert.equal((await scanStockHistory(async()=>({data:[tx('target')]}),'target',[],90,110,proof)).status,'no-activity-observed');
 for(const data of [[],[tx('target'),tx('target')],[{...tx('target'),slot:101}]])assert.equal((await scanStockHistory(async()=>({data}),'target',[],90,110,proof)).status,'incomplete');
 const deposit=tx('target','10','20');deposit.transaction.signatures=['another'];
 assert.equal((await scanStockHistory(async()=>({data:[tx('target'),deposit]}),'target',[],90,110,proof)).status,'activity-detected');
});
