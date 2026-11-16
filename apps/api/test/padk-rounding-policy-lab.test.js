import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  exactCompositeFraction,inspectPadkRounding,padkRoundingDecisionExamples,
} from '../src/padk-rounding-policy-lab.js';

test('hitung desimal eksak, tanpa ketidakpastian floating-point',()=>{
  assert.deepEqual(exactCompositeFraction('1.805'),{
    numerator:1805n,denominator:1000n,
  });
  assert.deepEqual(exactCompositeFraction('2.6050'),{
    numerator:26050n,denominator:10000n,
  });
  for(const value of [1.805,'1.8050000000000','5.1','0.999','abc',null,NaN])
    assert.throws(()=>exactCompositeFraction(value));
});

test('empat batas kebijakan komposit tetap UNVERIFIED dan menunjukkan perbedaan',()=>{
  for(const [raw,rankHalfUp,rankTruncated] of [
    ['1.805',2,1],['2.605',3,2],['3.405',4,3],['4.205',5,4],
  ]){
    const x=inspectPadkRounding(raw);
    assert.equal(x.methods.find(v=>v.policy==='HALF_UP_2DP').rank,rankHalfUp);
    assert.equal(x.methods.find(v=>v.policy==='TRUNCATE_2DP').rank,rankTruncated);
    assert.equal(x.sameRankAcrossPolicies,false);
    assert.equal(x.requiresPolicyDecision,true);
    assert.equal(x.approvedRegulatoryPolicy,false);
  }
});

test('ambang yang stabil tetap bukan otorisasi penggunaan resmi',()=>{
  const x=inspectPadkRounding('1.8000');
  assert.equal(x.sameRankAcrossPolicies,true);
  assert.ok(x.methods.every(v=>v.display==='1.80'&&v.rank===1));
  assert.equal(x.approvedRegulatoryPolicy,false);
  assert.equal(x.status,'ROUNDING_POLICY_REVIEW_REQUIRED');
  assert.equal(padkRoundingDecisionExamples().length,13);
});

test('half-even berbeda dari half-up pada titik tengah dengan nilai genap',()=>{
  const x=inspectPadkRounding('1.805');
  assert.equal(x.methods.find(y=>y.policy==='HALF_EVEN_2DP').display,'1.80');
  assert.equal(x.methods.find(y=>y.policy==='HALF_UP_2DP').display,'1.81');
});
