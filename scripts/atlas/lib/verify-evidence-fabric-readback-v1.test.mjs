import test from 'node:test';import assert from 'node:assert/strict';
import {verifyEvidenceFabricJoinV1 as verify} from './verify-evidence-fabric-readback-v1.mjs';
const base={receipt:{evidenceId:'e1',changeId:'ch',taskId:'t1',workspaceRevision:'w1',sourceRevision:'s1',checksum:'hash',verdict:'PASS',exitCode:0,verifier:'trusted-owner',readback:{hash:'hash'},taskRevision:2},
binding:{evidenceId:'e1',changeId:'ch',taskId:'t1',predicate:'p1'},
predicate:{predicateId:'p1',changeId:'ch',taskId:'t1',workspaceRevision:'w1',sourceRevision:'s1',checksum:'p-hash'},
task:{changeId:'ch',taskId:'t1',workspaceRevision:'w1',currentRevision:2},
assertions:[{evidenceId:'e1',passed:true}]};
test('coherent fixture is not a trusted admission',()=>{const x=verify(base);assert.equal(x.status,'CONSISTENT_RECORD_CLAIMS');assert.equal(x.admissionAuthorized,false)});
test('predicate mismatch blocks',()=>assert(verify({...base,binding:{...base.binding,predicate:'wrong'}}).errors.includes('PREDICATE_ID_MISMATCH')));
test('stale task revision blocks',()=>assert(verify({...base,receipt:{...base.receipt,taskRevision:1}}).errors.includes('TASK_REVISION_MISMATCH')));
test('source revision mismatch blocks',()=>assert(verify({...base,predicate:{...base.predicate,sourceRevision:'old'}}).errors.includes('SOURCE_REVISION_MISMATCH')));
test('failed assertion blocks',()=>assert(verify({...base,assertions:[{evidenceId:'e1',passed:false}]}).errors.includes('ASSERTION_FAILURE')));
test('missing receipt readback blocks',()=>assert(verify({...base,receipt:{...base.receipt,readback:{}}}).errors.includes('VERIFIER_OR_READBACK_MISSING')));
