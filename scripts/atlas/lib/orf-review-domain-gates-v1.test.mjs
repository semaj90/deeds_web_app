import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectOrfReviewBindingV1} from './orf-review-receipt-gate-v1.mjs';
import {reviewDomainLabelV1} from './domain-normalization-review-v1.mjs';
const registry={registry_revision:'r1',registry_checksum:'a'.repeat(64)};
test('no approval receipt blocks',()=>assert.equal(inspectOrfReviewBindingV1({registry}).runtimeEligible,false));
test('unverified claimed approval blocks',()=>assert.equal(inspectOrfReviewBindingV1({registry,receipt:{registry_revision:'r1',registry_checksum:registry.registry_checksum,decision:'APPROVED'}}).status,'BLOCKED'));
test('even supplied fixture trust binding cannot promote',()=>{
const receipt={registry_revision:'r1',registry_checksum:registry.registry_checksum,decision:'APPROVED',reviewer_id:'reviewer',receipt_checksum:'b'.repeat(64)};
const trustResult={verified:true,registryChecksum:registry.registry_checksum,reviewerId:'reviewer',receiptChecksum:receipt.receipt_checksum,authorizedFor:'ORF_REGISTRY',revoked:false};
assert.equal(inspectOrfReviewBindingV1({registry,receipt,trustResult}).runtimeEligible,false);
});
test('ui to frontend stays proposed',()=>{const x=reviewDomainLabelV1({label:'ui',domains:['ui'],ontologyGroups:['frontend'],aliases:[{from:'ui',to:'frontend',reviewed:true}]});assert.equal(x.state,'ALIAS_PROPOSED');assert.equal(x.admitted,false)});
test('unknown label abstains',()=>assert.equal(reviewDomainLabelV1({label:'unexpected',domains:['ui']}).state,'UNKNOWN'));
