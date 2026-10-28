import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const GATE_CATEGORIES = Object.freeze([
  'SERVICE_HEALTH',
  'SOURCE_SNAPSHOT',
  'PACKET_IDENTITY',
  'GRAPH_INTEGRITY',
  'GRAPH_COVERAGE',
  'REPOSITORY_COVERAGE',
  'EXECUTION_AUTHORITY',
  'ONTOLOGY_SCHEMA',
  'PROJECTION_ADMISSION',
]);

export function buildCanonicalGateReceiptV2({ runId, createdAtUtc, workspaceRevision = null, snapshotRevision = null, graphifyExecutionId = null, checks }) {
  if (!Array.isArray(checks) || checks.some((check) => !GATE_CATEGORIES.includes(check.category))) {
    throw new TypeError('CANONICAL_GATE_CHECK_CATEGORY_INVALID');
  }
  const firstFailed = checks.find((check) => check.required && check.verdict !== 'PASS') ?? null;
  const hasFailure = checks.some((check) => check.required && check.verdict === 'FAIL');
  const incomplete = checks.some((check) => check.required && ['UNKNOWN', 'SKIPPED', 'TIMEOUT'].includes(check.verdict));
  const overall = hasFailure ? 'FAIL' : firstFailed || incomplete ? 'BLOCKED' : checks.some((check) => check.verdict === 'PARTIAL') ? 'PARTIAL' : 'PASS';
  const receipt = {
    schema: 'atlas.canonical-gate-receipt.v2',
    runId,
    createdAtUtc,
    workspaceRevision,
    snapshotRevision,
    graphifyExecutionId,
    checks,
    firstFailedMandatoryPredicate: firstFailed ? { id: firstFailed.id, category: firstFailed.category, verdict: firstFailed.verdict, reasons: firstFailed.reasons ?? [] } : null,
    overall,
    executionStatus: checks.find((check) => check.category === 'EXECUTION_AUTHORITY')?.executionStatus ?? 'NOT_VERIFIED',
    promotionStatus: checks.find((check) => check.category === 'EXECUTION_AUTHORITY')?.promotionStatus ?? 'NOT_PROMOTED',
    canonicalAuthority: false,
    writesPerformed: false,
  };
  const digest = crypto.createHash('sha256').update(JSON.stringify(receipt)).digest('hex');
  return { ...receipt, receiptSha256: `sha256:${digest}` };
}

export function verifyCanonicalGateReceiptV2(receipt) {
  if (!receipt || receipt.schema !== 'atlas.canonical-gate-receipt.v2' || receipt.canonicalAuthority !== false || receipt.writesPerformed !== false) return false;
  if (typeof receipt.runId !== 'string' || !/^\d{4}-\d{2}-\d{2}T.+Z-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receipt.runId)) return false;
  if (!Number.isFinite(Date.parse(receipt.createdAtUtc))) return false;
  const digestPattern = /^sha256:[0-9a-f]{64}$/i;
  if (receipt.workspaceRevision !== null && !digestPattern.test(receipt.workspaceRevision)) return false;
  if (receipt.snapshotRevision !== null && !digestPattern.test(receipt.snapshotRevision)) return false;
  if (receipt.graphifyExecutionId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receipt.graphifyExecutionId)) return false;
  if (!Array.isArray(receipt.checks) || receipt.checks.length !== GATE_CATEGORIES.length) return false;
  const ids = new Set();
  const categories = new Set();
  for (const check of receipt.checks) {
    if (!check || typeof check.id !== 'string' || !check.id || ids.has(check.id)
      || !GATE_CATEGORIES.includes(check.category) || categories.has(check.category)
      || typeof check.required !== 'boolean'
      || !['PASS', 'PARTIAL', 'BLOCKED', 'FAIL', 'UNKNOWN', 'SKIPPED', 'TIMEOUT'].includes(check.verdict)
      || !Array.isArray(check.reasons) || check.reasons.some((reason) => typeof reason !== 'string')
      || !Array.isArray(check.evidence)) return false;
    ids.add(check.id);
    categories.add(check.category);
    for (const artifact of check.evidence) {
      if (!artifact || typeof artifact.path !== 'string' || !artifact.path || pathIsUnsafe(artifact.path)
        || !digestPattern.test(artifact.sha256 ?? '')) return false;
    }
  }
  if (categories.size !== GATE_CATEGORIES.length) return false;
  const firstFailed = receipt.checks.find((check) => check.required && check.verdict !== 'PASS') ?? null;
  const expectedFirst = firstFailed ? { id: firstFailed.id, category: firstFailed.category, verdict: firstFailed.verdict, reasons: firstFailed.reasons } : null;
  if (JSON.stringify(receipt.firstFailedMandatoryPredicate) !== JSON.stringify(expectedFirst)) return false;
  const hasFailure = receipt.checks.some((check) => check.required && check.verdict === 'FAIL');
  const incomplete = receipt.checks.some((check) => check.required && ['UNKNOWN', 'SKIPPED', 'TIMEOUT'].includes(check.verdict));
  const expectedOverall = hasFailure ? 'FAIL' : firstFailed || incomplete ? 'BLOCKED' : receipt.checks.some((check) => check.verdict === 'PARTIAL') ? 'PARTIAL' : 'PASS';
  if (receipt.overall !== expectedOverall) return false;
  const { receiptSha256, ...body } = receipt;
  const expected = `sha256:${crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')}`;
  return receiptSha256 === expected;
}

export function verifyCanonicalGateEvidenceV2(receipt, { root, nowMs = Date.now(), maxAgeMs = 24 * 60 * 60 * 1000 }) {
  const failures = [];
  if (!verifyCanonicalGateReceiptV2(receipt)) return { valid: false, reasons: ['RECEIPT_CONTRACT_INVALID'] };
  const createdAt = Date.parse(receipt.createdAtUtc);
  if (createdAt > nowMs || nowMs - createdAt > maxAgeMs) failures.push('RECEIPT_STALE_OR_FUTURE_DATED');
  const runStamp = receipt.runId.match(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2}\.\d{3}Z)-/);
  const runAt = runStamp ? Date.parse(`${runStamp[1]}:${runStamp[2]}:${runStamp[3]}`) : NaN;
  if (!Number.isFinite(runAt) || Math.abs(createdAt - runAt) > 5 * 60 * 1000) failures.push('RECEIPT_RUN_ID_TIME_MISMATCH');
  const rootPath = path.resolve(root);
  for (const check of receipt.checks) {
    for (const artifact of check.evidence) {
      const artifactPath = path.resolve(rootPath, artifact.path);
      if (artifactPath !== rootPath && !artifactPath.startsWith(`${rootPath}${path.sep}`)) {
        failures.push(`EVIDENCE_PATH_ESCAPES_ROOT:${artifact.path}`);
        continue;
      }
      if (!fs.existsSync(artifactPath)) {
        failures.push(`EVIDENCE_MISSING:${artifact.path}`);
        continue;
      }
      const digest = `sha256:${crypto.createHash('sha256').update(fs.readFileSync(artifactPath)).digest('hex')}`;
      if (digest !== artifact.sha256) failures.push(`EVIDENCE_DIGEST_MISMATCH:${artifact.path}`);
    }
  }
  return { valid: failures.length === 0, reasons: failures };
}

function pathIsUnsafe(value) {
  return value.startsWith('/') || /^[a-z]:[\\/]/i.test(value) || value.split(/[\\/]/).some((part) => part === '..');
}

export function classifyProcessResult({ status, error, timedOut, parsed, required = true }) {
  if (timedOut) return { verdict: 'TIMEOUT', reasons: ['CHECK_TIMEOUT'], required };
  if (error) return { verdict: 'FAIL', reasons: ['CHECK_PROCESS_ERROR', String(error)], required };
  if (status !== 0) return { verdict: 'FAIL', reasons: [`NONZERO_EXIT:${status}`], required };
  if (parsed === null) return { verdict: 'FAIL', reasons: ['MALFORMED_OR_MISSING_JSON'], required };
  return { verdict: 'PASS', reasons: [], required };
}

export function combineProcessAndPredicateResult(processResult, predicateResult) {
  if (processResult.verdict === 'PASS') return predicateResult;
  if (!predicateResult) return processResult;
  return {
    ...processResult,
    reasons: [...new Set([...(processResult.reasons ?? []), ...(predicateResult.reasons ?? [])])],
  };
}
