import { createHash } from 'node:crypto';
import { CANDIDATE_FEATURE_NAMES } from '../atlas/contracts/feature-extraction-v1.js';
import type { RetrievalCandidateFeatureMatrixV1 } from './retrieval-candidate-feature-matrix-v1.js';

/**
 * RepairCandidateFeatureMatrixV1
 *
 * Tournament/evaluation-only composition over the existing query-time
 * RetrievalCandidateFeatureMatrixV1 [C,25] owner. The first 25 columns are copied from the
 * existing matrix unchanged; repair-specific challenger features are appended as an overlay.
 *
 * This contract does NOT become a second retrieval owner, does NOT cast a retrieval vote, and
 * does NOT authorize mutations. CandidateOrdinal remains the only row coordinate and is bound to
 * candidateSnapshotRevision + ordinalMapChecksum.
 */
export const REPAIR_CANDIDATE_FEATURE_MATRIX_SCHEMA = 'atlas.repair-candidate-feature-matrix.v1' as const;

export const REPAIR_FEATURE_PRESENCE_STATES = [
  'PROVEN',
  'DERIVED',
  'PARTIAL',
  'UNAVAILABLE',
] as const;

export type RepairFeaturePresenceState = (typeof REPAIR_FEATURE_PRESENCE_STATES)[number];

/**
 * Repair/tournament features not already owned by the existing [C,25] matrix.
 *
 * Important representation boundary:
 * - semantic_mrl_* query similarity may be DERIVED only from the same EmbeddingGemma semantic_768
 *   query/document revision with prefix truncation + L2 renormalization.
 * - latent_* query similarity is UNAVAILABLE until the query is encoded through the exact same
 *   nested-autoencoder revision as the candidate representation. Candidate-only latent hydration
 *   is not sufficient to populate these columns.
 * - topology/tang fields are derived challengers only and never identity or retrieval authority.
 */
export const REPAIR_OVERLAY_FEATURE_NAMES = [
  'semantic_mrl_512_query_similarity',
  'semantic_mrl_256_query_similarity',
  'semantic_mrl_128_query_similarity',
  'latent_256_query_similarity',
  'latent_128_query_similarity',
  'latent_64_query_similarity',
  'postgres_fts_score',
  'bm25_sparse_score',
  'ast_direct_span_match',
  'ast_same_function',
  'ast_same_class',
  'compiler_diagnostic_match',
  'error_stack_overlap',
  'test_ownership_fit',
  'recent_edit_affinity',
  'graph_hop_proximity',
  'graph_typed_edge_fit',
  'graph_path_confidence',
  'ppr_query_score',
  'som_row_norm',
  'som_col_norm',
  'topology_ae64_neighbor_fit',
  'topology_manifold4_similarity',
  'tang_nomination_weight',
] as const;

export type RepairOverlayFeatureName = (typeof REPAIR_OVERLAY_FEATURE_NAMES)[number];

export const REPAIR_FEATURE_NAMES = [
  ...CANDIDATE_FEATURE_NAMES,
  ...REPAIR_OVERLAY_FEATURE_NAMES,
] as const;

export type RepairCandidateFeatureName = (typeof REPAIR_FEATURE_NAMES)[number];

export interface RepairCandidateIdentityInputV1 {
  candidateOrdinal: number;
  packetKey: string;
  sourceRef: string;
  sourceRevision?: string | null;
  workspaceRevision?: string | null;
  treeNodeId?: string | null;
  stableSymbolId?: string | null;
  symbolVersionId?: string | null;
  observationFeatureRevision?: string | null;
  astGraphRevision?: string | null;
  compilerSemanticGraphRevision?: string | null;
  relationshipGraphRevision?: string | null;
  semanticRevision?: string | null;
  representationRevision?: string | null;
  analysisPassSetChecksum?: string | null;
}

export interface RepairCandidateIdentityV1 extends RepairCandidateIdentityInputV1 {
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  featureRowChecksum: string;
}

export interface RepairOverlayRowInputV1 {
  candidateOrdinal: number;
  values?: Partial<Record<RepairOverlayFeatureName, number>>;
}

export type RepairOverlayFeatureStatesV1 = Record<
  RepairOverlayFeatureName,
  RepairFeaturePresenceState
>;

export interface RepairFeatureCoverageV1 {
  state: RepairFeaturePresenceState;
  presentRows: number;
  missingRows: number;
}

export interface BuildRepairCandidateFeatureMatrixInputV1 {
  baseMatrix: RetrievalCandidateFeatureMatrixV1;
  baseMatrixManifestChecksum: string;
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  producerRevision: string;
  identities: readonly RepairCandidateIdentityInputV1[];
  overlayRows?: readonly RepairOverlayRowInputV1[];
  overlayFeatureStates: RepairOverlayFeatureStatesV1;
}

export interface RepairCandidateFeatureMatrixV1 {
  schema: typeof REPAIR_CANDIDATE_FEATURE_MATRIX_SCHEMA;
  mode: 'TOURNAMENT_EVAL_ONLY';
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  producerRevision: string;
  rowCount: number;
  baseFeatureCount: number;
  repairFeatureCount: number;
  featureCount: number;
  baseFeatureNames: readonly string[];
  repairFeatureNames: readonly RepairOverlayFeatureName[];
  featureNames: readonly RepairCandidateFeatureName[];
  candidatePacketKeys: readonly string[];
  featureValues: Float32Array;
  presenceMask: Uint8Array;
  identities: readonly RepairCandidateIdentityV1[];
  overlayFeatureStates: RepairOverlayFeatureStatesV1;
  overlayCoverage: Record<RepairOverlayFeatureName, RepairFeatureCoverageV1>;
  baseMatrixManifestChecksum: string;
  baseMatrixChecksum: string;
  overlayChecksum: string;
  matrixChecksum: string;
  presenceMaskChecksum: string;
  identityChecksum: string;
  manifestChecksum: string;
  canonicalAuthority: false;
  retrievalVote: false;
  rankingPromotion: false;
  mutationAuthority: false;
}

function stable(value: unknown): string {
  if (value === undefined) return '\"__undefined__\"';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stable(record[key])}`)
    .join(',')}}`;
}

function sha256(value: string | Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function digest(value: unknown): string {
  return sha256(stable(value));
}

/** Canonical little-endian float32 bytes, independent of host typed-array byte order. */
function float32Bytes(values: Float32Array): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < values.length; i++) {
    view.setFloat32(i * 4, values[i]!, true);
  }
  return bytes;
}

function assertPrefixedSha256(value: string, code: string): void {
  if (!/^sha256:[0-9a-f]{64}$/i.test(value)) throw new Error(code);
}

/**
 * Candidate snapshot revisions are opaque revision tokens in Parent Atlas. The current live
 * frozen cohort uses a qualified token such as
 * `lineage-qualified-canary:sha256:<digest>:v1:15`, while other snapshots may use a bare
 * `sha256:<digest>`. Preserve the exact token; do not rewrite it into a synthetic digest.
 */
function assertRevisionToken(value: string, code: string): void {
  if (!value || value.trim() !== value || /\s/.test(value) || value.length > 512) throw new Error(code);
}

/** Existing ordinal-map receipts use both sha256:<hex> and bare 64-hex encodings. */
function assertSha256Checksum(value: string, code: string): void {
  if (!/^(?:sha256:)?[0-9a-f]{64}$/i.test(value)) throw new Error(code);
}

function assertFinite(value: number, code: string): void {
  if (!Number.isFinite(value)) throw new Error(code);
}

function validateOverlayFeatureState(
  feature: RepairOverlayFeatureName,
  state: RepairFeaturePresenceState,
  presentRows: number,
  rowCount: number,
): RepairFeatureCoverageV1 {
  const missingRows = rowCount - presentRows;

  // State semantics are intentionally strict:
  // PROVEN/DERIVED => complete scalar coverage over the frozen tournament universe.
  // PARTIAL        => some but not all rows have the scalar.
  // UNAVAILABLE    => no row may fabricate a value.
  if (state === 'UNAVAILABLE' && presentRows !== 0) {
    throw new Error(`REPAIR_FEATURE_UNAVAILABLE_HAS_VALUES:${feature}`);
  }
  if ((state === 'PROVEN' || state === 'DERIVED') && presentRows !== rowCount) {
    throw new Error(`REPAIR_FEATURE_COMPLETE_STATE_HAS_MISSING_ROWS:${feature}`);
  }
  if (state === 'PARTIAL' && (presentRows === 0 || presentRows === rowCount)) {
    throw new Error(`REPAIR_FEATURE_PARTIAL_STATE_NOT_PARTIAL:${feature}`);
  }

  return { state, presentRows, missingRows };
}

export function buildRepairCandidateFeatureMatrixV1(
  input: BuildRepairCandidateFeatureMatrixInputV1,
): RepairCandidateFeatureMatrixV1 {
  const {
    baseMatrix,
    baseMatrixManifestChecksum,
    candidateSnapshotRevision,
    ordinalMapChecksum,
    producerRevision,
    identities,
    overlayRows = [],
    overlayFeatureStates,
  } = input;

  assertPrefixedSha256(baseMatrixManifestChecksum, 'REPAIR_BASE_MANIFEST_CHECKSUM_INVALID');
  assertRevisionToken(candidateSnapshotRevision, 'REPAIR_CANDIDATE_SNAPSHOT_REVISION_INVALID');
  assertSha256Checksum(ordinalMapChecksum, 'REPAIR_ORDINAL_MAP_CHECKSUM_INVALID');
  if (!producerRevision.trim()) throw new Error('REPAIR_PRODUCER_REVISION_REQUIRED');

  const rowCount = identities.length;
  const baseFeatureCount = CANDIDATE_FEATURE_NAMES.length;
  const repairFeatureCount = REPAIR_OVERLAY_FEATURE_NAMES.length;
  const featureCount = baseFeatureCount + repairFeatureCount;

  if (rowCount === 0) throw new Error('REPAIR_CANDIDATE_UNIVERSE_EMPTY');
  if (baseMatrix.candidate_count !== rowCount) throw new Error('REPAIR_BASE_ROW_COUNT_MISMATCH');
  if (baseMatrix.feature_count !== baseFeatureCount) throw new Error('REPAIR_BASE_FEATURE_COUNT_MISMATCH');
  if (baseMatrix.candidate_packet_keys.length !== rowCount) {
    throw new Error('REPAIR_BASE_PACKET_KEY_COUNT_MISMATCH');
  }
  if (baseMatrix.candidate_features.length !== rowCount * baseFeatureCount) {
    throw new Error('REPAIR_BASE_VALUE_SHAPE_MISMATCH');
  }
  if (baseMatrix.presence_mask.length !== rowCount * baseFeatureCount) {
    throw new Error('REPAIR_BASE_PRESENCE_SHAPE_MISMATCH');
  }

  // The tournament snapshot owns a dense 0..N-1 CandidateOrdinal universe. No row-local ordinal
  // remapping is allowed inside this artifact.
  const seenPacketKeys = new Set<string>();
  for (let row = 0; row < rowCount; row++) {
    const identity = identities[row]!;
    if (identity.candidateOrdinal !== row) {
      throw new Error(`REPAIR_CANDIDATE_ORDINAL_ROW_MISMATCH:${row}`);
    }
    if (!identity.packetKey || seenPacketKeys.has(identity.packetKey)) {
      throw new Error(`REPAIR_PACKET_KEY_INVALID_OR_DUPLICATE:${row}`);
    }
    if (!identity.sourceRef) throw new Error(`REPAIR_SOURCE_REF_REQUIRED:${row}`);
    if (baseMatrix.candidate_packet_keys[row] !== identity.packetKey) {
      throw new Error(`REPAIR_BASE_PACKET_KEY_MISMATCH:${row}`);
    }
    seenPacketKeys.add(identity.packetKey);
  }

  const overlayByOrdinal = new Map<number, RepairOverlayRowInputV1>();
  for (const row of overlayRows) {
    if (
      !Number.isInteger(row.candidateOrdinal) ||
      row.candidateOrdinal < 0 ||
      row.candidateOrdinal >= rowCount
    ) {
      throw new Error(`REPAIR_OVERLAY_ORDINAL_OUT_OF_RANGE:${row.candidateOrdinal}`);
    }
    if (overlayByOrdinal.has(row.candidateOrdinal)) {
      throw new Error(`REPAIR_OVERLAY_DUPLICATE_ORDINAL:${row.candidateOrdinal}`);
    }
    for (const [name, value] of Object.entries(row.values ?? {})) {
      if (!REPAIR_OVERLAY_FEATURE_NAMES.includes(name as RepairOverlayFeatureName)) {
        throw new Error(`REPAIR_OVERLAY_FEATURE_UNKNOWN:${name}`);
      }
      if (value !== undefined) {
        assertFinite(value, `REPAIR_OVERLAY_VALUE_NON_FINITE:${name}:${row.candidateOrdinal}`);
      }
    }
    overlayByOrdinal.set(row.candidateOrdinal, row);
  }

  for (const name of REPAIR_OVERLAY_FEATURE_NAMES) {
    if (!REPAIR_FEATURE_PRESENCE_STATES.includes(overlayFeatureStates[name])) {
      throw new Error(`REPAIR_OVERLAY_STATE_INVALID:${name}`);
    }
  }

  const featureValues = new Float32Array(rowCount * featureCount);
  const presenceMask = new Uint8Array(rowCount * featureCount);

  // Plane A: byte-equivalent feature values from the existing [C,25] owner.
  for (let row = 0; row < rowCount; row++) {
    const baseOffset = row * baseFeatureCount;
    const combinedOffset = row * featureCount;
    for (let feature = 0; feature < baseFeatureCount; feature++) {
      const value = baseMatrix.candidate_features[baseOffset + feature]!;
      assertFinite(value, `REPAIR_BASE_VALUE_NON_FINITE:${row}:${feature}`);
      const present = baseMatrix.presence_mask[baseOffset + feature]!;
      if (present !== 0 && present !== 1) {
        throw new Error(`REPAIR_BASE_PRESENCE_INVALID:${row}:${feature}`);
      }
      if (present === 0 && value !== 0) {
        throw new Error(`REPAIR_BASE_ABSENT_VALUE_NONZERO:${row}:${feature}`);
      }
      featureValues[combinedOffset + feature] = value;
      presenceMask[combinedOffset + feature] = present;
    }

    // Plane B: repair/tournament overlay. Missing means exactly value=0 + presence=0; the global
    // feature state determines whether that missingness is legal.
    const overlay = overlayByOrdinal.get(row)?.values ?? {};
    for (let feature = 0; feature < repairFeatureCount; feature++) {
      const name = REPAIR_OVERLAY_FEATURE_NAMES[feature]!;
      const value = overlay[name];
      const index = combinedOffset + baseFeatureCount + feature;
      if (value === undefined || value === null) {
        featureValues[index] = 0;
        presenceMask[index] = 0;
      } else {
        assertFinite(value, `REPAIR_OVERLAY_VALUE_NON_FINITE:${name}:${row}`);
        featureValues[index] = value;
        presenceMask[index] = 1;
      }
    }
  }

  const overlayCoverage = {} as Record<RepairOverlayFeatureName, RepairFeatureCoverageV1>;
  for (let feature = 0; feature < repairFeatureCount; feature++) {
    const name = REPAIR_OVERLAY_FEATURE_NAMES[feature]!;
    let presentRows = 0;
    for (let row = 0; row < rowCount; row++) {
      if (presenceMask[row * featureCount + baseFeatureCount + feature] === 1) presentRows++;
    }
    overlayCoverage[name] = validateOverlayFeatureState(
      name,
      overlayFeatureStates[name],
      presentRows,
      rowCount,
    );
  }

  const baseMatrixChecksum = digest({
    candidatePacketKeys: baseMatrix.candidate_packet_keys,
    featureNames: CANDIDATE_FEATURE_NAMES,
    valuesChecksum: sha256(float32Bytes(baseMatrix.candidate_features)),
    presenceChecksum: sha256(baseMatrix.presence_mask),
  });

  const normalizedOverlayRows = [...overlayRows]
    .map((row) => ({ candidateOrdinal: row.candidateOrdinal, values: row.values ?? {} }))
    .sort((a, b) => a.candidateOrdinal - b.candidateOrdinal);

  const overlayChecksum = digest({
    featureNames: REPAIR_OVERLAY_FEATURE_NAMES,
    states: overlayFeatureStates,
    coverage: overlayCoverage,
    rows: normalizedOverlayRows,
  });

  const matrixChecksum = sha256(float32Bytes(featureValues));
  const presenceMaskChecksum = sha256(presenceMask);

  const identityRows: RepairCandidateIdentityV1[] = identities.map((identity, row) => {
    const rowValues = Array.from(
      featureValues.slice(row * featureCount, (row + 1) * featureCount),
    );
    const rowPresence = Array.from(
      presenceMask.slice(row * featureCount, (row + 1) * featureCount),
    );
    const base = {
      ...identity,
      sourceRevision: identity.sourceRevision ?? null,
      workspaceRevision: identity.workspaceRevision ?? null,
      treeNodeId: identity.treeNodeId ?? null,
      stableSymbolId: identity.stableSymbolId ?? null,
      symbolVersionId: identity.symbolVersionId ?? null,
      observationFeatureRevision: identity.observationFeatureRevision ?? null,
      astGraphRevision: identity.astGraphRevision ?? null,
      compilerSemanticGraphRevision: identity.compilerSemanticGraphRevision ?? null,
      relationshipGraphRevision: identity.relationshipGraphRevision ?? null,
      semanticRevision: identity.semanticRevision ?? null,
      representationRevision: identity.representationRevision ?? null,
      analysisPassSetChecksum: identity.analysisPassSetChecksum ?? null,
      candidateSnapshotRevision,
      ordinalMapChecksum,
    };
    return {
      ...base,
      featureRowChecksum: digest({ identity: base, rowValues, rowPresence }),
    };
  });

  const identityChecksum = digest(identityRows);

  const manifestBody = {
    schema: REPAIR_CANDIDATE_FEATURE_MATRIX_SCHEMA,
    mode: 'TOURNAMENT_EVAL_ONLY' as const,
    candidateSnapshotRevision,
    ordinalMapChecksum,
    producerRevision,
    rowCount,
    baseFeatureCount,
    repairFeatureCount,
    featureCount,
    baseFeatureNames: CANDIDATE_FEATURE_NAMES,
    repairFeatureNames: REPAIR_OVERLAY_FEATURE_NAMES,
    featureNames: REPAIR_FEATURE_NAMES,
    candidatePacketKeys: baseMatrix.candidate_packet_keys,
    overlayFeatureStates,
    overlayCoverage,
    baseMatrixManifestChecksum,
    baseMatrixChecksum,
    overlayChecksum,
    matrixChecksum,
    presenceMaskChecksum,
    identityChecksum,
    canonicalAuthority: false as const,
    retrievalVote: false as const,
    rankingPromotion: false as const,
    mutationAuthority: false as const,
  };

  return {
    ...manifestBody,
    featureValues,
    presenceMask,
    identities: identityRows,
    manifestChecksum: digest(manifestBody),
  };
}
