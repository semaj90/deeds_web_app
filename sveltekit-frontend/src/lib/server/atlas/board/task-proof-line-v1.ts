import type { CanonicalReceiptRecordV1, ReceiptLookupResultV1 } from '../cache/receipt-dictionary-v1';
import { resolveTaskReceiptsV1 } from '../cache/receipt-dictionary-v1';

/**
 * TASK-PROOF-LINE-01
 *
 * A pure per-task projection of the workboard stableKey, receipts the receipt dictionary has already looked
 * up, and an optional feature-label binding. It never reads a store and never infers a mapping. The four
 * claims stay separate and none implies another:
 *   checked              the source checkbox is ticked (a claim in a Markdown file, not evidence)
 *   targetedTestsPassed  a committed, VERIFIED TEST_EXECUTION receipt says passed at the CURRENT source revision
 *   independentReadback  a VERIFIER_RESULT receipt says VERIFIED_PASS at the same source revision
 *   completionAuthorized the caller's explicit grant AND both of the above AND an unambiguous binding
 * featureLabel is always a proposal here; canonical feature authority belongs to the feature registry.
 */

export const TASK_PROOF_LINE_SCHEMA = 'atlas.task-proof-line.v1' as const;
export interface WorkboardTaskRefV1 {
  readonly stableKey: string;
  readonly sourceCheckboxState: 'DONE' | 'OPEN' | string;
  readonly blockHash: string;
  /** Direct, opt-in receipt reference parsed from the task's WFU `proof:` declaration. */
  readonly proofReceiptId?: string | null;
  /** Shape emitted by the existing workboard parser for a task's WFU declaration. */
  readonly declared?: { readonly proofReceiptId?: string | null } | null;
}

export interface FeatureBindingV1 {
  readonly status: 'ADMITTED' | 'PROPOSAL_ONLY';
  readonly bindingChecksum?: string;
}

export interface TaskProofLineInputV1 {
  readonly task: WorkboardTaskRefV1;
  /** Explicit stableKey -> receiptIds mapping. Null when none exists; nothing is inferred. */
  readonly mapping: ReadonlyMap<string, readonly string[]> | null;
  /** Results already produced by the receipt dictionary, any order, for the receipt ids in the mapping. */
  readonly receipts: readonly ReceiptLookupResultV1[];
  readonly currentSourceRevision: string | null;
  /** How many workboard rows share this task's blockHash (1 = unique). */
  readonly blockHashGroupSize: number;
  /** receiptId -> stableKeys that claim it. More than one claimant makes the binding ambiguous. */
  readonly receiptClaimants?: ReadonlyMap<string, readonly string[]>;
  readonly completionGrant: boolean;
  readonly featureLabel: string | null;
  readonly featureBinding?: FeatureBindingV1 | null;
}

export type ProofLineStatusV1 =
  | 'UNRESOLVED_TASK_MAPPING'
  | 'AMBIGUOUS_BINDING'
  | 'UNAUTHORIZED_RECEIPT_REFERENCE'
  | 'STALE_SOURCE_REVISION'
  | 'RECEIPT_MISSING'
  | 'UNVERIFIED'
  | 'TESTS_PASSED_NO_READBACK'
  | 'VERIFIED_NOT_AUTHORIZED'
  | 'COMPLETION_AUTHORIZED';

export interface TaskProofLineV1 {
  readonly schema: typeof TASK_PROOF_LINE_SCHEMA;
  readonly stableKey: string;
  readonly checked: boolean;
  readonly targetedTestsPassed: boolean;
  readonly independentReadback: boolean;
  readonly completionAuthorized: boolean;
  readonly status: ProofLineStatusV1;
  readonly receiptIds: readonly string[];
  readonly warnings: readonly string[];
  readonly featureLabel: {
    readonly value: string | null;
    readonly status: 'PROPOSED';
    readonly canonicalAuthority: false;
  };
}

const usable = (r: ReceiptLookupResultV1): CanonicalReceiptRecordV1 | null =>
  (r.status === 'HIT' || r.status === 'MISS_LOADED') && r.record && r.record.committed === true ? r.record : null;

export function projectTaskProofLineV1(input: TaskProofLineInputV1): TaskProofLineV1 {
  const { task } = input;
  const warnings: string[] = [];
  if (input.blockHashGroupSize > 1) warnings.push('AMBIGUOUS_BLOCK_HASH');

  // Labels remain descriptive proposals here. This proof projection is not the feature registry authority.
  const featureLabel = Object.freeze({
    value: input.featureLabel,
    status: 'PROPOSED' as const,
    canonicalAuthority: false,
  });

  const checked = task.sourceCheckboxState === 'DONE';
  const mapped = resolveTaskReceiptsV1({ taskStableKey: task.stableKey, mapping: input.mapping });
  const proofReceiptId = (task.proofReceiptId ?? task.declared?.proofReceiptId)?.trim() || null;
  // `proof:` is the exact task-authored edge. Keep existing explicit mapping for a separate verifier receipt,
  // but never substitute a filename-derived or blockHash-derived test receipt for the declared id.
  const mappedVerifierIds = mapped.status === 'RESOLVED'
    ? mapped.receiptIds.filter((id) => input.receipts.some((item) => usable(item)?.receiptId === id && usable(item)?.receiptKind === 'VERIFIER_RESULT'))
    : [];
  const receiptIds = proofReceiptId
    ? [...new Set([proofReceiptId, ...mappedVerifierIds])]
    : mapped.receiptIds;
  const resolved = receiptIds.length > 0
    ? { status: 'RESOLVED' as const, receiptIds }
    : { status: 'UNRESOLVED_TASK_MAPPING' as const, receiptIds: [] as readonly [] };
  const finish = (status: ProofLineStatusV1, tests = false, readback = false, authorized = false): TaskProofLineV1 =>
    Object.freeze({
      schema: TASK_PROOF_LINE_SCHEMA,
      stableKey: task.stableKey,
      checked,
      targetedTestsPassed: tests,
      independentReadback: readback,
      completionAuthorized: authorized,
      status,
      receiptIds: resolved.receiptIds,
      warnings: Object.freeze(warnings),
      featureLabel,
    });

  if (resolved.status === 'UNRESOLVED_TASK_MAPPING') return finish('UNRESOLVED_TASK_MAPPING');

  // A receipt claimed by more than one task cannot prove any of them.
  const ambiguous = resolved.receiptIds.some((id) => (input.receiptClaimants?.get(id) ?? [task.stableKey]).length > 1);
  if (ambiguous) return finish('AMBIGUOUS_BINDING');

  if (input.receipts.some((r) => r.status === 'REJECTED' && r.reason === 'GRANT_REVOKED')) {
    return finish('UNAUTHORIZED_RECEIPT_REFERENCE');
  }
  if (input.receipts.some((r) => r.status === 'REJECTED' && r.reason === 'STALE_SOURCE_REVISION')) {
    return finish('STALE_SOURCE_REVISION');
  }

  const records = input.receipts.map(usable).filter((r): r is CanonicalReceiptRecordV1 => r !== null);
  if (records.length === 0) return finish('RECEIPT_MISSING');

  const rev = input.currentSourceRevision;
  const current = (r: CanonicalReceiptRecordV1) => rev !== null && r.sourceRevision === rev;
  if (records.every((r) => !current(r))) return finish('STALE_SOURCE_REVISION');

  const tests = records.some(
    (r) => r.receiptKind === 'TEST_EXECUTION' && current(r) && r.verificationStatus === 'VERIFIED' && r.payload.status === 'passed',
  );
  const readback = records.some(
    (r) => r.receiptKind === 'VERIFIER_RESULT' && current(r) && r.verificationStatus === 'VERIFIED_PASS',
  );

  if (!tests) return finish('UNVERIFIED');
  if (!readback) return finish('TESTS_PASSED_NO_READBACK', true, false);
  if (!input.completionGrant) return finish('VERIFIED_NOT_AUTHORIZED', true, true, false);
  return finish('COMPLETION_AUTHORIZED', true, true, true);
}
