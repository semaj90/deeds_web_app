// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildWorkspaceAdmissionPanelV1, deriveCurrentnessV1, type AdmissionPanelInputs } from './workspace-admission-panel-v1.js';

const okReceipt = { ok: true, value: null, error: null };
const base: AdmissionPanelInputs = {
  derive: okReceipt,
  preflight: okReceipt,
  binding: okReceipt,
  candidateArtifact: { exists: false, bytes: null },
  executions: { ok: true, rows: [], error: null },
};

const shaRevision = (value: string) => `sha256:${value.repeat(64).slice(0, 64)}`;
const consistentWithoutCurrentness: AdmissionPanelInputs = {
  derive: {
    ok: true,
    error: null,
    value: {
      snapshotRevision: shaRevision('a'),
      workspaceRevisionCandidate: shaRevision('b'),
      sourceCount: 1,
      repositoryCount: 1,
      sourceMembershipChecksum: 'membership',
      sourceContentChecksum: 'content',
      readback: { status: 'READBACK_MATCH' },
    },
  },
  preflight: {
    ok: true,
    error: null,
    value: {
      snapshotRevision: shaRevision('a'),
      workspaceRevisionCandidate: shaRevision('b'),
      status: 'CANDIDATE_READY_FOR_EXPLICIT_TOURNAMENT_ADMISSION',
      firstBlockingInvariant: null,
    },
  },
  binding: {
    ok: true,
    error: null,
    value: {
      admittedWorkspaceRevision: shaRevision('c'),
      snapshotRevision: shaRevision('d'),
      comparisons: [{ executionId: 'execution-1', eligibleWithoutAdmission: true }],
    },
  },
  candidateArtifact: { exists: true, bytes: 128 },
  executions: {
    ok: true,
    error: null,
    rows: [{ executionId: 'execution-1', status: 'COMPLETED', workspaceRevision: shaRevision('c'), canonicalAuthority: true, startedAt: null, completedAt: null }],
  },
};

describe('workspace admission panel currentness gate', () => {
  it('never reports LIVE_PROVEN for either snapshot when no independent currentness result is supplied', () => {
    const panel = buildWorkspaceAdmissionPanelV1(base);
    expect(panel.candidate.badge).not.toBe('LIVE_PROVEN');
    expect(panel.admitted.badge).not.toBe('LIVE_PROVEN');
    expect(panel.candidate.badge === 'CURRENTNESS_BLOCKED' || panel.candidate.badge === 'STALE_RECEIPT').toBe(true);
  });

  it('blocks LIVE_PROVEN when all receipts reconcile but independent currentness is absent', () => {
    const panel = buildWorkspaceAdmissionPanelV1(consistentWithoutCurrentness);
    expect(panel.consistency.every((item) => item.ok)).toBe(true);
    expect(panel.admitted.canonicalState).toBe('OK');
    expect(panel.candidate.badge).toBe('CURRENTNESS_BLOCKED');
    expect(panel.admitted.badge).toBe('CURRENTNESS_BLOCKED');
    expect(panel.admission.ready).toBe(false);
    expect(panel.admission.authorityGranted).toBe(false);
  });

  it('does not treat a false or unknown currentness result as current', () => {
    for (const currentness of [{ current: false, reason: 'SUPERSEDED' }, { current: null, reason: 'NOT_EVALUATED' }]) {
      const panel = buildWorkspaceAdmissionPanelV1({ ...base, currentness });
      expect(panel.candidate.badge).not.toBe('LIVE_PROVEN');
      expect(panel.admitted.badge).not.toBe('LIVE_PROVEN');
      expect(panel.admission.ready).toBe(false);
    }
  });

  it('keeps the unavailable path unchanged when a receipt cannot be read', () => {
    const panel = buildWorkspaceAdmissionPanelV1({ ...base, derive: { ok: false, value: null, error: 'missing' } });
    expect(panel.candidate.badge).toBe('UNAVAILABLE');
  });
});

const ADMITTED = `sha256:${'ab'.repeat(32)}`;
const LIVE_OK = { ok: true, snapshotRevision: ADMITTED, proven: true, error: null };

describe('independent live currentness', () => {
  it('is current only when a proven live readback equals the admitted snapshot', () => {
    expect(deriveCurrentnessV1(LIVE_OK, ADMITTED).current).toBe(true);
    expect(deriveCurrentnessV1({ ...LIVE_OK, snapshotRevision: `sha256:${'cd'.repeat(32)}` }, ADMITTED).current).toBe(false);
  });

  it('is unknown, never current, without a proven live readback or an admitted snapshot', () => {
    expect(deriveCurrentnessV1(undefined, ADMITTED).current).toBeNull();
    expect(deriveCurrentnessV1({ ...LIVE_OK, proven: false }, ADMITTED).current).toBeNull();
    expect(deriveCurrentnessV1(LIVE_OK, null).current).toBeNull();
  });
});
