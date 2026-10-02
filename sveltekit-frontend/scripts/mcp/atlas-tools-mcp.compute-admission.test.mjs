#!/usr/bin/env node
// ACE-GROUNDING-FAILCLOSED-01 regression test. Importing atlas-tools-mcp.mjs must not start a
// live stdin JSON-RPC listener (guarded by the isMainModule check) -- this import itself is part
// of the proof, not just the assertions below.
import assert from 'node:assert/strict';
import {
  assessContextPacket,
  classifyOpenSpecEvidenceQuery,
  computeAdmission,
  selectContextCandidates,
} from './atlas-tools-mcp.mjs';

// Missing revision -> rejected, promptPacket must be withheld (status discriminant, not just a
// falsy field a careless caller could skip checking).
{
  const r = computeAdmission('MISSING_WORKSPACE_REVISION', 'UNKNOWN');
  assert.equal(r.status, 'REJECTED');
  assert.equal(r.admissionStatus, 'NON_CANONICAL_DIAGNOSTIC_ONLY');
  assert.ok(r.rejectionReason && r.rejectionReason.length > 0, 'rejectionReason must be a non-empty explanation');
}

// Partial revision (source revision missing) -> still rejected.
{
  const r = computeAdmission('PARTIAL_MISSING_SOURCE_REVISION', 'CURRENT_OR_UNVERIFIED');
  assert.equal(r.status, 'REJECTED');
  assert.equal(r.admissionStatus, 'NON_CANONICAL_DIAGNOSTIC_ONLY');
}

// Expired freshness (even with a fully present revision) -> rejected.
{
  const r = computeAdmission('PRESENT', 'EXPIRED');
  assert.equal(r.status, 'REJECTED');
  assert.equal(r.admissionStatus, 'NON_CANONICAL_DIAGNOSTIC_ONLY');
  assert.ok(r.rejectionReason && r.rejectionReason.includes('EXPIRED'));
}

// Eligible/current -> admitted, unchanged successful behavior, no rejection reason.
{
  const r = computeAdmission('PRESENT', 'CURRENT_OR_UNVERIFIED');
  assert.equal(r.status, 'ADMITTED');
  assert.equal(r.admissionStatus, 'ELIGIBLE_PENDING_FULL_MANIFEST_CHECK');
  assert.equal(r.rejectionReason, null);
}

// Eligible/current with unknown freshness (packet has no createdAt) -> still admitted; only
// EXPIRED specifically gates, not "unverified".
{
  const r = computeAdmission('PRESENT', 'UNKNOWN');
  assert.equal(r.status, 'ADMITTED');
}

// OpenSpec routing is deterministic and runs before any ranking. An adjacent Parent Atlas
// candidate is excluded even if its generic retrieval score is high.
{
  const query = 'OpenSpec portfolio census parser task IDs dependencies receipts orphan receipts supersession';
  const classified = classifyOpenSpecEvidenceQuery(query);
  assert.equal(classified.domain, 'OPENSPEC_EVIDENCE');
  const selection = selectContextCandidates([
    { title: 'PACKET_IDENTITY: CONFLICTING', sourceRef: 'reports/semantic-contracts/semantic-contract-reconciliation.json', domain: 'retrieval', score: 1 },
    { title: 'Task parser coverage', sourceRef: 'openspec/changes/example/tasks.md', domain: 'planning', score: 0.1 },
    { title: 'Evidence receipt schema', sourceRef: 'packages/semantic-contracts/src/openspec-evidence-fabric-v1.ts', domain: 'openspec-evidence', score: 0.8 },
  ], { query });
  assert.equal(selection.candidatesBeforeFilter, 3);
  assert.deepEqual(selection.cards.map((card) => card.title), ['Task parser coverage', 'Evidence receipt schema']);
}

// Diagnostic context can remain visible to auditors, but stale/noncanonical context is never proof.
{
  const admission = assessContextPacket({
    revisionStatus: 'PARTIAL_MISSING_SOURCE_REVISION',
    freshnessStatus: 'EXPIRED',
    admissionStatus: 'NON_CANONICAL_DIAGNOSTIC_ONLY',
    identityConflict: true,
  });
  assert.equal(admission.retrievalUsable, true);
  assert.equal(admission.proofUsable, false);
  assert.deepEqual(admission.rejectionReasons, ['EXPIRED', 'MISSING_SOURCE_REVISION', 'NON_CANONICAL', 'IDENTITY_CONFLICT']);
}

console.log('atlas-tools-mcp.compute-admission.test.mjs: all assertions passed');
