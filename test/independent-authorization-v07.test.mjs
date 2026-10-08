import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyIndependentAuthorization,commitWithAuthorityGate} from '../lib/independent-authorization-v07.mjs';
const denied=x=>assert.equal(x.decision,'DENY');
test('missing proof fails closed',()=>denied(verifyIndependentAuthorization({})));
test('untrusted revocation fails closed',()=>denied(verifyIndependentAuthorization({revocation:{trusted:false,epoch:0,checkedAt:new Date().toISOString()}})));
test('stale revocation fails closed',()=>denied(verifyIndependentAuthorization({revocation:{trusted:true,epoch:0,checkedAt:new Date(0).toISOString()}})));
test('missing atomic adapter fails closed',async()=>denied(await commitWithAuthorityGate({})));
test('invalid atomic adapter fails closed',async()=>denied(await commitWithAuthorityGate({}, {atomicCommit:async fn=>fn({})})));
