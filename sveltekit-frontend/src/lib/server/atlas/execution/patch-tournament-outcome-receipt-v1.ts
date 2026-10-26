import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import type { PatchTournamentCheck, PatchTournamentPlan } from '../../agent/patch-tournament.js';
import { ALGORITHM_RECEIPT_INSERT_SQL, type SqlClientV1 } from './topk-execution-receipt-v1.js';

/**
 * Observed outcome of one patch-tournament candidate, recorded into the EXISTING `atlas_algorithm_execution_receipts`
 * (no new table, no new column). It records what ran and what the checks reported, INCLUDING FAILURES (the negative
 * class a reward model needs). It is evidence of a run, not verification: `verified` is VERIFIED_PASS only when every
 * check passed with a command and an evidence ref that the independent verifier table resolved. No reward is assigned
 * here, nothing is applied to the workspace, and nothing is trained.
 */
export const PATCH_OUTCOME_SCHEMA = 'atlas.patch-tournament.outcome.v1' as const;

const hex64 = z.string().regex(/^[a-f0-9]{64}$/);
const digest = z.string().regex(/^(sha256:)?[a-f0-9]{64}$/);
const safeRelPath = z.string().min(1).max(300).refine((p) => !p.startsWith('/') && !/^[A-Za-z]:/.test(p) && !p.split('/').includes('..'), 'PATH_NOT_RELATIVE');

export const PatchOutcomeCheckSchema = z.object({
  kind: z.enum(['static', 'focused_test']),
  name: z.string().min(1).max(200),
  /** sha256 of the exact command string; null when no command was recorded (such a pass is never verified). */
  commandIdentity: hex64.nullable(),
  passed: z.boolean(),
  evidenceRef: z.string().min(1).max(300).nullable(),
  evidenceVerified: z.boolean(),
}).strict();
export type PatchOutcomeCheckV1 = z.infer<typeof PatchOutcomeCheckSchema>;

export const PatchOutcomeSchema = z.object({
  schema: z.literal(PATCH_OUTCOME_SCHEMA),
  executionId: z.string().regex(/^patchtour:[a-f0-9]{64}$/),
  tournamentId: z.string().min(1),
  candidateId: z.string().min(1),
  runId: z.string().min(1),
  workspaceId: z.string().min(1),
  workspaceRevision: z.string().min(1),
  candidateSourceRevision: z.string().min(1),
  baseBranch: z.string().min(1),
  patchDigest: digest,
  compileErrorDigest: hex64,
  acePacketChecksum: hex64,
  touchedFiles: z.array(safeRelPath).max(50),
  checks: z.array(PatchOutcomeCheckSchema).min(1).max(40),
  riskSignals: z.array(z.string().max(80)).max(20),
  rank: z.number().int().positive(),
  score: z.number().finite(),
  reviewStatus: z.enum(['review_first', 'review_later', 'blocked']),
  outcome: z.enum(['ALL_CHECKS_PASSED_VERIFIED', 'PASSED_UNVERIFIED', 'CHECK_FAILED']),
  independentlyReverified: z.literal(false),
  canonicalAuthority: z.literal(false),
  appliedToWorkspace: z.literal(false),
  rewardAssigned: z.literal(false),
  noTraining: z.literal(true),
}).strict();
export type PatchOutcomeV1 = z.infer<typeof PatchOutcomeSchema>;

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

function normaliseCheck(kind: PatchOutcomeCheckV1['kind'], check: PatchTournamentCheck, verified: ReadonlySet<string>): PatchOutcomeCheckV1 {
  const command = check.command?.trim() ? check.command.trim() : null;
  const ref = check.evidenceRef?.trim() ? check.evidenceRef.trim() : null;
  return {
    kind, name: check.name, commandIdentity: command ? sha256(command) : null, passed: check.passed === true,
    evidenceRef: ref, evidenceVerified: Boolean(ref && verified.has(ref)),
  };
}

export function classifyOutcome(checks: readonly PatchOutcomeCheckV1[]): PatchOutcomeV1['outcome'] {
  if (checks.some((c) => !c.passed)) return 'CHECK_FAILED';
  const allVerified = checks.every((c) => c.commandIdentity !== null && c.evidenceRef !== null && c.evidenceVerified);
  return allVerified ? 'ALL_CHECKS_PASSED_VERIFIED' : 'PASSED_UNVERIFIED';
}

type OutcomeBody = Omit<PatchOutcomeV1, 'executionId'>;
const executionIdentity = (body: OutcomeBody) => `patchtour:${canonicalSha256V1({ schema: 'atlas.patch-tournament.execution-id.v1', body })}`;

/** One outcome per ranked candidate. `verifiedEvidenceRefs` must come from the independent verifier table, never from the checks themselves. */
export function buildPatchOutcomesV1(params: { plan: PatchTournamentPlan; verifiedEvidenceRefs: ReadonlySet<string> | readonly string[] }): PatchOutcomeV1[] {
  const verified = params.verifiedEvidenceRefs instanceof Set ? params.verifiedEvidenceRefs as ReadonlySet<string> : new Set(params.verifiedEvidenceRefs as readonly string[]);
  const acePacketChecksum = canonicalSha256V1(params.plan.acePacket);
  const compileErrorDigest = sha256(params.plan.compileError);
  return params.plan.rankedCandidates.map((candidate) => {
    const checks = [
      ...candidate.staticChecks.map((c) => normaliseCheck('static', c, verified)),
      ...candidate.focusedTests.map((c) => normaliseCheck('focused_test', c, verified)),
    ];
    const body: OutcomeBody = {
      schema: PATCH_OUTCOME_SCHEMA, tournamentId: params.plan.tournamentId, candidateId: candidate.candidateId, runId: candidate.runId,
      workspaceId: params.plan.workspaceId, workspaceRevision: params.plan.workspaceRevision, candidateSourceRevision: candidate.sourceRevision,
      baseBranch: params.plan.baseBranch, patchDigest: candidate.patchDigest, compileErrorDigest, acePacketChecksum,
      touchedFiles: [...candidate.touchedFiles], checks, riskSignals: [...(candidate.riskSignals ?? [])],
      rank: candidate.rank, score: candidate.score, reviewStatus: candidate.reviewStatus, outcome: classifyOutcome(checks),
      independentlyReverified: false, canonicalAuthority: false, appliedToWorkspace: false, rewardAssigned: false, noTraining: true,
    };
    return PatchOutcomeSchema.parse({ ...body, executionId: executionIdentity(body) });
  });
}

export interface PatchOutcomeReceiptRowV1 {
  execution_id: string; workflow_id: string; action_id: string; dag_node_id: string; stage: string; logical_lane: string;
  algorithm_class: string; algorithm: string; geometry: string; metric: string; compute_backend: string; compilation_mode: string;
  transport: string; serialization: string; source_snapshot_revision: string; representation_revision: null;
  graph_snapshot_revision: null; relationship_snapshot_revision: null; input_checksum: string; output_checksum: string;
  manifest_checksum: string; manifest: { outcome: PatchOutcomeV1 };
}

export const patchOutcomeInputChecksumV1 = (o: PatchOutcomeV1) => canonicalSha256V1({
  schema: 'atlas.patch-tournament.input.v1', compileErrorDigest: o.compileErrorDigest, patchDigest: o.patchDigest,
  workspaceRevision: o.workspaceRevision, acePacketChecksum: o.acePacketChecksum,
  checks: o.checks.map((c) => ({ kind: c.kind, name: c.name, commandIdentity: c.commandIdentity })),
});
export const patchOutcomeOutputChecksumV1 = (o: PatchOutcomeV1) => canonicalSha256V1({
  schema: 'atlas.patch-tournament.output.v1', outcome: o.outcome, checks: o.checks.map((c) => ({ name: c.name, passed: c.passed, evidenceVerified: c.evidenceVerified })),
});
export const patchOutcomeManifestChecksumV1 = (o: PatchOutcomeV1) => canonicalSha256V1({ schema: 'atlas.patch-tournament.manifest.v1', outcome: o });

/** Maps onto the EXISTING columns; free-text lane/class values only (the table has no enum for them). */
export function toPatchOutcomeReceiptRowV1(outcome: PatchOutcomeV1): PatchOutcomeReceiptRowV1 {
  const o = PatchOutcomeSchema.parse(outcome);
  return {
    execution_id: o.executionId, workflow_id: o.tournamentId, action_id: o.candidateId, dag_node_id: 'atlas:repair:patch_tournament',
    stage: 'candidate_verification', logical_lane: 'agentic_repair', algorithm_class: 'patch_candidate_check',
    algorithm: 'isolated_worktree_checks', geometry: 'none', metric: 'check_outcome', compute_backend: 'cpu_worktree',
    compilation_mode: 'none', transport: 'local', serialization: 'json', source_snapshot_revision: o.workspaceRevision,
    representation_revision: null, graph_snapshot_revision: null, relationship_snapshot_revision: null,
    input_checksum: patchOutcomeInputChecksumV1(o), output_checksum: patchOutcomeOutputChecksumV1(o),
    manifest_checksum: patchOutcomeManifestChecksumV1(o), manifest: { outcome: o },
  };
}

export type PersistPatchOutcomeResultV1 = { status: 'INSERTED' | 'IDEMPOTENT'; executionId: string };

/** Idempotent by execution id; a changed body under the same id is rejected, never overwritten. Re-validates before writing. */
export async function persistPatchOutcomeReceiptV1(client: SqlClientV1, row: PatchOutcomeReceiptRowV1): Promise<PersistPatchOutcomeResultV1> {
  const outcome = PatchOutcomeSchema.parse(row.manifest.outcome);
  const body: OutcomeBody = (({ executionId: _id, ...rest }) => rest)(outcome);
  if (executionIdentity(body) !== outcome.executionId || row.execution_id !== outcome.executionId) throw new Error('PATCH_OUTCOME_ID_MISMATCH');
  if (row.manifest_checksum !== patchOutcomeManifestChecksumV1(outcome)) throw new Error('PATCH_OUTCOME_MANIFEST_CHECKSUM_MISMATCH');
  if (row.input_checksum !== patchOutcomeInputChecksumV1(outcome)) throw new Error('PATCH_OUTCOME_INPUT_CHECKSUM_MISMATCH');
  if (row.output_checksum !== patchOutcomeOutputChecksumV1(outcome)) throw new Error('PATCH_OUTCOME_OUTPUT_CHECKSUM_MISMATCH');
  if (row.algorithm_class !== 'patch_candidate_check' || row.logical_lane !== 'agentic_repair') throw new Error('PATCH_OUTCOME_LANE_MISMATCH');

  const values = [
    row.execution_id, row.workflow_id, row.action_id, row.dag_node_id, row.stage, row.logical_lane, row.algorithm_class, row.algorithm,
    row.geometry, row.metric, row.compute_backend, row.compilation_mode, row.transport, row.serialization, row.source_snapshot_revision,
    row.representation_revision, row.graph_snapshot_revision, row.relationship_snapshot_revision, row.input_checksum, row.output_checksum,
    row.manifest_checksum, JSON.stringify(row.manifest),
  ];
  const inserted = await client.query(ALGORITHM_RECEIPT_INSERT_SQL, values);
  if (inserted.rows.length === 1) return { status: 'INSERTED', executionId: row.execution_id };
  const existing = await client.query('SELECT manifest_checksum FROM atlas_algorithm_execution_receipts WHERE execution_id = $1', [row.execution_id]);
  if (existing.rows[0]?.manifest_checksum === row.manifest_checksum) return { status: 'IDEMPOTENT', executionId: row.execution_id };
  throw new Error(`PATCH_OUTCOME_CONFLICT:${row.execution_id}`);
}
