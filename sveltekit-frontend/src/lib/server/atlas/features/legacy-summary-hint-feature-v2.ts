import { createHash } from 'node:crypto';
import { candidateOrdinalMapChecksum, compareUtf8 } from './canonical-candidate-v1.js';
import {
  buildRepairFeatureProducerArtifactV1,
  type RepairFeatureProducerArtifactV1,
} from '../../retrieval/repair-feature-producer-v1.js';
import {
  verifyHistoricalEvidenceOverlayV2,
  type HistoricalEvidenceCurrentCandidateOverlayV2,
} from './historical-evidence-current-candidate-overlay-v2.js';

/**
 * HINT-FEATURE-03A (v2): standalone, NON-canonical `legacy_summary_cosine_max` mechanics.
 * Query-conditioned max chunk cosine over EXACT_CHUNK legacy-summary HINT overlays, aggregated by
 * CandidateOrdinal. Candidates without a qualified HINT are UNAVAILABLE (null), never numeric zero.
 * Not an RF feature yet: the frozen RF feature-name registry is untouched by this module.
 */
export const LEGACY_SUMMARY_HINT_FEATURE_SCHEMA_V2 = 'atlas.legacy-summary-hint-feature.v2' as const;
export const LEGACY_SUMMARY_AGGREGATION_POLICY_V2 = 'MAX_CHUNK_COSINE_V1' as const;
export const HINT_VECTOR_DIM = 768;
const UNIT_NORM_TOLERANCE = 1e-3;
const COSINE_TOLERANCE = 1e-4;

export interface FeatureCandidateV2 {
  candidateOrdinal: number;
  /** CEI-23 matrix row order. NOT equal to candidateOrdinal in general. */
  matrixRowIndex: number;
  packetId: string;
  packetKey: string;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
}
export interface HintVectorV2 {
  chunkRowId: string;
  canonicalChunkId: string;
  summaryDigest: string;
  vector: Float32Array;
}
export interface HintFeatureRowV2 {
  candidateOrdinal: number;
  matrixRowIndex: number;
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  packetId: string;
  packetKey: string;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  rawCosine: number | null;
  score01: number | null;
  matchedHintCount: number;
  winningChunkRowId: string | null;
  winningCanonicalChunkId: string | null;
  winningSummaryDigest: string | null;
  winningSummaryVectorDigest: string | null;
  queryEmbeddingDigest: string;
  state: 'DERIVED' | 'UNAVAILABLE';
  unavailableReason: 'NO_QUALIFIED_LEGACY_SUMMARY_HINT' | null;
  canonicalAuthority: false;
  retrievalVote: false;
  rankingPromotion: false;
}

export const vectorDigestV2 = (v: Float32Array): string =>
  `sha256:${createHash('sha256').update(Buffer.from(v.buffer, v.byteOffset, v.byteLength)).digest('hex')}`;

export function assertUnitVector768(v: Float32Array, code: string): void {
  if (v.length !== HINT_VECTOR_DIM) throw new Error(`${code}_DIMENSION:${v.length}`);
  let n = 0;
  for (const x of v) {
    if (!Number.isFinite(x)) throw new Error(`${code}_NON_FINITE`);
    n += x * x;
  }
  if (Math.abs(Math.sqrt(n) - 1) > UNIT_NORM_TOLERANCE) throw new Error(`${code}_NOT_UNIT_NORM:${Math.sqrt(n)}`);
}

export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

export function buildLegacySummaryHintFeatureV2(input: {
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  candidates: readonly FeatureCandidateV2[];
  /** EXACT_CHUNK overlays only; anything else is rejected, never silently skipped. */
  overlays: readonly HistoricalEvidenceCurrentCandidateOverlayV2[];
  /** keyed by chunkRowId */
  hintVectors: ReadonlyMap<string, HintVectorV2>;
  queryVector: Float32Array;
  queryEmbeddingDigest: string;
}): { rows: HintFeatureRowV2[]; chunkScores: Array<{ candidateOrdinal: number; chunkRowId: string; canonicalChunkId: string; summaryDigest: string; vectorDigest: string; rawCosine: number; score01: number }>; derivedCount: number; unavailableCount: number } {
  const coords = { candidateSnapshotRevision: input.candidateSnapshotRevision, ordinalMapChecksum: input.ordinalMapChecksum };
  assertUnitVector768(input.queryVector, 'HINT_FEATURE_QUERY_VECTOR');
  if (vectorDigestV2(input.queryVector) !== input.queryEmbeddingDigest) throw new Error('HINT_FEATURE_QUERY_DIGEST_MISMATCH');

  const byOrdinal = new Map<number, FeatureCandidateV2>();
  for (const c of input.candidates) {
    if (byOrdinal.has(c.candidateOrdinal)) throw new Error(`HINT_FEATURE_DUPLICATE_CANDIDATE:${c.candidateOrdinal}`);
    byOrdinal.set(c.candidateOrdinal, c);
  }

  const seenChunks = new Set<string>();
  const scored: Array<{ candidateOrdinal: number; chunkRowId: string; canonicalChunkId: string; summaryDigest: string; vectorDigest: string; rawCosine: number; score01: number }> = [];
  for (const o of input.overlays) {
    verifyHistoricalEvidenceOverlayV2(o, coords);
    if (o.evidenceKind !== 'LEGACY_SUMMARY_HINT' || o.resolution.state !== 'EXACT_CHUNK') throw new Error(`HINT_FEATURE_OVERLAY_NOT_EXACT_LEGACY_HINT:${o.evidenceId}`);
    const m = o.resolution.memberships[0]!;
    if (!byOrdinal.has(m.candidateOrdinal)) throw new Error(`HINT_FEATURE_ORDINAL_NOT_IN_CANDIDATES:${m.candidateOrdinal}`);
    if (seenChunks.has(m.chunkRowId)) throw new Error(`HINT_FEATURE_DUPLICATE_CHUNK_SCORE:${m.chunkRowId}`);
    seenChunks.add(m.chunkRowId);
    const hv = input.hintVectors.get(m.chunkRowId);
    if (!hv) throw new Error(`HINT_FEATURE_VECTOR_MISSING:${m.chunkRowId}`);
    if (hv.canonicalChunkId !== m.canonicalChunkId) throw new Error(`HINT_FEATURE_VECTOR_CHUNK_MISMATCH:${m.chunkRowId}`);
    assertUnitVector768(hv.vector, 'HINT_FEATURE_SUMMARY_VECTOR');
    const rawCosine = dot(input.queryVector, hv.vector);
    if (!Number.isFinite(rawCosine) || rawCosine > 1 + COSINE_TOLERANCE || rawCosine < -1 - COSINE_TOLERANCE) throw new Error(`HINT_FEATURE_COSINE_OUT_OF_RANGE:${rawCosine}`);
    scored.push({ candidateOrdinal: m.candidateOrdinal, chunkRowId: m.chunkRowId, canonicalChunkId: m.canonicalChunkId, summaryDigest: hv.summaryDigest, vectorDigest: vectorDigestV2(hv.vector), rawCosine, score01: (rawCosine + 1) / 2 });
  }

  const groups = new Map<number, typeof scored>();
  for (const s of scored) (groups.get(s.candidateOrdinal) ?? groups.set(s.candidateOrdinal, []).get(s.candidateOrdinal)!).push(s);

  const rows: HintFeatureRowV2[] = [...byOrdinal.values()].sort((a, b) => a.candidateOrdinal - b.candidateOrdinal).map((c) => {
    const base = {
      candidateOrdinal: c.candidateOrdinal, matrixRowIndex: c.matrixRowIndex, ...coords,
      packetId: c.packetId, packetKey: c.packetKey, sourceRef: c.sourceRef, sourceRevision: c.sourceRevision, workspaceRevision: c.workspaceRevision,
      queryEmbeddingDigest: input.queryEmbeddingDigest, canonicalAuthority: false as const, retrievalVote: false as const, rankingPromotion: false as const,
    };
    const g = groups.get(c.candidateOrdinal);
    if (!g) return { ...base, rawCosine: null, score01: null, matchedHintCount: 0, winningChunkRowId: null, winningCanonicalChunkId: null, winningSummaryDigest: null, winningSummaryVectorDigest: null, state: 'UNAVAILABLE' as const, unavailableReason: 'NO_QUALIFIED_LEGACY_SUMMARY_HINT' as const };
    // rawCosine DESC, summaryDigest ASC, chunkRowId ASC
    const w = [...g].sort((a, b) => b.rawCosine - a.rawCosine || compareUtf8(a.summaryDigest, b.summaryDigest) || compareUtf8(a.chunkRowId, b.chunkRowId))[0]!;
    return { ...base, rawCosine: w.rawCosine, score01: w.score01, matchedHintCount: g.length, winningChunkRowId: w.chunkRowId, winningCanonicalChunkId: w.canonicalChunkId, winningSummaryDigest: w.summaryDigest, winningSummaryVectorDigest: w.vectorDigest, state: 'DERIVED' as const, unavailableReason: null };
  });
  const derivedCount = rows.filter((r) => r.state === 'DERIVED').length;
  return { rows, chunkScores: scored.sort((a, b) => a.candidateOrdinal - b.candidateOrdinal || compareUtf8(a.chunkRowId, b.chunkRowId)), derivedCount, unavailableCount: rows.length - derivedCount };
}

export function legacySummaryHintFeatureChecksumV2(rows: readonly HintFeatureRowV2[]): string {
  return candidateOrdinalMapChecksum(rows);
}

/**
 * RF-04 wrapper. The artifact is PARTIAL by construction (rows only for DERIVED candidates); the
 * per-candidate DERIVED/UNAVAILABLE split is the artifact's row set, and UNAVAILABLE rows are never
 * emitted as numeric values. `value` is the RAW cosine in [-1, 1]; score01 stays in the standalone artifact.
 * Each row's inputRowChecksum cryptographically binds the winning-chunk evidence.
 */
export function buildLegacySummaryCosineMaxProducerArtifactV2(input: {
  rows: readonly HintFeatureRowV2[];
  producerRevision: string;
  inputChecksum: string;
  hintVectorArtifactChecksum: string;
}): RepairFeatureProducerArtifactV1 {
  if (input.rows.length === 0) throw new Error('HINT_FEATURE_ARTIFACT_NO_CANDIDATES');
  const { candidateSnapshotRevision, ordinalMapChecksum, queryEmbeddingDigest } = input.rows[0]!;
  if (input.rows.some((r) => r.candidateSnapshotRevision !== candidateSnapshotRevision || r.ordinalMapChecksum !== ordinalMapChecksum || r.queryEmbeddingDigest !== queryEmbeddingDigest)) {
    throw new Error('HINT_FEATURE_ARTIFACT_MIXED_COORDINATES');
  }
  const derived = input.rows.filter((r) => r.state === 'DERIVED');
  if (derived.length === 0) throw new Error('HINT_FEATURE_ARTIFACT_NO_DERIVED_ROWS');
  if (derived.some((r) => r.rawCosine === null || !Number.isFinite(r.rawCosine))) throw new Error('HINT_FEATURE_ARTIFACT_DERIVED_ROW_WITHOUT_VALUE');
  return buildRepairFeatureProducerArtifactV1({
    featureName: 'legacy_summary_cosine_max',
    state: derived.length === input.rows.length ? 'DERIVED' : 'PARTIAL',
    candidateSnapshotRevision, ordinalMapChecksum,
    candidateRowCount: input.rows.length,
    producerId: 'legacy-summary-hint-feature-v2',
    producerRevision: input.producerRevision,
    derivation: 'LEGACY_SUMMARY_HINT_MAX_COSINE',
    inputChecksum: input.inputChecksum,
    representationId: 'semantic_768',
    representationRevision: `legacy-summary-hint-vector-set:${input.hintVectorArtifactChecksum}`,
    sourceRepresentationId: 'semantic_768',
    // Bound to the actual query vector digest. The :8097 service reports no immutable model revision; that
    // limitation is recorded as ancillary provenance (modelRevision = UNRESOLVED_RUNTIME_MODEL_REVISION) in the
    // admission receipt rather than invented here.
    sourceRepresentationRevision: queryEmbeddingDigest,
    rows: derived.map((r) => ({
      candidateOrdinal: r.candidateOrdinal,
      value: r.rawCosine!,
      inputRowChecksum: createHash('sha256').update(JSON.stringify([
        r.candidateOrdinal, r.matrixRowIndex, r.queryEmbeddingDigest, r.winningChunkRowId, r.winningCanonicalChunkId,
        r.winningSummaryDigest, r.winningSummaryVectorDigest, r.rawCosine, r.matchedHintCount, LEGACY_SUMMARY_AGGREGATION_POLICY_V2,
      ])).digest('hex'),
    })),
  });
}
