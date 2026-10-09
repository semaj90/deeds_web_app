import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectTaskEvidenceChainV1 as inspect} from './atlas-task-evidence-chain-crosswalk-v1.mjs';
const base={registry:{registry_checksum:'registry',proposal_checksum:'proposal'},
 approval:{registry_checksum:'registry',proposal_checksum:'proposal',decision:'APPROVED',trustReceiptVerified:true},
 sidecar:{sourceDigest:'src',loadedDigest:'src',runtimeReadbackVerified:true},
 relation:{kind:'RELATION',exactSpanVerified:true,participantRolesVerified:true,sourceRevision:'s1',relationEvidenceRef:'e1'},
 fact:{admissionReceiptVerified:true,canonicalReadbackVerified:true,relationEvidenceRef:'e1',canonicalFactId:'fact1'},
 context:{manifestReadbackVerified:true,containsAdmittedFact:true,canonicalFactId:'fact1',manifestChecksum:'manifest'},
 summary:{contextManifestChecksumVerified:true,contextManifestChecksum:'manifest',modelReceiptVerified:true}};
const gate=(r,n)=>r.checks.find(x=>x.gate===n).status;
test('current unapproved and mismatched sidecar scenario blocks',()=>{
 const r=inspect({registry:base.registry,sidecar:{sourceDigest:'src',loadedDigest:'old'},
 relation:{kind:'CONCEPT',exactSpanVerified:true}});
 assert.equal(gate(r,'ORF_REVIEW_BINDING'),'BLOCKED');
 assert.equal(gate(r,'TYPED_RELATION'),'BLOCKED');
 assert.equal(gate(r,'MANIFEST_BOUND_SYNTHESIS'),'BLOCKED');
});
test('concept mention does not become typed relation',()=>{
 const r=inspect({...base,relation:{...base.relation,kind:'CONCEPT'}});
 assert.equal(gate(r,'TYPED_RELATION'),'BLOCKED');
 assert.equal(gate(r,'KAG_ADMISSION_READBACK'),'BLOCKED');
});
test('unbound source evidence cannot pass KAG readback',()=>{
 const r=inspect({...base,fact:{...base.fact,relationEvidenceRef:'different'}});
 assert.equal(gate(r,'KAG_ADMISSION_READBACK'),'BLOCKED');
});
test('diagnostic summary cannot pass without manifest receipt',()=>{
 const r=inspect({...base,context:{...base.context,manifestReadbackVerified:false}});
 assert.equal(gate(r,'MANIFEST_BOUND_SYNTHESIS'),'BLOCKED');
});
test('synthetic matched claims never authorize promotion',()=>{
 const r=inspect(base);assert.equal(r.allClaimsMatched,true);
 assert.equal(r.runtimeAdmissionAuthorized,false);assert.equal(r.authority,'DIAGNOSTIC_ONLY');
});
