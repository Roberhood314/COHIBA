import test from "node:test";
import assert from "node:assert/strict";
import {appendCoreEvent,verifyEventChain,merkleRoot,coreStateRoot,registerCoreApp,recordAppUtility} from "../lib/human-signal-core.mjs";

test("core event chain is append-only and tamper evident",()=>{
  const s={events:[]};
  appendCoreEvent(s,{type:"PROFILE_VERIFIED",actor:"HUMAN-A",subject:"HUMAN-A",data:{tier:"HUMAN_VERIFIED"}},new Date("2026-10-02T00:00:00Z"));
  appendCoreEvent(s,{type:"DAILY_SIGNAL",actor:"HUMAN-A",subject:"HUMAN-A"},new Date("2026-10-02T01:00:00Z"));
  assert.equal(verifyEventChain(s.events).valid,true);
  s.events[0].data.tier="TAMPERED";
  assert.equal(verifyEventChain(s.events).valid,false);
});

test("merkle root is deterministic",()=>{
  const a="a".repeat(64),b="b".repeat(64);
  assert.equal(merkleRoot([a,b]),merkleRoot([a,b]));
  assert.notEqual(merkleRoot([a,b]),merkleRoot([b,a]));
});

test("state root changes with network state",()=>{
  const a=coreStateRoot({profiles:[],contributions:[],apps:[],events:[]}).stateRoot;
  const b=coreStateRoot({profiles:[{id:"HUMAN-AAAAAAAAAAAA"}],contributions:[],apps:[],events:[]}).stateRoot;
  assert.notEqual(a,b);
});

test("developer app registry and utility actions dedupe",()=>{
  const s={apps:[],appUtility:[]};
  const app=registerCoreApp(s,{name:"Human Market",description:"A useful marketplace application for verified humans.",developerProfileId:"HUMAN-AAAAAAAAAAAA",homepage:"https://example.com"});
  const x=recordAppUtility(s,{appId:app.id,profileId:"HUMAN-BBBBBBBBBBBB",action:"ITEM_CREATED",proofRef:"proof-1"});
  const y=recordAppUtility(s,{appId:app.id,profileId:"HUMAN-BBBBBBBBBBBB",action:"ITEM_CREATED",proofRef:"proof-1"});
  assert.equal(x.duplicate,false); assert.equal(y.duplicate,true); assert.equal(app.utilityActions,1);
});

test('every literal server audit event is accepted by the core',async()=>{
  const {readFile}=await import('node:fs/promises');
  const source=await readFile(new URL('../web-server.mjs',import.meta.url),'utf8');
  const types=[...new Set([...source.matchAll(/emitHsc\("([A-Z_]+)"/g)].map(match=>match[1]))];
  assert.ok(types.length>10);
  const store={events:[]};
  for(const type of types) assert.doesNotThrow(()=>appendCoreEvent(store,{type,actor:'TEST',subject:'TEST'}),type);
  assert.equal(verifyEventChain(store.events).valid,true);
});
