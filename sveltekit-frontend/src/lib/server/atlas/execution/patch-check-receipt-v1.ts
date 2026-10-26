import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import type { SqlClientV1 } from './topk-execution-receipt-v1.js';

/**
 * Check receipts for patch-tournament candidates (PATCH-CHECK-RECEIPT-01), stored in the EXISTING
 * `atlas_test_execution_receipts` (framework `patch-check/<kind>`) and independently verified into the EXISTING
 * `atlas_receipt_verifier_results_v1`, so `resolveVerifiedEvidenceRefsFromVerifierResults` can resolve them.
 *
 * A receipt records what a check observed. It is not trusted: the verifier receives the PREIMAGE (the exact inputs the
 * receipt's `report_checksum` commits to), rebuilds the patched file from the base text plus the recorded edits, re-runs
 * the check in a fresh directory via an injected replay function, and compares. Mismatch is never repaired.
 * Nothing here writes reward, applies a patch, or stores model reasoning.
 */
export const PATCH_CHECK_SCHEMA = 'atlas.patch-check-receipt.v1' as const;
export const PATCH_CHECK_PRODUCER_REVISION = 'patch-check-receipt-producer-v1' as const;
export const PATCH_CHECK_VERIFIER_ID = 'patch-check-replay-independent-verifier-v1' as const;
const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
export const PATCH_CHECK_VERIFIER_REVISION =
  `sha256:${sha256('atlas.patch-check.replay.v1|bind preimage to report_checksum|rebuild final text from base+edits|rerun apply/tsc/scope in a fresh directory|compare observed')}` as const;

const hex64 = z.string().regex(/^[a-f0-9]{64}$/);
const safeRelPath = z.string().min(1).max(300).refine((p) => !p.startsWith('/') && !/^[A-Za-z]:/.test(p) && !p.split('/').includes('..'), 'PATH_NOT_RELATIVE');

export const PatchEditSchema = z.object({ find: z.string().min(1).max(20_000), replace: z.string().max(20_000) }).strict();
export type PatchEditV1 = z.infer<typeof PatchEditSchema>;
export const CheckKindSchema = z.enum(['apply', 'tsc', 'scope']);
export type CheckKindV1 = z.infer<typeof CheckKindSchema>;

export const CheckPreimageSchema = z.object({
  schema: z.literal(PATCH_CHECK_SCHEMA),
  kind: CheckKindSchema,
  candidateId: z.string().min(1),
  runId: z.string().min(1),
  targetPath: safeRelPath,
  baseFileDigest: hex64,
  editsDigest: hex64,
  finalFileDigest: hex64.nullable(),
  commandIdentity: hex64,
  observed: z.object({ passed: z.boolean(), details: z.array(z.string().max(500)).max(20) }).strict(),
}).strict();
export type CheckPreimageV1 = z.infer<typeof CheckPreimageSchema>;

export interface ReplayResultV1 {
  applyOk: boolean;
  applyReason: string | null;
  finalFileDigest: string | null;
  tscErrors: string[];
  changedFiles: string[];
  changedLines: number;
}
export type ReplayFnV1 = (baseText: string, edits: readonly PatchEditV1[]) => ReplayResultV1 | Promise<ReplayResultV1>;

export const editsDigestV1 = (edits: readonly PatchEditV1[]) => canonicalSha256V1({ schema: 'atlas.patch-edits.v1', edits });
export const fileDigestV1 = (text: string) => sha256(text);
export const checkCommandIdentityV1 = (command: string) => sha256(command.trim());

/** One deterministic observed value per check kind, derived ONLY from a replay result. The executor and the verifier both call this. */
export function observedFromReplayV1(kind: CheckKindV1, replay: ReplayResultV1, targetBasename: string): CheckPreimageV1['observed'] {
  if (kind === 'apply') return { passed: replay.applyOk, details: replay.applyOk ? [] : [replay.applyReason ?? 'APPLY_FAILED'] };
  if (!replay.applyOk) return { passed: false, details: ['NOT_RUN_APPLY_FAILED'] };
  if (kind === 'tsc') return { passed: replay.tscErrors.length === 0, details: replay.tscErrors.slice(0, 20).map((l) => l.slice(0, 500)) };
  const scopeOk = replay.changedFiles.length === 1 && replay.changedFiles[0] === targetBasename && replay.changedLines > 0 && replay.changedLines <= 40;
  return { passed: scopeOk, details: [`changedFiles=${replay.changedFiles.join(',')}`, `changedLines=${replay.changedLines}`] };
}

export interface CheckReceiptRowV1 {
  execution_receipt_id: string; stable_test_id: null; test_key: string; run_revision: string; source_ref: string; source_revision: string;
  framework: string; status: 'passed' | 'failed'; duration_ms: number | null; failure_messages: string[]; report_checksum: string;
  observed_at_ms: number | null; producer_revision: string;
}

export const checkReportChecksumV1 = (preimage: CheckPreimageV1) => canonicalSha256V1(preimage);

export function buildCheckReceiptV1(input: { preimage: CheckPreimageV1; durationMs?: number | null; observedAtMs?: number | null }): { row: CheckReceiptRowV1; preimage: CheckPreimageV1 } {
  const preimage = CheckPreimageSchema.parse(input.preimage);
  const reportChecksum = checkReportChecksumV1(preimage);
  const testKey = `${preimage.kind}:${preimage.targetPath}::${preimage.candidateId}`;
  const sourceRevision = `sha256:${preimage.finalFileDigest ?? preimage.baseFileDigest}`;
  const row: CheckReceiptRowV1 = {
    execution_receipt_id: sha256(`${testKey}|${preimage.runId}|${sourceRevision}|${reportChecksum}`).slice(0, 32), stable_test_id: null,
    test_key: testKey, run_revision: preimage.runId, source_ref: preimage.targetPath, source_revision: sourceRevision,
    framework: `patch-check/${preimage.kind}`, status: preimage.observed.passed ? 'passed' : 'failed', duration_ms: input.durationMs ?? null,
    failure_messages: preimage.observed.passed ? [] : preimage.observed.details, report_checksum: reportChecksum,
    observed_at_ms: input.observedAtMs ?? null, producer_revision: PATCH_CHECK_PRODUCER_REVISION,
  };
  return { row, preimage };
}

export interface VerifierResultRowV1 {
  execution_receipt_id: string; verifier_id: typeof PATCH_CHECK_VERIFIER_ID; verifier_revision: typeof PATCH_CHECK_VERIFIER_REVISION;
  verification_status: 'VERIFIED_PASS' | 'VERIFIED_FAIL' | 'UNVERIFIED' | 'FABRICATED'; evidence_resolved: boolean; computed_digest: string;
  command_identity: string | null; workspace_revision: string | null; source_revision: string | null; canonical: false;
}

/**
 * Independent replay verification. VERIFIED_PASS = the replay reproduced exactly the observed value the receipt commits to
 * (for a failed receipt this means "the failure is real"; the resolver still requires status `passed`).
 * FABRICATED = the replay contradicts the recorded pass/fail. VERIFIED_FAIL = same pass/fail but different details.
 * UNVERIFIED = the supplied preimage / base text / edits do not bind to the receipt, so nothing was replayed.
 */
export async function verifyCheckReceiptV1(params: {
  row: CheckReceiptRowV1; preimage: unknown; baseText: string; edits: readonly PatchEditV1[]; replay: ReplayFnV1; workspaceRevision?: string | null;
}): Promise<{ result: VerifierResultRowV1; reasons: string[] }> {
  const base = { execution_receipt_id: params.row.execution_receipt_id, verifier_id: PATCH_CHECK_VERIFIER_ID, verifier_revision: PATCH_CHECK_VERIFIER_REVISION, canonical: false as const };
  const unverified = (reasons: string[]) => ({
    result: { ...base, verification_status: 'UNVERIFIED' as const, evidence_resolved: false, computed_digest: `sha256:${params.row.report_checksum}`, command_identity: null,
      workspace_revision: params.workspaceRevision ?? null, source_revision: params.row.source_revision },
    reasons,
  });
  const parsed = CheckPreimageSchema.safeParse(params.preimage);
  if (!parsed.success) return unverified(['PREIMAGE_INVALID']);
  const pre = parsed.data;
  if (checkReportChecksumV1(pre) !== params.row.report_checksum) return unverified(['PREIMAGE_DOES_NOT_MATCH_REPORT_CHECKSUM']);
  if (fileDigestV1(params.baseText) !== pre.baseFileDigest) return unverified(['BASE_TEXT_DIGEST_MISMATCH']);
  if (editsDigestV1(params.edits) !== pre.editsDigest) return unverified(['EDITS_DIGEST_MISMATCH']);

  const replay = await params.replay(params.baseText, params.edits);
  const reasons: string[] = [];
  if ((replay.finalFileDigest ?? null) !== pre.finalFileDigest) reasons.push('FINAL_FILE_DIGEST_DIFFERS');
  const observed = observedFromReplayV1(pre.kind, replay, pre.targetPath.split('/').pop()!);
  const recomputed = checkReportChecksumV1({ ...pre, finalFileDigest: replay.finalFileDigest ?? null, observed });
  let status: VerifierResultRowV1['verification_status'] = 'VERIFIED_PASS';
  if (recomputed !== params.row.report_checksum) {
    status = observed.passed !== pre.observed.passed ? 'FABRICATED' : 'VERIFIED_FAIL';
    reasons.push(observed.passed !== pre.observed.passed ? 'REPLAY_CONTRADICTS_RECORDED_OUTCOME' : 'REPLAY_DETAILS_DIFFER');
  }
  return {
    result: { ...base, verification_status: status, evidence_resolved: true, computed_digest: `sha256:${recomputed}`, command_identity: pre.commandIdentity,
      workspace_revision: params.workspaceRevision ?? null, source_revision: params.row.source_revision },
    reasons,
  };
}

const RECEIPT_INSERT = `INSERT INTO atlas_test_execution_receipts (execution_receipt_id, stable_test_id, test_key, run_revision, source_ref, source_revision,
  framework, status, duration_ms, failure_messages, report_checksum, observed_at_ms, producer_revision)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13) ON CONFLICT (execution_receipt_id) DO NOTHING RETURNING execution_receipt_id`;
const VERIFIER_INSERT = `INSERT INTO atlas_receipt_verifier_results_v1 (execution_receipt_id, verifier_id, verifier_revision, verification_status,
  evidence_resolved, computed_digest, command_identity, workspace_revision, source_revision, canonical)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false) ON CONFLICT (execution_receipt_id, verifier_id, verifier_revision) DO NOTHING RETURNING verification_uuid`;

export async function persistCheckReceiptV1(client: SqlClientV1, row: CheckReceiptRowV1): Promise<'INSERTED' | 'IDEMPOTENT'> {
  const r = row;
  const ins = await client.query(RECEIPT_INSERT, [r.execution_receipt_id, r.stable_test_id, r.test_key, r.run_revision, r.source_ref, r.source_revision,
    r.framework, r.status, r.duration_ms, JSON.stringify(r.failure_messages), r.report_checksum, r.observed_at_ms, r.producer_revision]);
  if (ins.rows.length === 1) return 'INSERTED';
  const existing = await client.query('SELECT report_checksum FROM atlas_test_execution_receipts WHERE execution_receipt_id = $1', [r.execution_receipt_id]);
  if (existing.rows[0]?.report_checksum === r.report_checksum) return 'IDEMPOTENT';
  throw new Error(`CHECK_RECEIPT_CONFLICT:${r.execution_receipt_id}`);
}

export async function persistVerifierResultV1(client: SqlClientV1, v: VerifierResultRowV1): Promise<'INSERTED' | 'IDEMPOTENT'> {
  const ins = await client.query(VERIFIER_INSERT, [v.execution_receipt_id, v.verifier_id, v.verifier_revision, v.verification_status, v.evidence_resolved,
    v.computed_digest, v.command_identity, v.workspace_revision, v.source_revision]);
  if (ins.rows.length === 1) return 'INSERTED';
  const existing = await client.query(
    'SELECT verification_status, computed_digest FROM atlas_receipt_verifier_results_v1 WHERE execution_receipt_id = $1 AND verifier_id = $2 AND verifier_revision = $3',
    [v.execution_receipt_id, v.verifier_id, v.verifier_revision]);
  const e = existing.rows[0];
  if (e && e.verification_status === v.verification_status && e.computed_digest === v.computed_digest) return 'IDEMPOTENT';
  throw new Error(`CHECK_VERIFIER_CONFLICT:${v.execution_receipt_id}`);
}
