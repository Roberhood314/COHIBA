import test from 'node:test';
import assert from 'node:assert/strict';
import { runReviewDemo } from '../scripts/human-signal-review-demo.mjs';

test('signed PoHA → SI reference admits one effect and denies nine adversarial attempts', () => {
  const report = runReviewDemo();
  assert.equal(report.effectCount, 1);
  assert.equal(report.cases.length, 10);
  assert.equal(report.cases.filter(x => x.verdict === 'DENY').length, 9);
  assert.equal(report.independentAudit, false);
  assert.equal(report.durableAtomicity, false);
});
