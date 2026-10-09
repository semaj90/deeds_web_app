import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectOrfRegistryApprovalBoundary } from './orf-registry-approval-boundary-v1.mjs';

test('missing proposal and approval fail closed', () => {
  const result = inspectOrfRegistryApprovalBoundary();
  assert.equal(result.runtimeEligible, false);
  assert.equal(result.status, 'BLOCKED_REVIEW_REQUIRED');
  assert.ok(result.reasons.includes('APPROVAL_RECEIPT_ABSENT'));
});
test('proposal alone never loads at runtime', () => {
  const r = inspectOrfRegistryApprovalBoundary({
    proposal: { registry_revision:'draft', registry_checksum:'a'.repeat(64), definitions:[] },
  });
  assert.equal(r.runtimeEligible, false);
  assert.ok(r.reasons.includes('FIVE_DEFINITION_REVIEW_MISSING'));
});
test('revision mismatch is rejected', () => {
  const defs=Array.from({length:5},(_,i)=>({
    feature_id:'ast.kind_'+i,evidence_requirements:['byte-span'],
    missing_value_policy:'UNAVAILABLE'
  }));
  const r=inspectOrfRegistryApprovalBoundary({
    proposal:{registry_revision:'r1',registry_checksum:'a'.repeat(64),definitions:defs},
    approval:{reviewer_id:'reviewer',approval_id:'review-1',approved_registry_revision:'r2',
      approved_registry_checksum:'a'.repeat(64),enum_mapping_decision:'REVIEWED'}
  });
  assert.ok(r.reasons.includes('APPROVAL_REVISION_MISMATCH'));
  assert.equal(r.runtimeEligible,false);
});
test('complete-looking receipt still cannot self-approve', () => {
  const defs=Array.from({length:5},(_,i)=>({
    feature_id:'ast.kind_'+i,evidence_requirements:['byte-span'],
    missing_value_policy:'UNAVAILABLE'
  }));
  const r=inspectOrfRegistryApprovalBoundary({
    proposal:{registry_revision:'r1',registry_checksum:'a'.repeat(64),definitions:defs},
    approval:{reviewer_id:'reviewer',approval_id:'review-1',approved_registry_revision:'r1',
      approved_registry_checksum:'a'.repeat(64),enum_mapping_decision:'REVIEWED'}
  });
  assert.equal(r.status,'REVIEW_RECEIPT_PRESENT_UNVERIFIED');
  assert.equal(r.runtimeEligible,false);
  assert.equal(r.writesPerformed,false);
});
