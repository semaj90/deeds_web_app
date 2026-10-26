// sveltekit-frontend/src/lib/server/agent/atlas-rank-input-adapter-v1.ts
import { createHash } from 'node:crypto';

export const ATLAS_RANK_INPUT_SCHEMA_V1 = 'atlas_rank_input_v1' as const;
export const ATLAS_RANK_RECEIPT_SCHEMA_V1 = 'atlas_rank_scoring_receipt_v1' as const;

export const INVESTIGATION_STATES = 4 as const;
export const FEATURE_CHANNELS = 6 as const;
export const FEATURES_PER_CANDIDATE = 24 as const; // 4 x 6
export const MAX_RANK_BATCH_SIZE = 256 as const;   // Safe ceiling for <1 GiB sm_86 VRAM budget

export interface SealedCandidateOrdinalSetV1 {
  readonly sealed: true;
  readonly ordinals: readonly number[];
  readonly setDigest: string;
}

export interface CandidateEvidenceRefV1 {
  readonly candidateOrdinal: number;
  readonly evidenceRevision: string;
  readonly featureProjectionRevision: string;
  readonly receiptId?: string;
}

export interface AtlasRankInputV1 {
  readonly schema: typeof ATLAS_RANK_INPUT_SCHEMA_V1;
  readonly queryDigest: string;
  readonly producerRevision: string;
  readonly candidateSet: SealedCandidateOrdinalSetV1;
  /** Flattened [B * 4 * 6] contiguous Float32Array */
  readonly features: Float32Array;
  /** Flattened [B * 4 * 6] contiguous Uint8Array with strict 0 | 1 values */
  readonly presenceMask: Uint8Array;
  readonly evidenceRefs: readonly CandidateEvidenceRefV1[];
}

export interface AtlasRankScoringReceiptV1 {
  readonly schema: typeof ATLAS_RANK_RECEIPT_SCHEMA_V1;
  readonly queryDigest: string;
  readonly candidateOrderDigest: string;
  readonly featureTensorChecksum: string;
  readonly producerRevision: string;
  readonly computeBackend: 'cpu_oracle' | 'simt_sm86' | 'cutile_sm86' | 'cublaslt_sm86';
  readonly batchSize: number;
  readonly scores: readonly number[];
}

/**
 * Enforces all pre-GEMM invariants before dispatching to the 4x6 scorer or NES LUT batch GEMM:
 * 1. Schema match & sealed ordinal set
 * 2. Batch size bounds (1 <= B <= MAX_RANK_BATCH_SIZE)
 * 3. Candidate ordinal uniqueness & non-negative integer addressing
 * 4. Exact B x 4 x 6 (24 * B) contiguous tensor & mask lengths
 * 5. Finite float values in features & strict binary {0, 1} values in presenceMask
 * 6. Revision agreement between evidenceRefs and featureProjectionRevision
 */
export function validateAtlasRankInputV1(input: AtlasRankInputV1): void {
  if (input.schema !== ATLAS_RANK_INPUT_SCHEMA_V1) {
    throw new Error(`Invalid schema: expected ${ATLAS_RANK_INPUT_SCHEMA_V1}, got ${input.schema}`);
  }

  if (!input.candidateSet || input.candidateSet.sealed !== true) {
    throw new Error('Candidate ordinal set must be explicitly sealed before rank adaptation.');
  }

  const B = input.candidateSet.ordinals.length;
  if (B <= 0 || B > MAX_RANK_BATCH_SIZE) {
    throw new Error(`Batch size B=${B} out of bounds (must be 1..${MAX_RANK_BATCH_SIZE}).`);
  }

  // Verify uniqueness and valid ordinal addressing
  const seenOrdinals = new Set<number>();
  for (let i = 0; i < B; i++) {
    const ord = input.candidateSet.ordinals[i];
    if (!Number.isInteger(ord) || ord < 0) {
      throw new Error(`Invalid candidate ordinal at index ${i}: ${ord}`);
    }
    if (seenOrdinals.has(ord)) {
      throw new Error(`Duplicate candidate ordinal detected: ${ord}`);
    }
    seenOrdinals.add(ord);
  }

  const expectedElements = B * FEATURES_PER_CANDIDATE;
  if (input.features.length !== expectedElements) {
    throw new Error(
      `Feature tensor length mismatch: expected ${expectedElements} (${B}x4x6), got ${input.features.length}`
    );
  }

  if (input.presenceMask.length !== expectedElements) {
    throw new Error(
      `Presence mask length mismatch: expected ${expectedElements} (${B}x4x6), got ${input.presenceMask.length}`
    );
  }

  for (let i = 0; i < expectedElements; i++) {
    if (!Number.isFinite(input.features[i])) {
      throw new Error(`Non-finite feature value at flat index ${i}: ${input.features[i]}`);
    }
    const maskVal = input.presenceMask[i];
    if (maskVal !== 0 && maskVal !== 1) {
      throw new Error(`Presence mask at flat index ${i} must be 0 or 1, got ${maskVal}`);
    }
  }

  if (input.evidenceRefs.length !== B) {
    throw new Error(
      `Evidence reference count (${input.evidenceRefs.length}) must equal batch size B (${B}).`
    );
  }

  for (let i = 0; i < B; i++) {
    const ref = input.evidenceRefs[i];
    const expectedOrdinal = input.candidateSet.ordinals[i];
    if (ref.candidateOrdinal !== expectedOrdinal) {
      throw new Error(
        `Evidence ordinal mismatch at index ${i}: expected ${expectedOrdinal}, got ${ref.candidateOrdinal}`
      );
    }
    if (
      !ref.evidenceRevision ||
      !ref.featureProjectionRevision ||
      ref.evidenceRevision !== ref.featureProjectionRevision
    ) {
      throw new Error(
        `Revision drift at ordinal ${expectedOrdinal}: evidenceRevision (${ref.evidenceRevision}) !== featureProjectionRevision (${ref.featureProjectionRevision})`
      );
    }
  }
}

/**
 * Produces the canonical scoring receipt digesting candidate order and tensor payload
 * for persistence into atlas_algorithm_execution_receipts (manifest jsonb).
 */
export function buildAtlasRankScoringReceiptV1(
  input: AtlasRankInputV1,
  scores: Float32Array | readonly number[],
  computeBackend: AtlasRankScoringReceiptV1['computeBackend']
): AtlasRankScoringReceiptV1 {
  validateAtlasRankInputV1(input);

  const B = input.candidateSet.ordinals.length;
  if (scores.length !== B) {
    throw new Error(`Scores length (${scores.length}) must match batch size B (${B}).`);
  }

  for (let i = 0; i < B; i++) {
    if (!Number.isFinite(scores[i])) {
      throw new Error(`Non-finite score at index ${i}: ${scores[i]}`);
    }
  }

  const candidateOrderDigest = createHash('sha256')
    .update(JSON.stringify(input.candidateSet.ordinals))
    .digest('hex');

  const featureTensorChecksum = createHash('sha256')
    .update(
      Buffer.from(
        input.features.buffer,
        input.features.byteOffset,
        input.features.byteLength
      )
    )
    .digest('hex');

  return {
    schema: ATLAS_RANK_RECEIPT_SCHEMA_V1,
    queryDigest: input.queryDigest,
    candidateOrderDigest,
    featureTensorChecksum,
    producerRevision: input.producerRevision,
    computeBackend,
    batchSize: B,
    scores: Array.from(scores),
  };
}

export const DEFAULT_ORACLE_FEATURE_WEIGHTS: readonly number[] = [
  // State 0: Raw AST tokens / exact matches
  0.10, 0.08, 0.06, 0.05, 0.04, 0.03,
  // State 1: Symbol resolution & type relations
  0.08, 0.07, 0.06, 0.05, 0.04, 0.03,
  // State 2: Structural qualification & topology
  0.07, 0.06, 0.05, 0.04, 0.03, 0.02,
  // State 3: Execution receipts & verified outcomes
  0.05, 0.04, 0.03, 0.02, 0.01, 0.01,
];

/**
 * Deterministic CPU Oracle evaluator for AtlasRankInputV1.
 * Evaluates masked linear projection across candidate features [B, 24]
 * and returns an authenticated AtlasRankScoringReceiptV1.
 */
export function scoreAtlasRankInputCpuOracle(
  input: AtlasRankInputV1,
  customWeights?: Float32Array | readonly number[]
): AtlasRankScoringReceiptV1 {
  validateAtlasRankInputV1(input);

  const weights = customWeights ?? DEFAULT_ORACLE_FEATURE_WEIGHTS;
  if (weights.length !== FEATURES_PER_CANDIDATE) {
    throw new Error(
      `Oracle weights length mismatch: expected ${FEATURES_PER_CANDIDATE}, got ${weights.length}`
    );
  }

  const B = input.candidateSet.ordinals.length;
  const scores = new Float32Array(B);

  for (let i = 0; i < B; i++) {
    const baseOffset = i * FEATURES_PER_CANDIDATE;
    let sum = 0.0;
    for (let f = 0; f < FEATURES_PER_CANDIDATE; f++) {
      const idx = baseOffset + f;
      const maskVal = input.presenceMask[idx];
      if (maskVal === 1) {
        sum += input.features[idx] * (weights[f] as number);
      }
    }
    scores[i] = sum;
  }

  return buildAtlasRankScoringReceiptV1(input, scores, 'cpu_oracle');
}

