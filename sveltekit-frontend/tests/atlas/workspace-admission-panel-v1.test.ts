// @vitest-environment node
/**
 * GRAPHIFY-ADMISSION-UI-READONLY-01: read-only Workspace Admission panel model.
 * Covers: ready-but-not-authorized, missing/unavailable inputs, stale (cross-receipt mismatch),
 * duplicate executions with exactly one / zero / several canonical owners, path safety, and a
 * source guard proving the module has no write/exec capability.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildWorkspaceAdmissionPanelV1,
  candidateSnapshotArtifactPath,
  findRepoRoot,
  type AdmissionPanelInputs,
  type ExecutionRow,
} from '../../src/lib/server/atlas/admission/workspace-admission-panel-v1.js';

const h = (c: string) => `sha256:${c.repeat(64)}`;
const CAND_SNAP = h('1');
const CAND_REV = h('d');
const ADM_SNAP = h('6');
const ADM_REV = h('e');
const NOW = new Date('2026-09-21T18:30:00.000Z');

const exec = (id: string, canonical: boolean, rev = ADM_REV): ExecutionRow => ({
  executionId: id,
  status: 'COMPLETED',
  workspaceRevision: rev,
  canonicalAuthority: canonical,
  startedAt: '2026-09-15T01:11:38.000Z',
  completedAt: '2026-09-15T01:11:57.000Z',
});

function inputs(over: Partial<AdmissionPanelInputs> & { rows?: ExecutionRow[] } = {}): AdmissionPanelInputs {
  const rows = over.rows ?? [exec('74d50c86-0000-4000-8000-000000000001', true), exec('0dba1c0d-0000-4000-8000-000000000002', false)];
  return {
    derive: {
      ok: true,
      error: null,
      value: {
        status: 'WORKSPACE_REVISION_CANDIDATE_READY_FOR_ADMISSION',
        generatedAt: '2026-09-21T18:11:47.280Z',
        snapshotRevision: CAND_SNAP,
        workspaceRevisionCandidate: CAND_REV,
        sourceCount: 26185,
        repositoryCount: 7,
        sourceMembershipChecksum: h('a'),
        sourceContentChecksum: h('b'),
        readback: { status: 'SNAPSHOT_BYTES_READBACK_PROVEN' },
      },
    },
    preflight: {
      ok: true,
      error: null,
      value: {
        status: 'CANDIDATE_READY_FOR_EXPLICIT_TOURNAMENT_ADMISSION',
        firstBlockingInvariant: null,
        generatedAt: '2026-09-21T18:12:02.000Z',
        snapshotRevision: CAND_SNAP,
        workspaceRevisionCandidate: CAND_REV,
      },
    },
    binding: {
      ok: true,
      error: null,
      value: {
        status: 'GRAPHIFY_SNAPSHOT_BINDING_PROVEN',
        firstBlockingInvariant: null,
        generatedAt: '2026-09-21T18:15:16.000Z',
        admittedWorkspaceRevision: ADM_REV,
        snapshotRevision: ADM_SNAP,
        snapshotReadback: { status: 'SNAPSHOT_BYTES_READBACK_PROVEN', sourceCount: 25542 },
        comparisons: rows.map((r) => ({ executionId: r.executionId, eligibleWithoutAdmission: true, canonicalAuthority: r.canonicalAuthority })),
      },
    },
    candidateArtifact: { exists: true, bytes: 15271639 },
    executions: { ok: true, rows, error: null },
    now: NOW,
    ...over,
  };
}

describe('buildWorkspaceAdmissionPanelV1', () => {
  it('ready but NOT authorized: shows both snapshots, 2 matching / 1 canonical, no authority', () => {
    const p = buildWorkspaceAdmissionPanelV1(inputs());
    expect(p.candidate.badge).toBe('LIVE_PROVEN');
    expect(p.admitted.badge).toBe('LIVE_PROVEN');
    expect(p.candidate.snapshotRevision).toBe(CAND_SNAP);
    expect(p.admitted.snapshotRevision).toBe(ADM_SNAP);
    expect(p.candidate.snapshotRevision).not.toBe(p.admitted.snapshotRevision);
    expect(p.admitted.matchingCount).toBe(2);
    expect(p.admitted.canonicalCount).toBe(1);
    expect(p.admitted.canonicalExecutionId).toBe('74d50c86-0000-4000-8000-000000000001');
    expect(p.candidate.graphifyProcessing).toBe('NOT_STARTED');
    expect(p.admission.ready).toBe(true);
    expect(p.admission.label).toBe('WAITING_FOR_AUTHORIZATION');
    expect(p.admission.authorized).toBe(false);
    expect(p.admission.authorityGranted).toBe(false);
    expect(p.degraded).toBe(false);
  });

  it('missing receipt degrades explicitly and never reports ready', () => {
    const base = inputs();
    const p = buildWorkspaceAdmissionPanelV1({ ...base, preflight: { ok: false, value: null, error: 'ENOENT' } });
    expect(p.candidate.badge).toBe('UNAVAILABLE');
    expect(p.unavailableInputs).toContain('preflight-receipt');
    expect(p.candidate.preflight.status).toBeNull();
    expect(p.admission.ready).toBe(false);
    expect(p.admission.label).toBe('NOT_READY');
    expect(p.degraded).toBe(true);
  });

  it('database unavailable -> DEGRADED_READ_ONLY, processing UNKNOWN, no invented counts', () => {
    const p = buildWorkspaceAdmissionPanelV1(inputs({ executions: { ok: false, rows: [], error: 'ECONNREFUSED' } }));
    expect(p.unavailableInputs).toContain('graphify_executions');
    expect(p.candidate.badge).toBe('DEGRADED_READ_ONLY');
    expect(p.admitted.badge).toBe('DEGRADED_READ_ONLY');
    expect(p.candidate.graphifyProcessing).toBe('UNKNOWN');
    expect(p.candidate.graphifyExecutionCount).toBeNull();
    expect(p.admitted.matchingCount).toBe(0);
    expect(p.admission.ready).toBe(false);
  });

  it('stale receipt: preflight snapshot differs from derive -> STALE_RECEIPT and not ready', () => {
    const base = inputs();
    const p = buildWorkspaceAdmissionPanelV1({
      ...base,
      preflight: { ok: true, error: null, value: { ...base.preflight.value, snapshotRevision: h('9') } },
    });
    expect(p.candidate.badge).toBe('STALE_RECEIPT');
    expect(p.consistency.some((c) => !c.ok && c.check.includes('snapshotRevision'))).toBe(true);
    expect(p.admission.ready).toBe(false);
    expect(p.degraded).toBe(true);
  });

  it('binding receipt disagreeing with live executions -> admitted STALE_RECEIPT', () => {
    const base = inputs();
    const p = buildWorkspaceAdmissionPanelV1({
      ...base,
      executions: { ok: true, error: null, rows: [exec('74d50c86-0000-4000-8000-000000000001', true)] },
    });
    expect(p.admitted.badge).toBe('STALE_RECEIPT');
  });

  it('canonical resolution: 1 canonical resolves, 0 or several do not', () => {
    const one = buildWorkspaceAdmissionPanelV1(inputs());
    expect(one.admitted.canonicalExecutionId).not.toBeNull();

    const zero = buildWorkspaceAdmissionPanelV1(inputs({ rows: [exec('aaaaaaaa-0000-4000-8000-000000000001', false), exec('bbbbbbbb-0000-4000-8000-000000000002', false)] }));
    expect(zero.admitted.canonicalCount).toBe(0);
    expect(zero.admitted.canonicalExecutionId).toBeNull();

    const many = buildWorkspaceAdmissionPanelV1(inputs({ rows: [exec('aaaaaaaa-0000-4000-8000-000000000001', true), exec('bbbbbbbb-0000-4000-8000-000000000002', true)] }));
    expect(many.admitted.canonicalCount).toBe(2);
    expect(many.admitted.canonicalExecutionId).toBeNull();

    expect(one.admitted.canonicalState).toBe('OK');
    expect(zero.admitted.canonicalState).toBe('CANONICAL_OWNER_MISSING');
    expect(many.admitted.canonicalState).toBe('CANONICAL_OWNER_CONFLICT');
    // An unresolved canonical owner blocks readiness even when the candidate preflight is ready.
    expect(one.admission.ready).toBe(true);
    expect(zero.admission.ready).toBe(false);
    expect(many.admission.ready).toBe(false);
  });

  it('hard invariants are constant and no authority fallback exists', () => {
    for (const p of [buildWorkspaceAdmissionPanelV1(inputs()), buildWorkspaceAdmissionPanelV1({ ...inputs(), binding: { ok: false, value: null, error: 'x' } })]) {
      expect(p.invariants).toEqual({
        authorityDataMayFallback: false,
        sampleAuthorityDataAllowed: false,
        mutationAllowed: false,
        writesPerformed: false,
        canonicalAuthorityChanged: false,
      });
    }
  });

  it('candidate with a matching execution is reported as EXECUTION_FOUND, not NOT_STARTED', () => {
    const rows = [exec('74d50c86-0000-4000-8000-000000000001', true), exec('cccccccc-0000-4000-8000-000000000003', false, CAND_REV)];
    const p = buildWorkspaceAdmissionPanelV1(inputs({ rows }));
    expect(p.candidate.graphifyProcessing).toBe('EXECUTION_FOUND');
    expect(p.candidate.graphifyExecutionCount).toBe(1);
  });

  it('never grants authority regardless of input', () => {
    for (const p of [buildWorkspaceAdmissionPanelV1(inputs()), buildWorkspaceAdmissionPanelV1({ ...inputs(), derive: { ok: false, value: null, error: 'x' } })]) {
      expect(p.admission.authorized).toBe(false);
      expect(p.admission.authorityGranted).toBe(false);
      expect(p.admission.requiredConfirmation).toBe('AUTHORIZE_WORKSPACE_REVISION_TOURNAMENT_ADMISSION_V1');
    }
  });
});

describe('candidateSnapshotArtifactPath', () => {
  it('builds the path only from a validated sha256 revision', () => {
    const p = candidateSnapshotArtifactPath('/repo', CAND_SNAP);
    expect(p).toBe(path.join('/repo', 'docs', 'reports', 'workspace-source-snapshots', `${'1'.repeat(64)}.json`));
  });
  it('rejects traversal and malformed values', () => {
    expect(candidateSnapshotArtifactPath('/repo', '../../etc/passwd')).toBeNull();
    expect(candidateSnapshotArtifactPath('/repo', 'sha256:xyz')).toBeNull();
    expect(candidateSnapshotArtifactPath('/repo', `sha256:${'1'.repeat(63)}/`)).toBeNull();
    expect(candidateSnapshotArtifactPath('/repo', null)).toBeNull();
  });
});

describe('findRepoRoot', () => {
  it('skips sveltekit-frontend (has docs/reports + openspec) and returns the real repo root', async () => {
    const { mkdtempSync, mkdirSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const root = mkdtempSync(path.join(tmpdir(), 'atlas-root-'));
    try {
      mkdirSync(path.join(root, 'docs', 'reports'), { recursive: true });
      mkdirSync(path.join(root, 'packages'), { recursive: true });
      const frontend = path.join(root, 'sveltekit-frontend');
      mkdirSync(path.join(frontend, 'docs', 'reports'), { recursive: true });
      mkdirSync(path.join(frontend, 'openspec'), { recursive: true });
      const prev = process.env.PROJECT_ROOT;
      delete process.env.PROJECT_ROOT;
      try {
        // Regression (dev-server render, 2026-09-21): .env sets PROJECT_ROOT to sveltekit-frontend/, which must NOT be trusted.
        process.env.PROJECT_ROOT = frontend;
        expect(await findRepoRoot(frontend)).toBe(root);
        expect(await findRepoRoot(path.join(root, 'elsewhere'))).toBe(root);
        delete process.env.PROJECT_ROOT;
        expect(await findRepoRoot(frontend)).toBe(root);
        // Walks up from a deep (even non-existent) child to the same root.
        expect(await findRepoRoot(path.join(root, 'nowhere-else', 'x'))).toBe(root);
      } finally {
        if (prev !== undefined) process.env.PROJECT_ROOT = prev;
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('read-only guarantee (source guard)', () => {
  const source = readFileSync(
    path.resolve(__dirname, '../../src/lib/server/atlas/admission/workspace-admission-panel-v1.ts'),
    'utf8',
  );
  it('has no write, exec or mutating SQL capability', () => {
    expect(source).not.toMatch(/\bwriteFile\b|\bappendFile\b|\bunlink\b|\brename\b|\bmkdir\b/);
    expect(source).not.toMatch(/child_process|\bspawn\b|\bexecSync\b|\bexecFile\b/);
    expect(source).not.toMatch(/\b(INSERT\s+INTO|UPDATE\s+public|DELETE\s+FROM|TRUNCATE|DROP\s+TABLE|ALTER\s+TABLE)\b/i);
  });
});

describe('admission panel authority shadow (diagnostic only)', () => {
  const obs = {
    schema: 'atlas.graphify-authority-shadow-observation.v1', workspaceId: 'w', workspaceRevision: `sha256:${'a'.repeat(64)}`,
    legacyExecutionId: 'X', authorityExecutionId: 'X', authorityState: 'LEGACY_IMPORTED', parityStatus: 'PARITY_PROVEN', readParityProven: true,
    runtimeSelection: 'X', runtimeOwner: 'LEGACY_CANONICAL_AUTHORITY', shadowAuthorityObserved: true, mutationAuthorized: false,
  } as const;

  it('defaults to an empty legacy-owned block when no shadow is supplied', () => {
    const p = buildWorkspaceAdmissionPanelV1(inputs());
    expect(p.authorityShadow).toEqual({ runtimeOwner: 'LEGACY_CANONICAL_AUTHORITY', error: null, observations: [] });
  });
  it('passes observations through without changing any decision field', () => {
    const without = buildWorkspaceAdmissionPanelV1(inputs());
    const withShadow = buildWorkspaceAdmissionPanelV1({ ...inputs(), authorityShadow: { observations: [obs], error: null } });
    const { authorityShadow: _a, ...restWithout } = without as any;
    const { authorityShadow: _b, ...restWith } = withShadow as any;
    expect(restWith).toEqual(restWithout);
    expect(withShadow.authorityShadow.observations[0].runtimeSelection).toBe('X');
  });
  it('a disagreeing or failed shadow never flips readiness or canonicalState', () => {
    const mismatch = { ...obs, authorityExecutionId: 'Y', parityStatus: 'SELECTION_MISMATCH', readParityProven: false } as const;
    const base = buildWorkspaceAdmissionPanelV1(inputs());
    const bad = buildWorkspaceAdmissionPanelV1({ ...inputs(), authorityShadow: { observations: [mismatch], error: 'boom' } });
    expect(bad.admitted.canonicalState).toBe(base.admitted.canonicalState);
    expect(bad.degraded).toBe(base.degraded);
    expect(bad.authorityShadow.error).toBe('boom');
  });
});
