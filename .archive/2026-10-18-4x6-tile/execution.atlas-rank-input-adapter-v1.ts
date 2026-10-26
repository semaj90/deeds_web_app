import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  type InvestigationCandidateFeatureRow,
} from './atlas-feature-matrix-4x6-v1.js';
import {
  assertCandidateOrdinalMapIntegrityV1,
  candidateOrdinalMapV1Schema,
  resolveCanonicalCandidateByOrdinal,
  type CandidateOrdinalMapV1,
} from '../features/canonical-candidate-v1.js';

export const ATLAS_RANK_INPUT_SCHEMA = 'atlas.rank-input.v1' as const;
export const ATLAS_RANK_SCORING_RECEIPT_SCHEMA = 'atlas.rank-scoring-receipt.v1' as const;

export const FEATURES_PER_CANDIDATE = 24; // 4 states x 6 channels
export const MAX_CANDIDATES_BATCH = 4096;

export interface AtlasRankInputV1 {
  schema: typeof ATLAS_RANK_INPUT_SCHEMA;

  queryDigest: string;
  workspaceRevision: string;
  graphRevision: string;
  ordinalMapRevision: string;
  taxonomyRevision: string;
  featureSchemaRevision: string;
  evidenceRevision: string;

  candidateOrdinals: number[];
  features: Float32Array; // [B, 4, 6] -> contiguous B * 24 floats
  presentMask: Uint8Array; // [B, 4, 6] -> contiguous B * 24 bytes (0 or 1)

  evidenceRefs: string[];
}

export interface AtlasRankScoringReceiptV1 {
  schema: typeof ATLAS_RANK_SCORING_RECEIPT_SCHEMA;
  queryDigest: string;
  batchSize: number;
  candidateOrdinals: number[];
  ordinalMapRevision: string;
  workspaceRevision: string;
  graphRevision: string;
  taxonomyRevision: string;
  featureSchemaRevision: string;
  evidenceRevision: string;
  candidateOrderDigest: string;
  scores: number[];
  topKOrdinals: number[];
  outputChecksum: string;
  canonicalAuthority: false;
  writesPerformed: false;
}

export interface ValidateRankInputOptions {
  ordinalMap: CandidateOrdinalMapV1;
  expectedWorkspaceRevision: string;
  expectedGraphRevision: string;
  expectedOrdinalMapRevision: string;
  expectedTaxonomyRevision: string;
  expectedFeatureSchemaRevision: string;
  expectedEvidenceRevision: string;
}

/**
 * Validates an AtlasRankInputV1 payload before execution or GPU invocation.
 * Enforces B in [1, 4096], contiguous [B, 4, 6] bounds, ordinal uniqueness,
 * sealed mapping resolution, finite numbers, and revision matching.
 */
export function validateAtlasRankInputV1(
  input: AtlasRankInputV1,
  options: ValidateRankInputOptions
): { valid: boolean; error?: string } {
  try {
    const map = candidateOrdinalMapV1Schema.parse(options.ordinalMap);
    assertCandidateOrdinalMapIntegrityV1(map);
    if (input.ordinalMapRevision !== map.ordinalMapChecksum) {
      return { valid: false, error: 'ORDINAL_MAP_REVISION_MISMATCH' };
    }
    if (input.workspaceRevision !== map.workspaceRevision) {
      return { valid: false, error: 'ORDINAL_MAP_WORKSPACE_REVISION_MISMATCH' };
    }
    for (const ordinal of input.candidateOrdinals) {
      const candidate = resolveCanonicalCandidateByOrdinal(map, ordinal);
      if (candidate.graphRevision !== input.graphRevision) {
        return { valid: false, error: `CANDIDATE_GRAPH_REVISION_MISMATCH:${ordinal}` };
      }
    }
  } catch (error) {
    return { valid: false, error: `SEALED_ORDINAL_MAP_REJECTED: ${String(error)}` };
  }
  if (input.schema !== ATLAS_RANK_INPUT_SCHEMA) {
    return { valid: false, error: `INVALID_SCHEMA: expected ${ATLAS_RANK_INPUT_SCHEMA}, got ${input.schema}` };
  }

  const B = input.candidateOrdinals.length;
  if (B < 1 || B > MAX_CANDIDATES_BATCH) {
    return { valid: false, error: `BATCH_SIZE_OUT_OF_BOUNDS: batch size ${B} must be between 1 and ${MAX_CANDIDATES_BATCH}` };
  }

  if (input.features.length !== B * FEATURES_PER_CANDIDATE) {
    return {
      valid: false,
      error: `FEATURES_LENGTH_MISMATCH: expected ${B * FEATURES_PER_CANDIDATE} floats, got ${input.features.length}`,
    };
  }

  if (input.presentMask.length !== B * FEATURES_PER_CANDIDATE) {
    return {
      valid: false,
      error: `PRESENT_MASK_LENGTH_MISMATCH: expected ${B * FEATURES_PER_CANDIDATE} bytes, got ${input.presentMask.length}`,
    };
  }

  // Check ordinal uniqueness
  const seenOrdinals = new Set<number>();
  for (let i = 0; i < B; i++) {
    const ord = input.candidateOrdinals[i];
    if (!Number.isInteger(ord) || ord < 0) {
      return { valid: false, error: `INVALID_ORDINAL: ordinal ${ord} at index ${i} is not a non-negative integer` };
    }
    if (seenOrdinals.has(ord)) {
      return { valid: false, error: `DUPLICATE_CANDIDATE_ORDINAL: ordinal ${ord} appears more than once` };
    }
    seenOrdinals.add(ord);

  }

  // Check finite features and binary mask
  for (let i = 0; i < input.features.length; i++) {
    const f = input.features[i];
    if (!Number.isFinite(f)) {
      return { valid: false, error: `NON_FINITE_FEATURE: feature at index ${i} is ${f}` };
    }
    const m = input.presentMask[i];
    if (m !== 0 && m !== 1) {
      return { valid: false, error: `INVALID_MASK_VALUE: mask at index ${i} must be 0 or 1, got ${m}` };
    }
  }

  // Check revision bounds
  if (!input.queryDigest?.trim()) {
    return { valid: false, error: 'MISSING_QUERY_DIGEST' };
  }
  if (!input.workspaceRevision?.trim()) {
    return { valid: false, error: 'MISSING_WORKSPACE_REVISION' };
  }
  if (!input.ordinalMapRevision?.trim()) {
    return { valid: false, error: 'MISSING_ORDINAL_MAP_REVISION' };
  }
  if (!input.graphRevision?.trim() || !input.taxonomyRevision?.trim() ||
      !input.featureSchemaRevision?.trim() || !input.evidenceRevision?.trim()) {
    return { valid: false, error: 'MISSING_LINEAGE_REVISION' };
  }

  if (input.workspaceRevision !== options.expectedWorkspaceRevision) {
    return {
      valid: false,
      error: `WORKSPACE_REVISION_MISMATCH: expected ${options.expectedWorkspaceRevision}, got ${input.workspaceRevision}`,
    };
  }

  for (const [field, expected, actual] of [
    ['GRAPH', options.expectedGraphRevision, input.graphRevision],
    ['ORDINAL_MAP', options.expectedOrdinalMapRevision, input.ordinalMapRevision],
    ['TAXONOMY', options.expectedTaxonomyRevision, input.taxonomyRevision],
    ['FEATURE_SCHEMA', options.expectedFeatureSchemaRevision, input.featureSchemaRevision],
    ['EVIDENCE', options.expectedEvidenceRevision, input.evidenceRevision],
  ] as const) {
    if (expected !== actual) return { valid: false, error: `${field}_REVISION_MISMATCH` };
  }
  const resolvedEvidence = new Set(input.candidateOrdinals.flatMap((ordinal) =>
    resolveCanonicalCandidateByOrdinal(options.ordinalMap, ordinal).evidenceRefs));
  if (input.evidenceRefs.some((ref) => !resolvedEvidence.has(ref))) {
    return { valid: false, error: 'EVIDENCE_REFERENCE_NOT_IN_SEALED_MAP' };
  }

  if (input.evidenceRefs.length === 0 || input.evidenceRefs.some((ref) => !ref.trim())) {
    return { valid: false, error: 'EVIDENCE_REFERENCES_REQUIRED' };
  }

  return { valid: true };
}

export interface CandidateFeatureItem {
  candidateOrdinal: number;
  matrixRows: InvestigationCandidateFeatureRow[];
}

/**
 * Builds an AtlasRankInputV1 tensor from an array of candidate feature rows.
 */
export function buildAtlasRankInputV1(params: {
  queryDigest: string;
  workspaceRevision: string;
  graphRevision: string;
  ordinalMap: CandidateOrdinalMapV1;
  taxonomyRevision: string;
  featureSchemaRevision: string;
  evidenceRevision: string;
  candidates: CandidateFeatureItem[];
  evidenceRefs?: string[];
}): AtlasRankInputV1 {
  const ordinalMap = candidateOrdinalMapV1Schema.parse(params.ordinalMap);
  assertCandidateOrdinalMapIntegrityV1(ordinalMap);
  if (params.workspaceRevision !== ordinalMap.workspaceRevision) {
    throw new Error('ORDINAL_MAP_WORKSPACE_REVISION_MISMATCH');
  }
  const B = params.candidates.length;
  if (B < 1 || B > MAX_CANDIDATES_BATCH) throw new Error('BATCH_SIZE_OUT_OF_BOUNDS');
  const candidateOrdinals: number[] = new Array(B);
  const features = new Float32Array(B * FEATURES_PER_CANDIDATE);
  const presentMask = new Uint8Array(B * FEATURES_PER_CANDIDATE);

  let offset = 0;
  const seenOrdinals = new Set<number>();
  for (let b = 0; b < B; b++) {
    const item = params.candidates[b];
    if (item.matrixRows.length !== 4) throw new Error(`CANDIDATE_FEATURE_ROW_COUNT_MISMATCH:${item.candidateOrdinal}`);
    if (seenOrdinals.has(item.candidateOrdinal)) throw new Error(`DUPLICATE_CANDIDATE_ORDINAL:${item.candidateOrdinal}`);
    seenOrdinals.add(item.candidateOrdinal);
    const resolved = resolveCanonicalCandidateByOrdinal(ordinalMap, item.candidateOrdinal);
    if (resolved.graphRevision !== params.graphRevision) {
      throw new Error(`CANDIDATE_GRAPH_REVISION_MISMATCH:${item.candidateOrdinal}`);
    }
    candidateOrdinals[b] = item.candidateOrdinal;

    for (let r = 0; r < 4; r++) {
      const row = item.matrixRows[r];
      if (row && row.canonicalId !== resolved.canonicalId) {
        throw new Error(`CANDIDATE_IDENTITY_MISMATCH:${item.candidateOrdinal}:${r}`);
      }
      const channels = [
        row ? row.semantic : 0,
        row ? row.graphPpr : 0,
        row ? row.nary : 0,
        row ? row.ast : 0,
        row ? row.provenance : 0,
        row ? row.toolEvidence : 0,
      ];
      if (channels.some((value) => !Number.isFinite(value))) {
        throw new Error(`NON_FINITE_CANDIDATE_FEATURE:${item.candidateOrdinal}:${r}`);
      }
      if (row && !resolved.evidenceRefs.includes(row.provenanceRef)) {
        throw new Error(`CANDIDATE_EVIDENCE_REF_UNRESOLVED:${item.candidateOrdinal}:${row.provenanceRef}`);
      }

      for (let c = 0; c < 6; c++) {
        const val = channels[c];
        const isPresent = row && !(row.missingSignalMask & (1 << c));
        features[offset] = val;
        presentMask[offset] = isPresent ? 1 : 0;
        offset++;
      }
    }
  }

  return {
    schema: ATLAS_RANK_INPUT_SCHEMA,
    queryDigest: params.queryDigest,
    workspaceRevision: params.workspaceRevision,
    graphRevision: params.graphRevision,
    ordinalMapRevision: ordinalMap.ordinalMapChecksum,
    taxonomyRevision: params.taxonomyRevision,
    featureSchemaRevision: params.featureSchemaRevision,
    evidenceRevision: params.evidenceRevision,
    candidateOrdinals,
    features,
    presentMask,
    evidenceRefs: [...new Set(params.evidenceRefs ?? params.candidates.flatMap((candidate) => candidate.matrixRows.map((row) => row.provenanceRef)))],
  };
}

/**
 * Validates rank input, delegates scoring to the injected GEMM owner, and emits only a derived receipt.
 * Never mutates canonical packet stores (canonicalAuthority: false, writesPerformed: false).
 */
export type AtlasRankGemmOwnerV1 = (input: {
  candidateOrdinals: readonly number[];
  features: Float32Array;
  presentMask: Uint8Array;
  batchSize: number;
  featuresPerCandidate: 24;
  ordinalMapRevision: string;
  workspaceRevision: string;
  graphRevision: string;
  taxonomyRevision: string;
  featureSchemaRevision: string;
  evidenceRevision: string;
}) => readonly number[];

export function scoreAtlasRankInputWithGemm(
  input: AtlasRankInputV1,
  options: ValidateRankInputOptions,
  gemmOwner: AtlasRankGemmOwnerV1,
  topK = 10,
): AtlasRankScoringReceiptV1 {
  const valResult = validateAtlasRankInputV1(input, options);
  if (!valResult.valid) {
    throw new Error(`CANNOT_SCORE_INVALID_RANK_INPUT: ${valResult.error}`);
  }
  const B = input.candidateOrdinals.length;
  if (!Number.isInteger(topK) || topK < 0) throw new Error('TOP_K_INVALID');
  const scores = [...gemmOwner({
    candidateOrdinals: [...input.candidateOrdinals],
    features: new Float32Array(input.features),
    presentMask: new Uint8Array(input.presentMask),
    batchSize: B,
    featuresPerCandidate: FEATURES_PER_CANDIDATE,
    ordinalMapRevision: input.ordinalMapRevision,
    workspaceRevision: input.workspaceRevision,
    graphRevision: input.graphRevision,
    taxonomyRevision: input.taxonomyRevision,
    featureSchemaRevision: input.featureSchemaRevision,
    evidenceRevision: input.evidenceRevision,
  })];
  if (scores.length !== B || scores.some((score) => !Number.isFinite(score))) {
    throw new Error('GEMM_OWNER_SCORE_OUTPUT_INVALID');
  }
  const candidateScores = scores.map((score, index) => ({ ordinal: input.candidateOrdinals[index], score }));
  candidateScores.sort((left, right) => right.score - left.score || left.ordinal - right.ordinal);
  const topKOrdinals = candidateScores.slice(0, Math.min(B, topK)).map(({ ordinal }) => ordinal);

  const candidateOrderDigest = createHash('sha256')
    .update(JSON.stringify({ ordinalMapRevision: input.ordinalMapRevision, candidateOrdinals: input.candidateOrdinals }), 'utf8')
    .digest('hex');

  const outputChecksum = createHash('sha256')
    .update(JSON.stringify({ queryDigest: input.queryDigest, candidateOrderDigest, scores, topKOrdinals,
      workspaceRevision: input.workspaceRevision, graphRevision: input.graphRevision,
      taxonomyRevision: input.taxonomyRevision, featureSchemaRevision: input.featureSchemaRevision,
      evidenceRevision: input.evidenceRevision }), 'utf8')
    .digest('hex');

  return {
    schema: ATLAS_RANK_SCORING_RECEIPT_SCHEMA,
    queryDigest: input.queryDigest,
    batchSize: B,
    candidateOrdinals: [...input.candidateOrdinals],
    ordinalMapRevision: input.ordinalMapRevision,
    workspaceRevision: input.workspaceRevision,
    graphRevision: input.graphRevision,
    taxonomyRevision: input.taxonomyRevision,
    featureSchemaRevision: input.featureSchemaRevision,
    evidenceRevision: input.evidenceRevision,
    candidateOrderDigest,
    scores,
    topKOrdinals,
    outputChecksum,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}
