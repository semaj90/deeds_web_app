import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CANONICAL_PROJECTION_PREDICATES_V1,
  summarizeCanonicalProjectionAuditPredicatesV1,
  summarizeCanonicalProjectionAdmissionV1,
} from './canonical-projection-admission-summary-v1.mjs';

const currentAudit = JSON.parse(readFileSync(new URL('../../docs/reports/atlas-canonical-projection-fabric-audit-2026-10-16.json', import.meta.url), 'utf8'));
const auditSource = readFileSync(new URL('./audit-canonical-projection-fabric.mjs', import.meta.url), 'utf8');

test('serialized admission predicate summary reports pass and below-pass counts accurately', () => {
  const predicates = Object.fromEntries(CANONICAL_PROJECTION_PREDICATES_V1.map((gateId) => [gateId, { verdict: 'PASS' }]));
  predicates.SYMBOLS_RESOLVED = { verdict: 'PARTIAL_PROVEN' };
  predicates.SEMANTIC_OWNER_PROVEN = { verdict: 'PARTIAL_PROVEN' };
  predicates.LATENT_FAMILY_PROVEN = { verdict: 'PARTIAL_PROVEN' };
  predicates.PROJECTIONS_CHECKSUM_ALIGNED = { verdict: 'NOT_PROVEN' };
  predicates.BITFROST_KEYS_DERIVABLE = { verdict: 'NOT_PROVEN' };
  predicates.ACE_EVIDENCE_GROUNDED = { verdict: 'NOT_PROVEN' };
  const summary = summarizeCanonicalProjectionAuditPredicatesV1(predicates);
  assert.equal(summary.totalPredicateCount, 11);
  assert.equal(summary.passCount, 5);
  assert.equal(summary.belowPassCount, 6);
  assert.equal(summary.verdict, 'NOT_SAFE_TO_PROJECT');
  assert.match(summary.reason, /^6\/11 predicates below PASS:/);
  assert.match(auditSource, /summarizeCanonicalProjectionAuditPredicatesV1\(report\.predicates\)/);
});

test('current Graphify audit remains blocked by each non-PASS admission predicate', () => {
  const summary = summarizeCanonicalProjectionAdmissionV1(currentAudit);
  assert.equal(Object.keys(currentAudit.predicates).length, 11);
  assert.equal(Object.values(currentAudit.predicates).filter(({ verdict }) => verdict === 'PASS').length, 4);
  assert.equal(summary.admitted, false);
  assert.equal(summary.verdict, 'NOT_SAFE_TO_PROJECT');
  assert.deepEqual(summary.blockingPredicates.map(({ gateId }) => gateId), [
    'SYMBOLS_RESOLVED',
    'SEMANTIC_OWNER_PROVEN',
    'LATENT_FAMILY_PROVEN',
    'ORDINAL_MAP_SEALED',
    'PROJECTIONS_CHECKSUM_ALIGNED',
    'BITFROST_KEYS_DERIVABLE',
    'ACE_EVIDENCE_GROUNDED',
  ]);
});

test('fabric audit guards database reads and rolls back while keeping report output repo-local', () => {
  assert.match(auditSource, /function guardReadOnly\(sql\)/);
  assert.match(auditSource, /guardReadOnly\(sql\);[\s\S]*return client\.query\(sql, params\);/);
  assert.match(auditSource, /BEGIN TRANSACTION READ ONLY/);
  assert.match(auditSource, /await client\.query\('ROLLBACK'\)/);
  assert.match(auditSource, /ATLAS_AUDIT_REPORT_DIR_MUST_BE_WITHIN_REPOSITORY/);
  assert.match(auditSource, /summarizeCanonicalProjectionAuditPredicatesV1\(report\.predicates\)/);
});

test('missing required predicates block admission even if the overall verdict says safe', () => {
  const predicates = Object.fromEntries(
    CANONICAL_PROJECTION_PREDICATES_V1.slice(1).map((gateId) => [gateId, { verdict: 'PASS' }]),
  );
  const summary = summarizeCanonicalProjectionAdmissionV1({ overall_verdict: 'SAFE_TO_PROJECT', predicates });
  assert.equal(summary.admitted, false);
  assert.ok(summary.blockingPredicates.some(({ gateId, status }) => gateId === 'IDENTITY_ALIGNED' && status === 'MISSING'));
});

test('any non-PASS predicate blocks admission even if the overall verdict says safe', () => {
  const predicates = Object.fromEntries(CANONICAL_PROJECTION_PREDICATES_V1.map((gateId) => [gateId, { verdict: 'PASS' }]));
  predicates.ORDINAL_MAP_SEALED = { verdict: 'NOT_PROVEN', note: 'snapshot mismatch' };
  const summary = summarizeCanonicalProjectionAdmissionV1({ overall_verdict: 'SAFE_TO_PROJECT', predicates });
  assert.equal(summary.admitted, false);
  assert.deepEqual(summary.blockingPredicates.map(({ gateId }) => gateId), ['ORDINAL_MAP_SEALED']);
});

test('all required predicates and the overall verdict must pass for admission', () => {
  const predicates = Object.fromEntries(CANONICAL_PROJECTION_PREDICATES_V1.map((gateId) => [gateId, { verdict: 'PASS' }]));
  assert.equal(summarizeCanonicalProjectionAdmissionV1({ overall_verdict: 'SAFE_TO_PROJECT', predicates }).admitted, true);
  assert.equal(summarizeCanonicalProjectionAdmissionV1({ overall_verdict: 'NOT_SAFE_TO_PROJECT', predicates }).admitted, false);
});

test('missing or malformed predicate collections fail closed', () => {
  for (const report of [{}, { overall_verdict: 'SAFE_TO_PROJECT', predicates: [] }]) {
    const summary = summarizeCanonicalProjectionAdmissionV1(report);
    assert.equal(summary.admitted, false);
    assert.ok(summary.blockingPredicates.length > 0);
  }
});
