/**
 * Read-only "Workspace Admission" panel model for /admin/graphify-readiness.
 *
 * GRAPHIFY-ADMISSION-UI-READONLY-01. Observation only: no DB writes, no report writes, no Graphify
 * invocation, no admission command. Two different snapshots are shown and must never be conflated:
 *   - ADMITTED  : the snapshot bound to the admitted workspace revision (binding audit's default manifest).
 *   - CANDIDATE : the newest captured snapshot / derived candidate revision awaiting explicit admission.
 * Receipts on disk are overwritten by each CLI run, so every receipt is cross-checked by snapshotRevision
 * and flagged STALE_RECEIPT on mismatch. Nothing here grants authority.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

export type PanelBadge = 'LIVE_PROVEN' | 'DEGRADED_READ_ONLY' | 'STALE_RECEIPT' | 'UNAVAILABLE';

export interface ReceiptRead {
  ok: boolean;
  value: any | null;
  error: string | null;
}

export interface ExecutionRow {
  executionId: string;
  status: string;
  workspaceRevision: string;
  canonicalAuthority: boolean;
  startedAt: string | null;
  completedAt: string | null;
}

export interface AdmissionPanelInputs {
  derive: ReceiptRead;
  preflight: ReceiptRead;
  binding: ReceiptRead;
  /** stat() of the candidate snapshot artifact (never parsed: it is ~15 MB). */
  candidateArtifact: { exists: boolean; bytes: number | null };
  executions: { ok: boolean; rows: ExecutionRow[]; error: string | null };
  now?: Date;
}

export interface ConsistencyCheck {
  check: string;
  ok: boolean;
  detail: string;
}

export interface WorkspaceAdmissionPanelV1 {
  schema: 'atlas.workspace-admission-panel.v1';
  generatedAt: string;
  candidate: {
    badge: PanelBadge;
    snapshotRevision: string | null;
    candidateWorkspaceRevision: string | null;
    sourceCount: number | null;
    repositoryCount: number | null;
    sourceMembershipChecksum: string | null;
    sourceContentChecksum: string | null;
    artifactPresent: boolean;
    snapshotReadback: string | null;
    derive: { status: string | null; generatedAt: string | null; ageSeconds: number | null };
    preflight: { status: string | null; blockingInvariant: string | null; generatedAt: string | null; ageSeconds: number | null };
    /** Executions whose workspace_revision equals the candidate revision. Null when executions could not be read. */
    graphifyExecutionCount: number | null;
    graphifyProcessing: 'NOT_STARTED' | 'EXECUTION_FOUND' | 'UNKNOWN';
  };
  admitted: {
    badge: PanelBadge;
    workspaceRevision: string | null;
    snapshotRevision: string | null;
    snapshotReadback: string | null;
    sourceCount: number | null;
    binding: { status: string | null; blockingInvariant: string | null; generatedAt: string | null; ageSeconds: number | null };
    executions: ExecutionRow[];
    matchingCount: number;
    canonicalCount: number;
    canonicalExecutionId: string | null;
    /** OK = exactly one canonical owner among the matching executions; otherwise the binding is not resolved. */
    canonicalState: 'OK' | 'CANONICAL_OWNER_MISSING' | 'CANONICAL_OWNER_CONFLICT' | 'UNKNOWN';
  };
  consistency: ConsistencyCheck[];
  admission: {
    ready: boolean;
    label: 'WAITING_FOR_AUTHORIZATION' | 'NOT_READY';
    authorized: false;
    authorityGranted: false;
    requiredConfirmation: 'AUTHORIZE_WORKSPACE_REVISION_TOURNAMENT_ADMISSION_V1';
  };
  degraded: boolean;
  unavailableInputs: string[];
  /** Hard invariants of this read-only surface. Constant by construction; asserted by tests. */
  invariants: {
    authorityDataMayFallback: false;
    sampleAuthorityDataAllowed: false;
    mutationAllowed: false;
    writesPerformed: false;
    canonicalAuthorityChanged: false;
  };
}

const READY_STATUS = 'CANDIDATE_READY_FOR_EXPLICIT_TOURNAMENT_ADMISSION';
const REVISION_RE = /^sha256:[a-f0-9]{64}$/;

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function ageSeconds(generatedAt: string | null, now: Date): number | null {
  if (!generatedAt) return null;
  const t = Date.parse(generatedAt);
  return Number.isFinite(t) ? Math.max(0, Math.round((now.getTime() - t) / 1000)) : null;
}

/** Pure: same inputs, same panel. All authority-looking fields are derived from receipts, never invented. */
export function buildWorkspaceAdmissionPanelV1(inputs: AdmissionPanelInputs): WorkspaceAdmissionPanelV1 {
  const now = inputs.now ?? new Date();
  const derive = inputs.derive.value;
  const preflight = inputs.preflight.value;
  const binding = inputs.binding.value;
  const unavailableInputs: string[] = [];
  if (!inputs.derive.ok) unavailableInputs.push('derive-receipt');
  if (!inputs.preflight.ok) unavailableInputs.push('preflight-receipt');
  if (!inputs.binding.ok) unavailableInputs.push('binding-receipt');
  if (!inputs.executions.ok) unavailableInputs.push('graphify_executions');

  const candidateSnapshot = str(derive?.snapshotRevision);
  const candidateRevision = str(derive?.workspaceRevisionCandidate);
  const admittedWorkspace = str(binding?.admittedWorkspaceRevision);
  const admittedSnapshot = str(binding?.snapshotRevision);

  const admittedRows = inputs.executions.ok
    ? inputs.executions.rows.filter((r) => admittedWorkspace !== null && r.workspaceRevision === admittedWorkspace)
    : [];
  const bindingComparisons: any[] = Array.isArray(binding?.comparisons) ? binding.comparisons : [];
  const matchingIds = new Set(
    bindingComparisons.filter((c) => c?.eligibleWithoutAdmission === true).map((c) => String(c.executionId)),
  );
  const matching = admittedRows.filter((r) => matchingIds.has(r.executionId));
  const canonical = matching.filter((r) => r.canonicalAuthority === true);

  const candidateExecCount = inputs.executions.ok && candidateRevision
    ? inputs.executions.rows.filter((r) => r.workspaceRevision === candidateRevision).length
    : null;

  const consistency: ConsistencyCheck[] = [];
  const check = (name: string, ok: boolean, detail: string) => consistency.push({ check: name, ok, detail });
  if (inputs.derive.ok && inputs.preflight.ok) {
    check(
      'preflight.snapshotRevision == derive.snapshotRevision',
      str(preflight?.snapshotRevision) !== null && preflight.snapshotRevision === derive?.snapshotRevision,
      `${str(preflight?.snapshotRevision) ?? 'null'} vs ${candidateSnapshot ?? 'null'}`,
    );
    check(
      'preflight.candidate == derive.candidate',
      str(preflight?.workspaceRevisionCandidate) !== null && preflight.workspaceRevisionCandidate === derive?.workspaceRevisionCandidate,
      `${str(preflight?.workspaceRevisionCandidate) ?? 'null'} vs ${candidateRevision ?? 'null'}`,
    );
  }
  if (inputs.derive.ok) {
    check('candidate snapshot artifact present', inputs.candidateArtifact.exists, inputs.candidateArtifact.exists ? `${inputs.candidateArtifact.bytes ?? '?'} bytes` : 'missing on disk');
    check('candidate snapshotRevision is a sha256 revision', candidateSnapshot !== null && REVISION_RE.test(candidateSnapshot), candidateSnapshot ?? 'null');
  }
  if (inputs.binding.ok && inputs.executions.ok) {
    check(
      'binding receipt matches live graphify_executions',
      bindingComparisons.filter((c) => c?.eligibleWithoutAdmission === true).length === matching.length,
      `receipt eligible ${bindingComparisons.filter((c) => c?.eligibleWithoutAdmission === true).length} vs live ${matching.length}`,
    );
  }
  const consistent = consistency.every((c) => c.ok);

  const candidateBadge: PanelBadge = !inputs.derive.ok || !inputs.preflight.ok
    ? 'UNAVAILABLE'
    : !consistent
      ? 'STALE_RECEIPT'
      : !inputs.executions.ok
        ? 'DEGRADED_READ_ONLY'
        : 'LIVE_PROVEN';
  const admittedBadge: PanelBadge = !inputs.binding.ok
    ? 'UNAVAILABLE'
    : !inputs.executions.ok
      ? 'DEGRADED_READ_ONLY'
      : consistency.some((c) => !c.ok && c.check.startsWith('binding'))
        ? 'STALE_RECEIPT'
        : 'LIVE_PROVEN';

  const canonicalState: WorkspaceAdmissionPanelV1['admitted']['canonicalState'] =
    !inputs.executions.ok || !inputs.binding.ok || matching.length === 0
      ? 'UNKNOWN'
      : canonical.length === 1
        ? 'OK'
        : canonical.length === 0
          ? 'CANONICAL_OWNER_MISSING'
          : 'CANONICAL_OWNER_CONFLICT';
  const preflightReady = str(preflight?.status) === READY_STATUS && str(preflight?.firstBlockingInvariant) === null;
  const ready = preflightReady && candidateBadge === 'LIVE_PROVEN' && canonicalState === 'OK';

  return {
    schema: 'atlas.workspace-admission-panel.v1',
    generatedAt: now.toISOString(),
    candidate: {
      badge: candidateBadge,
      snapshotRevision: candidateSnapshot,
      candidateWorkspaceRevision: candidateRevision,
      sourceCount: num(derive?.sourceCount),
      repositoryCount: num(derive?.repositoryCount),
      sourceMembershipChecksum: str(derive?.sourceMembershipChecksum),
      sourceContentChecksum: str(derive?.sourceContentChecksum),
      artifactPresent: inputs.candidateArtifact.exists,
      snapshotReadback: str(derive?.readback?.status),
      derive: { status: str(derive?.status), generatedAt: str(derive?.generatedAt), ageSeconds: ageSeconds(str(derive?.generatedAt), now) },
      preflight: {
        status: str(preflight?.status),
        blockingInvariant: str(preflight?.firstBlockingInvariant),
        generatedAt: str(preflight?.generatedAt),
        ageSeconds: ageSeconds(str(preflight?.generatedAt), now),
      },
      graphifyExecutionCount: candidateExecCount,
      graphifyProcessing: candidateExecCount === null ? 'UNKNOWN' : candidateExecCount > 0 ? 'EXECUTION_FOUND' : 'NOT_STARTED',
    },
    admitted: {
      badge: admittedBadge,
      workspaceRevision: admittedWorkspace,
      snapshotRevision: admittedSnapshot,
      snapshotReadback: str(binding?.snapshotReadback?.status),
      sourceCount: num(binding?.snapshotReadback?.sourceCount),
      binding: {
        status: str(binding?.status),
        blockingInvariant: str(binding?.firstBlockingInvariant),
        generatedAt: str(binding?.generatedAt),
        ageSeconds: ageSeconds(str(binding?.generatedAt), now),
      },
      executions: matching,
      matchingCount: matching.length,
      canonicalCount: canonical.length,
      canonicalExecutionId: canonical.length === 1 ? canonical[0].executionId : null,
      canonicalState,
    },
    consistency,
    admission: {
      ready,
      label: ready ? 'WAITING_FOR_AUTHORIZATION' : 'NOT_READY',
      authorized: false,
      authorityGranted: false,
      requiredConfirmation: 'AUTHORIZE_WORKSPACE_REVISION_TOURNAMENT_ADMISSION_V1',
    },
    degraded: unavailableInputs.length > 0 || !consistent,
    unavailableInputs,
    invariants: {
      authorityDataMayFallback: false,
      sampleAuthorityDataAllowed: false,
      mutationAllowed: false,
      writesPerformed: false,
      canonicalAuthorityChanged: false,
    },
  };
}

/** Fixed receipt paths only. Nothing is ever read from a path found inside a receipt. */
const RECEIPTS = {
  derive: 'docs/reports/workspace-revision-from-sealed-multi-repo-snapshot-v1.json',
  preflight: 'docs/reports/workspace-revision-tournament-source-authority-v1.json',
  binding: 'docs/reports/graphify-workspace-snapshot-binding-v1.json',
} as const;

/** Snapshot artifact path is built from a validated revision hash, never from receipt path text. */
export function candidateSnapshotArtifactPath(root: string, snapshotRevision: string | null): string | null {
  if (!snapshotRevision || !REVISION_RE.test(snapshotRevision)) return null;
  return path.join(root, 'docs', 'reports', 'workspace-source-snapshots', `${snapshotRevision.slice(7)}.json`);
}

/**
 * Walk up from `start` to the repository root. `sveltekit-frontend/` also has `docs/reports` and
 * `openspec`, so those alone are NOT a root marker (found by the live run, 2026-09-21): the root is the
 * directory that has `docs/reports` AND a root-only marker (`.gitmodules` or `packages`).
 */
export async function findRepoRoot(start: string = process.cwd()): Promise<string | null> {
  const exists = async (p: string) => fs.access(p).then(() => true, () => false);
  const walkUp = async (from: string): Promise<string | null> => {
    let current = from;
    for (let i = 0; i < 6; i += 1) {
      if (
        (await exists(path.join(current, 'docs', 'reports'))) &&
        ((await exists(path.join(current, '.gitmodules'))) || (await exists(path.join(current, 'packages'))))
      ) {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return null;
  };
  // PROJECT_ROOT is only a hint and is never trusted as-is: this repo's .env sets it to `sveltekit-frontend/`
  // (found by the live dev-server render, 2026-09-21), which is NOT the tree that holds the receipts. It must
  // itself pass the root-marker check (walking up from it), otherwise fall back to the caller's start directory.
  const hinted = process.env.PROJECT_ROOT ? await walkUp(process.env.PROJECT_ROOT) : null;
  return hinted ?? (await walkUp(start));
}

async function readReceipt(root: string | null, relative: string): Promise<ReceiptRead> {
  if (!root) return { ok: false, value: null, error: 'REPO_ROOT_NOT_FOUND' };
  try {
    const text = await fs.readFile(path.join(root, relative), 'utf8');
    return { ok: true, value: JSON.parse(text), error: null };
  } catch (error) {
    return { ok: false, value: null, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Live loader: reads three receipts, stat()s one artifact, and SELECTs graphify_executions. Writes nothing. */
export async function loadWorkspaceAdmissionPanelV1(): Promise<WorkspaceAdmissionPanelV1> {
  const root = await findRepoRoot();
  const [derive, preflight, binding] = await Promise.all([
    readReceipt(root, RECEIPTS.derive),
    readReceipt(root, RECEIPTS.preflight),
    readReceipt(root, RECEIPTS.binding),
  ]);

  const artifactPath = root ? candidateSnapshotArtifactPath(root, str(derive.value?.snapshotRevision)) : null;
  let candidateArtifact = { exists: false, bytes: null as number | null };
  if (artifactPath) {
    try {
      const stat = await fs.stat(artifactPath);
      candidateArtifact = { exists: stat.isFile(), bytes: stat.size };
    } catch {
      candidateArtifact = { exists: false, bytes: null };
    }
  }

  const revisions = [str(binding.value?.admittedWorkspaceRevision), str(derive.value?.workspaceRevisionCandidate)]
    .filter((v): v is string => v !== null);
  let executions: AdmissionPanelInputs['executions'] = { ok: false, rows: [], error: 'NO_REVISIONS_TO_QUERY' };
  if (revisions.length > 0) {
    try {
      const { pool } = await import('$lib/server/db/client');
      const result = await pool.query(
        `SELECT execution_id::text AS execution_id, status, workspace_revision, canonical_authority,
                started_at, completed_at
           FROM public.graphify_executions
          WHERE workspace_revision = ANY($1::text[])
          ORDER BY started_at`,
        [revisions],
      );
      executions = {
        ok: true,
        error: null,
        rows: result.rows.map((r: any) => ({
          executionId: String(r.execution_id),
          status: String(r.status),
          workspaceRevision: String(r.workspace_revision),
          canonicalAuthority: r.canonical_authority === true,
          startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
          completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
        })),
      };
    } catch (error) {
      executions = { ok: false, rows: [], error: error instanceof Error ? error.message : String(error) };
    }
  }

  return buildWorkspaceAdmissionPanelV1({ derive, preflight, binding, candidateArtifact, executions });
}
