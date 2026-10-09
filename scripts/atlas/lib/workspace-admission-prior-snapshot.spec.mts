import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sealReadbackFromReceiptV1 } from './workspace-snapshot-capture-v1.mts';
import {
  classifyWorkspaceFrameStateV1,
  computeWorkspaceFrameAuthorityV1,
  requireWorkspaceFrameForPurposeV1,
  resolveCurrentWorkspaceFrameV1,
} from './current-workspace-frame-selector-v1.mjs';

// WSR-08b: prior-immutable-snapshot admission semantics. Fixtures only; nothing touches repo authority files.
const SNAP = `sha256:${'a'.repeat(64)}`;
const WS = `sha256:${'b'.repeat(64)}`;
const LIVE = `sha256:${'c'.repeat(64)}`;
const SHA = (text: string | Buffer) => `sha256:${createHash('sha256').update(text).digest('hex')}`;
const ROOT = path.resolve(import.meta.dirname, '../../..');
const WRITER = path.join(ROOT, 'scripts/atlas/admit-workspace-revision-tournament-v1.mts');
const CONFIRM = 'AUTHORIZE_WORKSPACE_REVISION_TOURNAMENT_ADMISSION_V1';

const goodReceipt = { snapshotRevision: SNAP, status: 'RESEAL_READBACK_PROVEN', readbackStatus: 'SNAPSHOT_BYTES_READBACK_PROVEN', totalViolations: 0, sourceCount: 2, exactMatches: 2, generatedAt: '2026-10-06T00:00:00.000Z' };
const snapshotOf = (n = 2) => ({ snapshotRevision: SNAP, sources: Array.from({ length: n }, () => ({})) });

test('seal-time readback adapter accepts only a clean, matching, digest-bound receipt', () => {
  const ok = sealReadbackFromReceiptV1(goodReceipt, snapshotOf(), SHA('r'));
  assert.equal(ok.status, 'SNAPSHOT_BYTES_READBACK_PROVEN');
  assert.deepEqual(ok.violations, []);
  assert.equal(ok.readbackSource, 'SEAL_TIME_RECEIPT');
  for (const [receipt, snapshot, digest] of [
    [{ ...goodReceipt, snapshotRevision: `sha256:${'f'.repeat(64)}` }, snapshotOf(), SHA('r')],
    [{ ...goodReceipt, totalViolations: 1 }, snapshotOf(), SHA('r')],
    [{ ...goodReceipt, exactMatches: 1 }, snapshotOf(), SHA('r')],
    [{ ...goodReceipt, status: 'RESEAL_READBACK_BLOCKED' }, snapshotOf(), SHA('r')],
    [goodReceipt, snapshotOf(3), SHA('r')],
    [goodReceipt, snapshotOf(), null],
    [null, snapshotOf(), SHA('r')],
  ] as const) {
    const bad = sealReadbackFromReceiptV1(receipt as any, snapshot, digest as any);
    assert.equal(bad.status, 'SEAL_READBACK_RECEIPT_MISMATCH');
    assert.deepEqual(bad.violations, ['SEAL_READBACK_RECEIPT_MISMATCH']);
  }
});

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'wsr08b-'));
  const manifest = path.join(dir, 'manifest.json');
  const manifestText = JSON.stringify({ ...snapshotOf(), sourceMembershipChecksum: 'sha256:m' });
  writeFileSync(manifest, manifestText);
  const preflight = path.join(dir, 'preflight.json');
  writeFileSync(preflight, JSON.stringify({
    status: 'CANDIDATE_READY_FOR_EXPLICIT_TOURNAMENT_ADMISSION', authority: false, workspaceRevision: null,
    workspaceRevisionCandidate: WS, snapshotRevision: SNAP, sourceCount: 2, snapshotMembershipChecksum: 'sha256:m',
    sourceSelectionChecksum: 'sha256:s', manifestPath: manifest, approvalRequired: true,
  }));
  return { dir, manifestSha256: SHA(readFileSync(manifest)), preflight, report: path.join(dir, 'admission.json') };
}
const runWriter = (f: ReturnType<typeof fixture>, extra: string[], confirm = CONFIRM) => spawnSync(
  process.execPath, ['--import', 'tsx', WRITER, `--preflight=${f.preflight}`, `--report=${f.report}`,
    `--workspace-revision=${WS}`, ...(confirm ? [`--confirm=${confirm}`] : []), ...extra],
  { cwd: ROOT, encoding: 'utf8' },
);

test('writer refuses without the phrase, on a manifest-digest mismatch, and for an under-specified prior-snapshot admission', () => {
  const f = fixture();
  try {
    assert.notEqual(runWriter(f, [], '').status, 0);
    assert.equal(existsSync(f.report), false);
    const wrongDigest = runWriter(f, [`--expect-manifest-sha256=${SHA('other')}`]);
    assert.notEqual(wrongDigest.status, 0);
    assert.match(wrongDigest.stderr, /MANIFEST_SHA256_DOES_NOT_MATCH_AUTHORIZATION/);
    assert.equal(existsSync(f.report), false);
    const missing = runWriter(f, ['--admission-mode=PRIOR_IMMUTABLE_SNAPSHOT']);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /PRIOR_IMMUTABLE_ADMISSION_REQUIRES/);
    assert.equal(existsSync(f.report), false);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test('prior-snapshot admission is recorded, admitted, but never current-workspace authority', () => {
  const f = fixture();
  try {
    const run = runWriter(f, [
      '--admission-mode=PRIOR_IMMUTABLE_SNAPSHOT', `--superseded-by=${LIVE}`,
      `--validation-receipt-sha256=${SHA('receipt')}`, `--expect-manifest-sha256=${f.manifestSha256}`,
    ]);
    assert.equal(run.status, 0, run.stderr);
    const receipt = JSON.parse(readFileSync(f.report, 'utf8'));
    assert.equal(receipt.admissionMode, 'PRIOR_IMMUTABLE_SNAPSHOT');
    assert.equal(receipt.currentAtAdmission, false);
    assert.equal(receipt.supersededByWorkspaceRevision, LIVE);
    assert.equal(receipt.manifestSha256, f.manifestSha256);
    assert.equal(receipt.authority, true);
    assert.equal(receipt.graphifyExecutionAuthorized, false);
    assert.equal(receipt.projectionWritesAuthorized, false);

    // Frame selector reads the receipt from <root>/docs/reports/.
    const root = path.join(f.dir, 'root');
    mkdirSync(path.join(root, 'docs', 'reports'), { recursive: true });
    writeFileSync(path.join(root, 'docs/reports/workspace-revision-tournament-admission-v1.json'), JSON.stringify(receipt));
    const frame = resolveCurrentWorkspaceFrameV1({ root, argv: [], env: {} });
    assert.equal(frame.selectedAdmissionMode, 'PRIOR_IMMUTABLE_SNAPSHOT');
    assert.equal(computeWorkspaceFrameAuthorityV1(frame).frameAuthoritative, false);
    const state = classifyWorkspaceFrameStateV1({ frame, validationReceipt: goodReceipt, currentWorkspaceRevision: LIVE, admission: receipt });
    assert.equal(state.admitted, true);
    assert.equal(state.snapshotValid, true);
    assert.equal(requireWorkspaceFrameForPurposeV1(state, 'HISTORICAL_EXACT_SNAPSHOT').ok, true);
    assert.equal(requireWorkspaceFrameForPurposeV1(state, 'CURRENT_WORKSPACE').ok, false);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test('a legacy admission (no mode) keeps its existing current-frame authority', () => {
  const f = fixture();
  try {
    assert.equal(runWriter(f, []).status, 0);
    const receipt = JSON.parse(readFileSync(f.report, 'utf8'));
    assert.equal(receipt.admissionMode, null);
    assert.equal(receipt.currentAtAdmission, null);
    const root = path.join(f.dir, 'root');
    mkdirSync(path.join(root, 'docs', 'reports'), { recursive: true });
    writeFileSync(path.join(root, 'docs/reports/workspace-revision-tournament-admission-v1.json'), JSON.stringify(receipt));
    const frame = resolveCurrentWorkspaceFrameV1({ root, argv: [], env: {} });
    assert.equal(computeWorkspaceFrameAuthorityV1(frame).frameAuthoritative, true);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});
