import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Read-only Graphify status from existing receipts (pure I/O reader; never runs Graphify, never writes, never throws).
 *   lifecycle: docs/reports/graphify-daily-lifecycle-v1.json   (the receipt the Stop hook "Graphify currentness" check reads)
 *   gate:      newest .tmp/atlas/canonical-gate-runs/<run>/canonical-gate-receipt-v2.json
 * It reports what the receipts say. It does not decide admission, does not verify the gate receipt's own checksum, and does not
 * promote anything. `graphifyDependentWork` is GATED unless the lifecycle receipt is a fresh COMPLETED run AND the newest gate is PASS.
 */
export const STALE_AFTER_MINUTES = 1440;
const MAX_BYTES = 4 * 1024 * 1024;

function readJson(file) {
  let stat;
  try { stat = fs.statSync(file); } catch { return { ok: false, reason: 'ABSENT' }; }
  if (!stat.isFile()) return { ok: false, reason: 'NOT_A_FILE' };
  if (stat.size > MAX_BYTES) return { ok: false, reason: 'OVERSIZE', bytes: stat.size };
  const bytes = fs.readFileSync(file);
  try { return { ok: true, value: JSON.parse(bytes.toString('utf8')), sha256: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`, bytes: bytes.length }; } catch { return { ok: false, reason: 'MALFORMED_JSON' }; }
}

function lifecycle(repoRoot, now) {
  const file = path.join(repoRoot, 'docs/reports/graphify-daily-lifecycle-v1.json');
  const r = readJson(file);
  if (!r.ok) return { present: r.reason !== 'ABSENT', valid: false, reason: r.reason };
  const v = r.value;
  const completedMs = Date.parse(v.completedAt);
  const ageMinutes = Number.isFinite(completedMs) ? Math.round((now - completedMs) / 60000) : null;
  const valid = v.terminalStatus === 'COMPLETED' && ageMinutes !== null && ageMinutes >= 0;
  return {
    present: true, valid, reason: valid ? null : (v.terminalStatus !== 'COMPLETED' ? 'TERMINAL_STATUS_NOT_COMPLETED' : 'COMPLETED_AT_INVALID'),
    terminalStatus: v.terminalStatus ?? null, completedAt: v.completedAt ?? null, ageMinutes, stale: valid ? ageMinutes > STALE_AFTER_MINUTES : null,
    executionId: v.executionId ?? null, workspaceRevision: v.workspaceRevision ?? null, canonicalAuthority: v.canonicalAuthority ?? null,
    writesPerformed: v.writesPerformed ?? null, receiptSha256: r.sha256,
  };
}

function gate(repoRoot) {
  const dir = path.join(repoRoot, '.tmp/atlas/canonical-gate-runs');
  let runs;
  try { runs = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort(); } catch { return { present: false, valid: false, reason: 'NO_GATE_RUN_DIRECTORY' }; }
  for (let i = runs.length - 1; i >= 0; i -= 1) {
    const r = readJson(path.join(dir, runs[i], 'canonical-gate-receipt-v2.json'));
    if (!r.ok) continue;
    const v = r.value;
    return {
      present: true, valid: typeof v.overall === 'string', runDir: runs[i], createdAtUtc: v.createdAtUtc ?? null, overall: v.overall ?? null,
      firstFailedMandatoryPredicate: v.firstFailedMandatoryPredicate ? { id: v.firstFailedMandatoryPredicate.id ?? null, category: v.firstFailedMandatoryPredicate.category ?? null, verdict: v.firstFailedMandatoryPredicate.verdict ?? null, reasons: Array.isArray(v.firstFailedMandatoryPredicate.reasons) ? v.firstFailedMandatoryPredicate.reasons.slice(0, 3) : [] } : null, executionStatus: v.executionStatus ?? null, promotionStatus: v.promotionStatus ?? null,
      graphifyExecutionId: v.graphifyExecutionId ?? null, workspaceRevision: v.workspaceRevision ?? null, canonicalAuthority: v.canonicalAuthority ?? null,
      checks: Array.isArray(v.checks) ? v.checks.map((c) => ({ id: c.id, verdict: c.verdict ?? c.status ?? null, reasons: Array.isArray(c.reasons) ? c.reasons.slice(0, 3) : [] })) : [],
      receiptSha256: r.sha256, receiptChecksumVerified: null, runsScanned: runs.length - i,
    };
  }
  return { present: runs.length > 0, valid: false, reason: runs.length ? 'NO_READABLE_GATE_RECEIPT' : 'NO_GATE_RUNS' };
}

export function readGraphifyStatus({ repoRoot, now = Date.now() }) {
  if (typeof repoRoot !== 'string' || !repoRoot) throw new TypeError('repoRoot is required');
  const lc = lifecycle(repoRoot, now);
  const g = gate(repoRoot);
  const fresh = lc.valid === true && lc.stale === false;
  const gatePass = g.valid === true && g.overall === 'PASS';
  const receiptConflicts = [];
  if (lc.executionId && g.graphifyExecutionId && lc.executionId !== g.graphifyExecutionId) receiptConflicts.push('LIFECYCLE_GATE_EXECUTION_MISMATCH');
  if (lc.workspaceRevision && g.workspaceRevision && lc.workspaceRevision !== g.workspaceRevision) receiptConflicts.push('LIFECYCLE_GATE_WORKSPACE_REVISION_MISMATCH');
  const reasons = [];
  if (!lc.valid) reasons.push(`LIFECYCLE_${lc.reason}`);
  else if (lc.stale) reasons.push('LIFECYCLE_STALE');
  if (!g.valid) reasons.push(`GATE_${g.reason}`);
  else if (!gatePass) reasons.push(`GATE_${g.overall}`);
  reasons.push(...receiptConflicts);
  if (g.valid && g.firstFailedMandatoryPredicate) reasons.push(`FIRST_BLOCKER:${g.firstFailedMandatoryPredicate.category ?? g.firstFailedMandatoryPredicate.id}:${g.firstFailedMandatoryPredicate.reasons[0] ?? 'NO_REASON'}`);
  return {
    schema: 'atlas.graphify-status.v1', generatedAt: new Date(now).toISOString(), lifecycle: lc, gate: g,
    receiptConflicts, graphifyDependentWork: fresh && gatePass && receiptConflicts.length === 0 ? 'ELIGIBLE_PENDING_OTHER_GATES' : 'GATED', reasons,
    readOnly: true, writesPerformed: false, runsGraphify: false, canonicalAuthority: false,
  };
}
