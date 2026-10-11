import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHumanSignalMcpTool, bindMcpExactEffectAuthority, buildMcpToolProposal } from '../integrations/mcp/human-signal-mcp-adapter.mjs';
const now = new Date('2026-10-11T12:00:00Z');
function harness(overrides = {}) {
  let call, writes = 0;
  const seen = new Set();
  const args = { id: '1', data: { value: 'approved' } };
  const envelope = bindMcpExactEffectAuthority({version:'1.0-alpha', epoch:0, rootId:'human-root', subject:'operator', actions:['MCP_TOOL:write'], effects:['WRITE'], budget:1, expiresAt:'2026-10-11T12:05:00Z', nonce:'once'}, buildMcpToolProposal({toolName:'write',subject:'operator',resource:'records/1',arguments:args,effects:['WRITE']}));
  registerHumanSignalMcpTool({server:{registerTool(_n,_c,fn){call=fn;}},name:'write',config:{},effects:['WRITE'],subject:'operator',resourceFor:a=>'records/'+a.id,getAuthorityEnvelope:()=>envelope,getAuthorityState:async()=>({epoch:0,spent:0,revoked:false}),commitAuthority:async({envelope:e})=>{if(seen.has(e.nonce))return false;seen.add(e.nonce);return true;},handler:a=>{writes++;return a;},now:()=>now,...overrides});
  return {call,args,envelope,writes:()=>writes};
}
test('async destination state denies revoked authority',async()=>{
 const h=harness({getAuthorityState:async()=>({revoked:true})});
 const r=await h.call(h.args,{});assert.equal(r.structuredContent.humanSignal.reason,'REVOKED');assert.equal(h.writes(),0);
});
test('async state outage fails closed',async()=>{
 const h=harness({getAuthorityState:async()=>{throw Error('offline');}});
 assert.equal((await h.call(h.args,{})).isError,true);assert.equal(h.writes(),0);
});
test('revocation between evaluations blocks the handler',async()=>{
 let reads=0;const h=harness({getAuthorityState:async()=>({revoked:++reads===2})});
 assert.equal((await h.call(h.args,{})).structuredContent.humanSignal.reason,'REVOKED');assert.equal(h.writes(),0);
});
test('caller mutation during await cannot change executed bytes',async()=>{
 let resume;const wait=new Promise(r=>{resume=r;});
 const h=harness({getAuthorityState:async()=>{await wait;return {epoch:0};}});
 const pending=h.call(h.args,{});h.args.data.value='attacker';resume();
 const result=await pending;assert.equal(result.data.value,'approved');assert.equal(h.writes(),1);assert.equal(Object.isFrozen(result.data),true);
});
test('authority mutation while state is pending cannot widen the snapshot',async()=>{
 let resume;const wait=new Promise(r=>{resume=r;});
 const h=harness({getAuthorityState:async()=>{await wait;return {epoch:0};}});
 const pending=h.call(h.args,{});await Promise.resolve();h.envelope.actions.push('ADMIN');resume();
 assert.equal((await pending).data.value,'approved');assert.equal(h.writes(),1);
});
test('concurrent replay reaches handler once with atomic destination admission',async()=>{
 const h=harness();const results=await Promise.all([h.call(h.args,{}),h.call(h.args,{})]);
 assert.equal(h.writes(),1);assert.equal(results.filter(r=>r.isError).length,1);
});
test('lossy JSON values fail before authority or effect',async()=>{
 const h=harness();for(const value of [NaN,Infinity,undefined,()=>{},new Date()])assert.equal((await h.call({id:'1',data:{value}},{})).isError,true);
 assert.equal(h.writes(),0);
});
test('expiry during asynchronous storage read blocks execution',async()=>{
 let clock=now;
 const h=harness({now:()=>clock,getAuthorityState:async()=>{clock=new Date('2026-10-11T12:06:00Z');return {epoch:0};}});
 assert.equal((await h.call(h.args,{})).structuredContent.humanSignal.reason,'EXPIRED');assert.equal(h.writes(),0);
});
