import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildCanonicalGateReceiptV2, classifyProcessResult, combineProcessAndPredicateResult, GATE_CATEGORIES, verifyCanonicalGateEvidenceV2, verifyCanonicalGateReceiptV2 } from './canonical-gate-core.mjs';

const createReceipt = (checks) => {
  const byCategory = new Map(checks.map((check) => [check.category, check]));
  const completeChecks = GATE_CATEGORIES.map((category) => {
    const check = byCategory.get(category);
    return check
      ? { ...check, required: check.required ?? true, reasons: check.reasons ?? [], evidence: check.evidence ?? [] }
      : { id: category.toLowerCase(), category, required: false, verdict: 'PASS', reasons: [], evidence: [] };
  });
  return buildCanonicalGateReceiptV2({
    runId: '2026-10-27T00-00-00.000Z-01a1763a-4355-71d7-9b81-2c7a1814a41f',
    createdAtUtc: '2026-10-27T00:00:00.000Z',
    workspaceRevision: `sha256:${'a'.repeat(64)}`,
    snapshotRevision: `sha256:${'b'.repeat(64)}`,
    graphifyExecutionId: '01a1763a-4355-71d7-9b81-2c7a1814a41f',
    checks: completeChecks,
  });
};

test('does not confuse a complete execution with canonical promotion', () => {
  const receipt = createReceipt([{ id: 'execution', category: 'EXECUTION_AUTHORITY', required: true, verdict: 'BLOCKED', reasons: ['CANONICAL_AUTHORITY_FALSE'] }]);
  assert.equal(receipt.executionStatus, 'NOT_VERIFIED');
  assert.equal(receipt.promotionStatus, 'NOT_PROMOTED');
  assert.equal(receipt.overall, 'BLOCKED');
  assert.equal(receipt.canonicalAuthority, false);
});

test('blocks stale, empty, and partial mandatory evidence', () => {
  for (const verdict of ['PARTIAL', 'UNKNOWN', 'SKIPPED']) {
    assert.equal(createReceipt([{ id: 'snapshot', category: 'SOURCE_SNAPSHOT', required: true, verdict }]).overall, 'BLOCKED');
  }
});

test('reports the first failed mandatory predicate but ignores optional gaps', () => {
  const receipt = createReceipt([
    { id: 'optional-export', category: 'GRAPH_COVERAGE', required: false, verdict: 'PARTIAL', reasons: ['EXCLUDED_NODES'] },
    { id: 'registry', category: 'PACKET_IDENTITY', required: true, verdict: 'BLOCKED', reasons: ['DDL_ABSENT'] },
  ]);
  assert.equal(receipt.overall, 'BLOCKED');
  assert.equal(receipt.firstFailedMandatoryPredicate.id, 'registry');
});

test('checksum verification detects stale or modified receipt content', () => {
  const receipt = createReceipt([{ id: 'snapshot', category: 'SOURCE_SNAPSHOT', required: true, verdict: 'PASS' }]);
  assert.equal(verifyCanonicalGateReceiptV2(receipt), true);
  assert.equal(verifyCanonicalGateReceiptV2({ ...receipt, workspaceRevision: 'stale-revision' }), false);
  assert.equal(verifyCanonicalGateReceiptV2({ ...receipt, canonicalAuthority: true }), false);
});

test('receipt verification requires every category and rejects unsafe evidence paths', () => {
  const receipt = createReceipt([{ id: 'snapshot', category: 'SOURCE_SNAPSHOT', required: true, verdict: 'PASS', reasons: [], evidence: [] }]);
  assert.equal(verifyCanonicalGateReceiptV2(receipt), true);
  const missingCategory = { ...receipt, checks: receipt.checks.slice(1) };
  assert.equal(verifyCanonicalGateReceiptV2(missingCategory), false);
  const unsafeEvidence = structuredClone(receipt);
  unsafeEvidence.checks[0].evidence = [{ path: '../outside.json', sha256: `sha256:${'c'.repeat(64)}` }];
  assert.equal(verifyCanonicalGateReceiptV2(unsafeEvidence), false);
  const invalidDigest = structuredClone(receipt);
  invalidDigest.checks[0].evidence = [{ path: '.tmp/receipt.json', sha256: 'sha256:bad' }];
  assert.equal(verifyCanonicalGateReceiptV2(invalidDigest), false);
});

test('evidence verification rereads artifacts and rejects stale receipts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-canonical-gate-'));
  try {
    const evidencePath = path.join(root, 'snapshot.json');
    fs.writeFileSync(evidencePath, '{"snapshot":"fixture"}');
    const relativePath = 'snapshot.json';
    const evidenceSha256 = `sha256:${crypto.createHash('sha256').update(fs.readFileSync(evidencePath)).digest('hex')}`;
    const createdAtUtc = new Date().toISOString();
    const checks = GATE_CATEGORIES.map((category) => ({
      id: category.toLowerCase(),
      category,
      required: category === 'SOURCE_SNAPSHOT',
      verdict: 'PASS',
      reasons: [],
      evidence: category === 'SOURCE_SNAPSHOT' ? [{ path: relativePath, sha256: evidenceSha256 }] : [],
    }));
    const receipt = buildCanonicalGateReceiptV2({
      runId: `${createdAtUtc.replaceAll(':', '-')}-01a1763a-4355-71d7-9b81-2c7a1814a41f`,
      createdAtUtc,
      checks,
    });
    const nowMs = Date.now();
    assert.deepEqual(verifyCanonicalGateEvidenceV2(receipt, { root, nowMs }), { valid: true, reasons: [] });
    assert.ok(verifyCanonicalGateEvidenceV2(receipt, { root, nowMs: nowMs + 2 * 24 * 60 * 60 * 1000 }).reasons.includes('RECEIPT_STALE_OR_FUTURE_DATED'));
    fs.writeFileSync(evidencePath, '{"snapshot":"changed"}');
    assert.ok(verifyCanonicalGateEvidenceV2(receipt, { root, nowMs }).reasons.includes('EVIDENCE_DIGEST_MISMATCH:snapshot.json'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('classifies process truncation, malformed output, timeout, and conflicting authority as failures', () => {
  assert.equal(classifyProcessResult({ status: 0, parsed: null }).verdict, 'FAIL');
  assert.equal(classifyProcessResult({ status: 0, parsed: {}, timedOut: true }).verdict, 'TIMEOUT');
  assert.equal(classifyProcessResult({ status: 1, parsed: {} }).verdict, 'FAIL');
  const receipt = createReceipt([{ id: 'authority-conflict', category: 'EXECUTION_AUTHORITY', required: true, verdict: 'FAIL', reasons: ['MULTIPLE_CANONICAL_OWNERS'] }]);
  assert.equal(receipt.overall, 'FAIL');
});

test('preserves validator rejection reasons when a diagnostic validator exits nonzero', () => {
  const result = combineProcessAndPredicateResult(
    classifyProcessResult({ status: 1, parsed: { verdict: 'FAIL' } }),
    { verdict: 'FAIL', reasons: ['GRAPH_CONTRACT:FAIL', 'COVERAGE_THRESHOLDS_MISSING'] },
  );
  assert.equal(result.verdict, 'FAIL');
  assert.deepEqual(result.reasons, ['NONZERO_EXIT:1', 'GRAPH_CONTRACT:FAIL', 'COVERAGE_THRESHOLDS_MISSING']);
  assert.equal(combineProcessAndPredicateResult({ verdict: 'PASS', reasons: [] }, { verdict: 'PASS', reasons: [] }).verdict, 'PASS');
});

test('a repository coverage census is a known category and a PARTIAL census never yields an overall PASS', () => {
  assert.ok(GATE_CATEGORIES.includes('REPOSITORY_COVERAGE'));
  const receipt = buildCanonicalGateReceiptV2({
    runId: 'repository-coverage-partial',
    createdAtUtc: '2026-10-27T00:00:00.000Z',
    checks: [
      { id: 'repository-coverage', category: 'REPOSITORY_COVERAGE', required: true, verdict: 'PARTIAL', reasons: ['COVERAGE_BLOCKER:REGISTRY_DDL_NOT_APPLIED'] },
    ],
  });
  assert.notEqual(receipt.overall, 'PASS');
});
