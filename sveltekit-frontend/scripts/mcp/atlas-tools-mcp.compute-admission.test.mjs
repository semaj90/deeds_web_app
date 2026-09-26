#!/usr/bin/env node
// ACE-GROUNDING-FAILCLOSED-01 regression test. Importing atlas-tools-mcp.mjs must not start a
// live stdin JSON-RPC listener (guarded by the isMainModule check) -- this import itself is part
// of the proof, not just the assertions below.
import assert from 'node:assert/strict';
import { computeAdmission } from './atlas-tools-mcp.mjs';

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

console.log('atlas-tools-mcp.compute-admission.test.mjs: all assertions passed');
