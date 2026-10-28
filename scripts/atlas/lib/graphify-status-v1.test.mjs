import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readGraphifyStatus, STALE_AFTER_MINUTES } from './graphify-status-v1.mjs';

const NOW = Date.parse('2026-10-28T12:00:00.000Z');
const iso = (minutesAgo) => new Date(NOW - minutesAgo * 60000).toISOString();

function fixture({ lifecycle, gates = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'graphify-status-'));
  if (lifecycle !== undefined) {
    fs.mkdirSync(path.join(root, 'docs/reports'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs/reports/graphify-daily-lifecycle-v1.json'), typeof lifecycle === 'string' ? lifecycle : JSON.stringify(lifecycle));
  }
  for (const [name, body] of gates) {
    const d = path.join(root, '.tmp/atlas/canonical-gate-runs', name);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'canonical-gate-receipt-v2.json'), typeof body === 'string' ? body : JSON.stringify(body));
  }
  return root;
}
const completed = (minutesAgo) => ({ terminalStatus: 'COMPLETED', completedAt: iso(minutesAgo), executionId: 'exec-1', canonicalAuthority: false, writesPerformed: false });
// Shape copied from a real canonical-gate-receipt-v2.json: checks use `verdict`, the first failed predicate is an object.
const failGate = { overall: 'FAIL', firstFailedMandatoryPredicate: { id: 'packet-identity', category: 'PACKET_IDENTITY', verdict: 'BLOCKED', reasons: ['IDENTITY_GATE:GRAPHIFY_EXECUTION_NOT_CANONICAL'] }, checks: [{ id: 'service-health', verdict: 'PASS', reasons: [] }, { id: 'packet-identity', verdict: 'BLOCKED', reasons: ['IDENTITY_GATE:GRAPHIFY_EXECUTION_NOT_CANONICAL'] }] };

test('fresh completed lifecycle plus failing gate is GATED and names the first blocker', () => {
  const r = readGraphifyStatus({ repoRoot: fixture({ lifecycle: completed(60), gates: [['2026-10-28T00-01-51.956Z-a', failGate]] }), now: NOW });
  assert.equal(r.lifecycle.valid, true);
  assert.equal(r.lifecycle.stale, false);
  assert.equal(r.lifecycle.ageMinutes, 60);
  assert.equal(r.gate.overall, 'FAIL');
  assert.equal(r.graphifyDependentWork, 'GATED');
  assert.ok(r.reasons.includes('GATE_FAIL'));
  assert.ok(r.reasons.includes('FIRST_BLOCKER:PACKET_IDENTITY:IDENTITY_GATE:GRAPHIFY_EXECUTION_NOT_CANONICAL'));
  assert.deepEqual(r.gate.checks.map((c) => [c.id, c.verdict]), [['service-health', 'PASS'], ['packet-identity', 'BLOCKED']]);
});

test('a stale lifecycle receipt is flagged at the same threshold the Stop hook uses', () => {
  const r = readGraphifyStatus({ repoRoot: fixture({ lifecycle: completed(STALE_AFTER_MINUTES + 1), gates: [['g1', { overall: 'PASS', checks: [] }]] }), now: NOW });
  assert.equal(r.lifecycle.stale, true);
  assert.equal(r.graphifyDependentWork, 'GATED');
  assert.ok(r.reasons.includes('LIFECYCLE_STALE'));
});

test('only a fresh completed run AND a passing gate is eligible, and it still says pending other gates', () => {
  const r = readGraphifyStatus({ repoRoot: fixture({ lifecycle: completed(5), gates: [['g1', { overall: 'PASS', checks: [] }]] }), now: NOW });
  assert.equal(r.graphifyDependentWork, 'ELIGIBLE_PENDING_OTHER_GATES');
  assert.equal(r.canonicalAuthority, false);
});

test('fresh passing receipts with conflicting execution or workspace revisions remain GATED', () => {
  const gate = { overall: 'PASS', graphifyExecutionId: 'other-exec', workspaceRevision: 'sha256:other', checks: [] };
  const r = readGraphifyStatus({ repoRoot: fixture({ lifecycle: { ...completed(5), workspaceRevision: 'sha256:current' }, gates: [['g1', gate]] }), now: NOW });
  assert.equal(r.graphifyDependentWork, 'GATED');
  assert.deepEqual(r.receiptConflicts, ['LIFECYCLE_GATE_EXECUTION_MISMATCH', 'LIFECYCLE_GATE_WORKSPACE_REVISION_MISMATCH']);
  assert.ok(r.reasons.includes('LIFECYCLE_GATE_EXECUTION_MISMATCH'));
});

test('missing, malformed, non-completed and future-dated lifecycle receipts are typed and gated, never thrown', () => {
  for (const [lifecycle, reason] of [[undefined, 'LIFECYCLE_ABSENT'], ['{not json', 'LIFECYCLE_MALFORMED_JSON'], [{ terminalStatus: 'FAILED', completedAt: iso(1) }, 'LIFECYCLE_TERMINAL_STATUS_NOT_COMPLETED'], [{ terminalStatus: 'COMPLETED', completedAt: iso(-30) }, 'LIFECYCLE_COMPLETED_AT_INVALID']]) {
    const r = readGraphifyStatus({ repoRoot: fixture({ lifecycle }), now: NOW });
    assert.equal(r.graphifyDependentWork, 'GATED');
    assert.ok(r.reasons.includes(reason), `${reason} in ${r.reasons}`);
  }
});

test('the newest readable gate run wins, an unreadable newest run is skipped, and no gate run is reported', () => {
  const root = fixture({ lifecycle: completed(1), gates: [['2026-10-27T10-00-00.000Z-old', { overall: 'PASS', checks: [] }], ['2026-10-28T00-01-51.956Z-new', failGate], ['2026-10-28T09-00-00.000Z-broken', '{oops']] });
  const r = readGraphifyStatus({ repoRoot: root, now: NOW });
  assert.equal(r.gate.runDir, '2026-10-28T00-01-51.956Z-new');
  assert.equal(r.gate.overall, 'FAIL');
  assert.equal(r.gate.runsScanned, 2);
  assert.equal(readGraphifyStatus({ repoRoot: fixture({ lifecycle: completed(1) }), now: NOW }).gate.reason, 'NO_GATE_RUN_DIRECTORY');
});

test('the gate receipt checksum is reported as unverified, and the reader never writes or runs anything', () => {
  const root = fixture({ lifecycle: completed(1), gates: [['g1', failGate]] });
  const before = fs.readdirSync(root, { recursive: true }).sort().join('|');
  const r = readGraphifyStatus({ repoRoot: root, now: NOW });
  assert.equal(r.gate.receiptChecksumVerified, null);
  assert.match(r.gate.receiptSha256, /^sha256:[0-9a-f]{64}$/);
  assert.equal(r.runsGraphify, false);
  assert.equal(r.writesPerformed, false);
  assert.equal(fs.readdirSync(root, { recursive: true }).sort().join('|'), before);
});

test('repoRoot is required', () => {
  assert.throws(() => readGraphifyStatus({}), TypeError);
});
