import test from 'node:test';
import assert from 'node:assert/strict';
import {assessWorkstationGoalGatesV1 as assess} from './atlas-workstation-goal-gates-v1.mjs';
test('diagnostic Ornith summary cannot imply ContextManifest synthesis',()=>{
 const x=assess({summary:{sourceSpanVerified:true}});assert.equal(x.diagnosticSummaryNotAdmission,true);
 assert.equal(x.gates.CONTEXT_BACKED_SUMMARY,'BLOCKED_PENDING_AUTHORIZED_RUNTIME_VERIFICATION');
});
test('unapproved ORF proposal always blocks review gate',()=>{
 assert.equal(assess({registry:{reviewState:'PROPOSAL_ONLY_REQUIRES_REVIEW',artifactChecksum:'a'.repeat(64)}}).gates.ORF_REGISTRY_REVIEW,'BLOCKED');
});
test('sidecar digest mismatch blocks typed relation and KAG',()=>{
 const x=assess({sidecar:{sourceDigest:'a',loadedDigest:'b'},relation:{kind:'RELATION',spanVerified:true,participantRolesVerified:true,sourceRevisionVerified:true}});
 assert.equal(x.gates.TYPED_RELATION_GROUNDING,'BLOCKED');assert.equal(x.gates.KAG_FACT_READBACK,'BLOCKED');
});
test('verified concept mention never becomes typed relation',()=>{
 const x=assess({sidecar:{sourceDigest:'a',loadedDigest:'a'},relation:{kind:'CONCEPT',spanVerified:true,participantRolesVerified:true,sourceRevisionVerified:true}});
 assert.equal(x.gates.TYPED_RELATION_GROUNDING,'BLOCKED');
});
test('readback cannot be inferred from source span',()=>{
 const x=assess({sidecar:{sourceDigest:'a',loadedDigest:'a'},relation:{kind:'RELATION',spanVerified:true,participantRolesVerified:true,sourceRevisionVerified:true}});
 assert.equal(x.gates.KAG_FACT_READBACK,'BLOCKED');assert.equal(x.gates.CONTEXT_MANIFEST,'BLOCKED');
});
test('even all supplied claims cannot authorize production promotion',()=>{
 const x=assess({registry:{reviewState:'APPROVED',trustedVerifierResult:'VERIFIED',artifactChecksum:'a'.repeat(64),reviewedChecksum:'a'.repeat(64)},sidecar:{sourceDigest:'a',loadedDigest:'a'},relation:{kind:'RELATION',spanVerified:true,participantRolesVerified:true,sourceRevisionVerified:true},fact:{admissionReceiptVerified:true,canonicalReadbackVerified:true},context:{manifestChecksumVerified:true,evidenceRevisionBindingsVerified:true}});
 assert.equal(x.runtimePromotionAuthorized,false);assert.equal(x.gates.CONTEXT_BACKED_SUMMARY,'BLOCKED_PENDING_AUTHORIZED_RUNTIME_VERIFICATION');
});
