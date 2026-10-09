import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePairingReadinessV1 } from './prove-gemma4-browser-paired-eval-preflight-v1.mjs';
const base = { schema:'atlas.gemma4-browser-paired-eval-fixtures.v1', cases:[{id:'one',task:'abstention',prompt:'No evidence. Abstain.',expect:{abstain:true}}] };
test('valid fixture cannot claim model/runtime parity',()=>{
 const r=evaluatePairingReadinessV1(base);
 assert.equal(r.comparable,false);
 assert.equal(r.runtimePromotionEligible,false);
 assert.equal(r.engines['litertlm-web'].status,'NOT_PROVEN');
});
test('duplicate fixture ID rejected',()=>assert.throws(()=>evaluatePairingReadinessV1({...base,cases:[...base.cases,...base.cases]}),/UNIQUE_CASE_ID_REQUIRED/));
test('empty prompt rejected',()=>assert.throws(()=>evaluatePairingReadinessV1({...base,cases:[{...base.cases[0],prompt:''}]}),/BOUNDED_PROMPT_REQUIRED/));
test('unexpected task rejected',()=>assert.throws(()=>evaluatePairingReadinessV1({...base,cases:[{...base.cases[0],task:'automatic_approval'}]}),/TASK_INVALID/));
test('missing expected output rejected',()=>assert.throws(()=>evaluatePairingReadinessV1({...base,cases:[{...base.cases[0],expect:null}]}),/EXPECTED_OUTPUT_REQUIRED/));
