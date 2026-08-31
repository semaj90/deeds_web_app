import { createHash } from 'node:crypto';
import {
  buildRepairFeatureProducerArtifactV1,
  buildRepairFeatureProducerSetV1,
  type RepairFeatureProducerArtifactV1,
  type RepairFeatureProducerSetV1,
} from './repair-feature-producer-v1.js';

const SOURCE_DIMS = 768;
const MRL_DIMS = [512, 256, 128] as const;

type MrlDims = (typeof MRL_DIMS)[number];

type MrlFeatureName =
  | 'semantic_mrl_512_query_similarity'
  | 'semantic_mrl_256_query_similarity'
  | 'semantic_mrl_128_query_similarity';

export interface RepairMrlCandidateInputV1 {
  candidateOrdinal: number;
  vector: readonly number[] | Float32Array;
  representationRevision: string;
  inputRowChecksum?: string | null;
}

export interface BuildRepairMrlFeatureProducerInputV1 {
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  representationRevision: string;
  queryVector: readonly number[] | Float32Array;
  queryRepresentationRevision: string;
  candidates: readonly RepairMrlCandidateInputV1[];
  producerRevision: string;
}

export interface RepairMrlFeatureProducerResultV1 {
  artifacts: readonly RepairFeatureProducerArtifactV1[];
  producerSet: RepairFeatureProducerSetV1;
  queryVectorChecksum: string;
  candidateVectorChecksum: string;
  sourceRepresentationId: 'semantic_768';
  sourceRepresentationRevision: string;
  canonicalAuthority: false;
  retrievalVote: false;
  rankingPromotion: false;
  mutationAuthority: false;
}

function sha256Bytes(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function stable(value: unknown): string {
  if (value === undefined) return '"__undefined__"';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stable(record[key])}`)
    .join(',')}}`;
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(stable(value), 'utf8').digest('hex')}`;
}

function float32Bytes(values: readonly number[] | Float32Array): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < values.length; i++) {
    const value = Number(values[i]);
    if (!Number.isFinite(value)) throw new Error(`REPAIR_MRL_VECTOR_NON_FINITE:${i}`);
    view.setFloat32(i * 4, value, true);
  }
  return bytes;
}

function validateVector(
  vector: readonly number[] | Float32Array,
  code: string,
): void {
  if (vector.length !== SOURCE_DIMS) throw new Error(`${code}_DIMENSION_INVALID`);
  for (let i = 0; i < vector.length; i++) {
    if (!Number.isFinite(Number(vector[i]))) throw new Error(`${code}_NON_FINITE:${i}`);
  }
}

/** Prefix truncation + L2 renormalization, matching the repo's Python MRL reference. */
export function mrlPrefixNormalizeV1(
  vector: readonly number[] | Float32Array,
  dims: MrlDims,
): Float32Array {
  validateVector(vector, 'REPAIR_MRL_SOURCE_VECTOR');
  let normSq = 0;
  for (let i = 0; i < dims; i++) {
    const value = Number(vector[i]);
    normSq += value * value;
  }
  if (!Number.isFinite(normSq) || normSq <= 0) {
    throw new Error(`REPAIR_MRL_PREFIX_NORM_INVALID:${dims}`);
  }
  const norm = Math.sqrt(normSq);
  const out = new Float32Array(dims);
  for (let i = 0; i < dims; i++) out[i] = Number(vector[i]) / norm;
  return out;
}

function dot(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new Error('REPAIR_MRL_DOT_DIMENSION_MISMATCH');
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  if (!Number.isFinite(sum)) throw new Error('REPAIR_MRL_DOT_NON_FINITE');
  // Numerical float32 accumulation can exceed the theoretical cosine range by a tiny epsilon.
  return Math.max(-1, Math.min(1, sum));
}

function featureName(dims: MrlDims): MrlFeatureName {
  if (dims === 512) return 'semantic_mrl_512_query_similarity';
  if (dims === 256) return 'semantic_mrl_256_query_similarity';
  return 'semantic_mrl_128_query_similarity';
}

export function buildRepairMrlFeatureProducerV1(
  input: BuildRepairMrlFeatureProducerInputV1,
): RepairMrlFeatureProducerResultV1 {
  if (!input.representationRevision.trim()) {
    throw new Error('REPAIR_MRL_REPRESENTATION_REVISION_REQUIRED');
  }
  if (input.queryRepresentationRevision !== input.representationRevision) {
    throw new Error('REPAIR_MRL_QUERY_REPRESENTATION_REVISION_MISMATCH');
  }
  if (!input.producerRevision.trim()) throw new Error('REPAIR_MRL_PRODUCER_REVISION_REQUIRED');
  if (input.candidates.length === 0) throw new Error('REPAIR_MRL_CANDIDATES_EMPTY');

  validateVector(input.queryVector, 'REPAIR_MRL_QUERY_VECTOR');
  const seenOrdinals = new Set<number>();
  const sortedCandidates = [...input.candidates].sort(
    (a, b) => a.candidateOrdinal - b.candidateOrdinal,
  );
  for (let expectedOrdinal = 0; expectedOrdinal < sortedCandidates.length; expectedOrdinal++) {
    const candidate = sortedCandidates[expectedOrdinal]!;
    if (candidate.candidateOrdinal !== expectedOrdinal) {
      throw new Error(`REPAIR_MRL_CANDIDATE_ORDINAL_NOT_DENSE:${expectedOrdinal}`);
    }
    if (seenOrdinals.has(candidate.candidateOrdinal)) {
      throw new Error(`REPAIR_MRL_DUPLICATE_CANDIDATE_ORDINAL:${candidate.candidateOrdinal}`);
    }
    seenOrdinals.add(candidate.candidateOrdinal);
    if (candidate.representationRevision !== input.representationRevision) {
      throw new Error(
        `REPAIR_MRL_CANDIDATE_REPRESENTATION_REVISION_MISMATCH:${candidate.candidateOrdinal}`,
      );
    }
    validateVector(candidate.vector, `REPAIR_MRL_CANDIDATE_VECTOR:${candidate.candidateOrdinal}`);
  }

  const queryVectorChecksum = sha256Bytes(float32Bytes(input.queryVector));
  const candidateVectorChecksum = digest(
    sortedCandidates.map((candidate) => ({
      candidateOrdinal: candidate.candidateOrdinal,
      vectorChecksum: sha256Bytes(float32Bytes(candidate.vector)),
      inputRowChecksum: candidate.inputRowChecksum ?? null,
    })),
  );

  const artifacts: RepairFeatureProducerArtifactV1[] = [];
  for (const dims of MRL_DIMS) {
    const query = mrlPrefixNormalizeV1(input.queryVector, dims);
    const rows = sortedCandidates.map((candidate) => ({
      candidateOrdinal: candidate.candidateOrdinal,
      value: dot(query, mrlPrefixNormalizeV1(candidate.vector, dims)),
      inputRowChecksum: candidate.inputRowChecksum ?? null,
    }));

    const inputChecksum = digest({
      derivation: 'MRL_PREFIX_L2_RENORMALIZE',
      dimensions: dims,
      sourceRepresentationId: 'semantic_768',
      sourceRepresentationRevision: input.representationRevision,
      queryVectorChecksum,
      candidateVectorChecksum,
      candidateSnapshotRevision: input.candidateSnapshotRevision,
      ordinalMapChecksum: input.ordinalMapChecksum,
    });

    artifacts.push(
      buildRepairFeatureProducerArtifactV1({
        featureName: featureName(dims),
        state: 'DERIVED',
        candidateSnapshotRevision: input.candidateSnapshotRevision,
        ordinalMapChecksum: input.ordinalMapChecksum,
        candidateRowCount: sortedCandidates.length,
        producerId: 'repair-mrl-feature-producer-v1',
        producerRevision: input.producerRevision,
        derivation: 'MRL_PREFIX_L2_RENORMALIZE',
        inputChecksum,
        representationId: `semantic_mrl_${dims}`,
        representationRevision: `${input.representationRevision}:mrl${dims}:l2-v1`,
        sourceRepresentationId: 'semantic_768',
        sourceRepresentationRevision: input.representationRevision,
        rows,
      }),
    );
  }

  const producerSet = buildRepairFeatureProducerSetV1({
    candidateSnapshotRevision: input.candidateSnapshotRevision,
    ordinalMapChecksum: input.ordinalMapChecksum,
    candidateRowCount: sortedCandidates.length,
    artifacts,
  });

  return {
    artifacts,
    producerSet,
    queryVectorChecksum,
    candidateVectorChecksum,
    sourceRepresentationId: 'semantic_768',
    sourceRepresentationRevision: input.representationRevision,
    canonicalAuthority: false,
    retrievalVote: false,
    rankingPromotion: false,
    mutationAuthority: false,
  };
}
