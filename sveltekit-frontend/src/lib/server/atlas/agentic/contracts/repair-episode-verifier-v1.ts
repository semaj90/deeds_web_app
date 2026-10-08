import { createHash } from 'node:crypto';
import { buildLearningOutcomeV1, type LearningOutcomeV1, type TaskEpisodeIdentityV1 } from './learning-outcome-v1.js';

/**
 * RepairEpisodeVerifierV1 (RL-DATA-03A): PURE, fixture-driven. Compares before/after error fingerprints and emits the
 * validator verdict plus the two LearningOutcomeV1 rows of a repair episode. It applies nothing, reads no datastore and
 * has no mutation authority; the apply step is a separate, governed owner (not built). Fingerprints are supplied by the
 * caller (e.g. from bounded svelte-check evidence capture) and must be bound to the same source/workspace revisions.
 */
export const REPAIR_EPISODE_VALIDATOR_REVISION = 'repair-episode-verifier-v1' as const;

export type RepairVerdictV1 = 'PASS' | 'REGRESSED' | 'FAILURE';

export interface RepairEvidenceSnapshotV1 {
  workspaceRevision: string;
  sourceRevision: string;
  fingerprints: string[];
}

export interface RepairVerificationV1 {
  schema: 'atlas.repair-episode-verification.v1';
  verdict: RepairVerdictV1;
  targetFingerprints: string[];
  targetRemaining: string[];
  newFingerprints: string[];
  beforeEvidenceChecksum: string;
  afterEvidenceChecksum: string;
  targetFingerprintCountBefore: number;
  targetFingerprintCountAfter: number;
  newFingerprintCount: number;
  validatorRevision: typeof REPAIR_EPISODE_VALIDATOR_REVISION;
  checksum: string;
  canonicalAuthority: false;
}

const sha = (v: unknown) => createHash('sha256').update(JSON.stringify(v), 'utf8').digest('hex');

/** taskId derived from the evidence-only TaskCandidate: stable for the same revisions + target fingerprints. */
export function deriveTaskIdFromCandidate(input: { workspaceRevision: string; sourceRevision: string; targetFingerprints: string[] }): string {
  return `task:${sha({ w: input.workspaceRevision, s: input.sourceRevision, t: [...input.targetFingerprints].sort() }).slice(0, 32)}`;
}

/**
 * Line-insensitive TypeScript/Svelte error identity: {file, code, normalized message}. The capture script's `errorId`
 * also hashes line/column, so an edit that merely shifts lines would change every untouched error's id and read as a
 * regression. Use this for before/after comparison; keep `errorId` for per-occurrence evidence.
 */
export function repairErrorFingerprintV1(e: { file: string; code: string | number; message: string }): string {
  const file = e.file.replaceAll('\\', '/').replace(/^\.\//, '');
  const message = e.message.replace(/\s+/g, ' ').trim();
  return `tsfp:${sha({ file, code: String(e.code), message }).slice(0, 32)}`;
}

export function verifyRepairEpisodeV1(input: { before: RepairEvidenceSnapshotV1; after: RepairEvidenceSnapshotV1; targetFingerprints: string[] }): RepairVerificationV1 {
  if (input.targetFingerprints.length === 0) throw new Error('REPAIR_TARGET_FINGERPRINTS_EMPTY');
  if (input.before.workspaceRevision !== input.after.workspaceRevision) throw new Error('REPAIR_EVIDENCE_WORKSPACE_REVISION_MISMATCH');
  // Multiset semantics: identical errors share one fingerprint, so a repair is "fixed" when the count of a target drops.
  const count = (list: string[]) => list.reduce((m, f) => m.set(f, (m.get(f) ?? 0) + 1), new Map<string, number>());
  const beforeCounts = count(input.before.fingerprints);
  const afterCounts = count(input.after.fingerprints);
  const targets = [...new Set(input.targetFingerprints)];
  for (const t of targets) if (!beforeCounts.has(t)) throw new Error('REPAIR_TARGET_NOT_IN_BEFORE_EVIDENCE');
  const targetRemaining = targets.filter((t) => (afterCounts.get(t) ?? 0) >= (beforeCounts.get(t) ?? 0)).sort();
  const targetSet = new Set(targets);
  const newFingerprints = [...afterCounts.entries()].filter(([f, n]) => !targetSet.has(f) && n > (beforeCounts.get(f) ?? 0)).map(([f]) => f).sort();
  const verdict: RepairVerdictV1 = targetRemaining.length > 0 ? 'FAILURE' : newFingerprints.length > 0 ? 'REGRESSED' : 'PASS';
  const evidenceChecksum = (e: RepairEvidenceSnapshotV1) => `sha256:${sha({ w: e.workspaceRevision, s: e.sourceRevision, f: [...e.fingerprints].sort() })}`;
  const unsigned = {
    schema: 'atlas.repair-episode-verification.v1' as const, verdict, targetFingerprints: [...targets].sort(), targetRemaining, newFingerprints,
    beforeEvidenceChecksum: evidenceChecksum(input.before), afterEvidenceChecksum: evidenceChecksum(input.after),
    targetFingerprintCountBefore: targets.length, targetFingerprintCountAfter: targetRemaining.length, newFingerprintCount: newFingerprints.length,
    validatorRevision: REPAIR_EPISODE_VALIDATOR_REVISION, canonicalAuthority: false as const };
  return { ...unsigned, checksum: `sha256:${sha(unsigned)}` };
}

/** attempt 0 = FAILURE (target present before); attempt 1 = RECOVERED | REGRESSED | FAILURE, linked by retryOf. */
export function buildRepairEpisodeOutcomesV1(input: {
  taskId: string;
  toolName: string;
  repairAttemptId: string;
  attempt0: { executionId: string; episode?: TaskEpisodeIdentityV1 | null };
  attempt1: { executionId: string; episode?: TaskEpisodeIdentityV1 | null; latencyMs?: number; evidenceRefs: string[]; validatorReceiptId: string };
  verification: RepairVerificationV1;
  retryCount?: number;
}): { attempt0: LearningOutcomeV1; attempt1: LearningOutcomeV1 } {
  const v = input.verification;
  const common = { taskId: input.taskId, repairAttemptId: input.repairAttemptId, toolName: input.toolName, recoveryAttempted: true };
  const attempt0 = buildLearningOutcomeV1({ ...common, executionId: input.attempt0.executionId, episode: input.attempt0.episode ?? null, transportResultClass: 'tool_error', success: false, evidenceRefs: v.targetFingerprints });
  const ep1 = input.attempt1.episode ? { ...input.attempt1.episode, validatorReceiptId: input.attempt1.validatorReceiptId } : null;
  const attempt1 = buildLearningOutcomeV1({
    ...common,
    executionId: input.attempt1.executionId,
    episode: ep1,
    retryOf: input.attempt0.executionId,
    retryCount: input.retryCount ?? 1,
    transportResultClass: v.verdict === 'FAILURE' ? 'tool_error' : 'answer',
    success: v.verdict !== 'FAILURE',
    validator: { passed: v.verdict === 'PASS', validatorRevision: v.validatorRevision },
    taskCompleted: v.verdict === 'PASS',
    regressionIntroduced: v.verdict === 'REGRESSED',
    latencyMs: input.attempt1.latencyMs ?? null,
    evidenceRefs: [...input.attempt1.evidenceRefs, v.beforeEvidenceChecksum, v.afterEvidenceChecksum, v.checksum],
  });
  return { attempt0, attempt1 };
}
