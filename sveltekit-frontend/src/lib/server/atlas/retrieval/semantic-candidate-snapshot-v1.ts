import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import {
  assertCandidateOrdinalMapIntegrityV1,
  type CandidateOrdinalMapV1,
} from '../features/canonical-candidate-v1.js';
import {
  buildSemantic768IdentityManifestV1,
  type Semantic768IdentityManifestV1,
} from './semantic768-identity-manifest-v1.js';

export const SEMANTIC_CANDIDATE_SNAPSHOT_SCHEMA = 'atlas.semantic-candidate-snapshot.v1' as const;

export type SemanticCandidateSnapshotRowV1 = {
  candidateOrdinal: number;
  canonicalId: string;
  packetKey: string;
  sourceRef: string;
  sourceRevision: string;
  chunkRowId: string;
  embeddingDigest: string;
  vector: number[];
};

export type SemanticCandidateSnapshotV1 = {
  schema: typeof SEMANTIC_CANDIDATE_SNAPSHOT_SCHEMA;
  candidateSnapshotRevision: string;
  candidateOrdinalMapChecksum: string;
  workspaceRevision: string;
  representationId: 'semantic_768';
  representationRevision: string;
  dimension: 768;
  rowCount: number;
  rows: SemanticCandidateSnapshotRowV1[];
  identityManifest: Semantic768IdentityManifestV1;
  identityManifestChecksum: string;
  rowIdentityChecksum: string;
  tensorChecksum: string;
  lineageQualified: false;
  canonicalAuthority: false;
  writesPerformed: false;
};

function required(value: string, field: string): string {
  if (!value.trim()) throw new Error(`SEMANTIC_CANDIDATE_SNAPSHOT_${field.toUpperCase()}_REQUIRED`);
  return value.normalize('NFC');
}

function assertVector(vector: readonly number[], ordinal: number): number[] {
  if (vector.length !== 768) throw new Error(`SEMANTIC_CANDIDATE_SNAPSHOT_DIMENSION:${ordinal}`);
  if (vector.some((value) => !Number.isFinite(value))) {
    throw new Error(`SEMANTIC_CANDIDATE_SNAPSHOT_NONFINITE:${ordinal}`);
  }
  return vector.map((value) => (Object.is(value, -0) ? 0 : value));
}

function canonicalRows(rows: readonly SemanticCandidateSnapshotRowV1[]): SemanticCandidateSnapshotRowV1[] {
  if (rows.length === 0) throw new Error('SEMANTIC_CANDIDATE_SNAPSHOT_EMPTY');
  const sorted = [...rows].sort((a, b) => a.candidateOrdinal - b.candidateOrdinal);
  return sorted.map((row, index) => {
    if (row.candidateOrdinal !== index) {
      throw new Error(`SEMANTIC_CANDIDATE_SNAPSHOT_ORDINAL_SEQUENCE:${index}`);
    }
    return {
      candidateOrdinal: row.candidateOrdinal,
      canonicalId: required(row.canonicalId, 'canonical_id'),
      packetKey: required(row.packetKey, 'packet_key'),
      sourceRef: required(row.sourceRef, 'source_ref'),
      sourceRevision: required(row.sourceRevision, 'source_revision'),
      chunkRowId: required(row.chunkRowId, 'chunk_row_id'),
      embeddingDigest: required(row.embeddingDigest, 'embedding_digest'),
      vector: assertVector(row.vector, row.candidateOrdinal),
    };
  });
}

/**
 * Build the one semantic_768 matrix shared by Qdrant and cuVS.
 * CandidateOrdinalMapV1 supplies identity and row order; this function never
 * derives ordinals from database order, vector order, Qdrant IDs, or sorting
 * after the fact. The result is a derived, read-only artifact.
 */
export function buildSemanticCandidateSnapshotV1(input: {
  ordinalMap: CandidateOrdinalMapV1;
  representationRevision: string;
  rows: readonly SemanticCandidateSnapshotRowV1[];
}): SemanticCandidateSnapshotV1 {
  assertCandidateOrdinalMapIntegrityV1(input.ordinalMap);
  const representationRevision = required(input.representationRevision, 'representation_revision');
  if (input.rows.length !== input.ordinalMap.rowCount) {
    throw new Error('SEMANTIC_CANDIDATE_SNAPSHOT_ROW_COUNT_MISMATCH');
  }

  const rows = canonicalRows(input.rows);
  const mapCandidates = input.ordinalMap.candidates;
  const seenChunkRows = new Set<string>();
  const seenPacketKeys = new Set<string>();
  for (const row of rows) {
    const candidate = mapCandidates[row.candidateOrdinal];
    if (!candidate) throw new Error(`SEMANTIC_CANDIDATE_SNAPSHOT_ORDINAL_NOT_IN_MAP:${row.candidateOrdinal}`);
    if (candidate.canonicalId !== row.canonicalId) throw new Error(`SEMANTIC_CANDIDATE_SNAPSHOT_CANONICAL_ID_MISMATCH:${row.candidateOrdinal}`);
    if (candidate.packetKey !== row.packetKey) throw new Error(`SEMANTIC_CANDIDATE_SNAPSHOT_PACKET_KEY_MISMATCH:${row.candidateOrdinal}`);
    if (candidate.sourceRef !== row.sourceRef) throw new Error(`SEMANTIC_CANDIDATE_SNAPSHOT_SOURCE_REF_MISMATCH:${row.candidateOrdinal}`);
    if (candidate.sourceRevision !== row.sourceRevision) throw new Error(`SEMANTIC_CANDIDATE_SNAPSHOT_SOURCE_REVISION_MISMATCH:${row.candidateOrdinal}`);
    if (seenChunkRows.has(row.chunkRowId)) throw new Error(`SEMANTIC_CANDIDATE_SNAPSHOT_CHUNK_DUPLICATE:${row.chunkRowId}`);
    if (seenPacketKeys.has(row.packetKey)) throw new Error(`SEMANTIC_CANDIDATE_SNAPSHOT_PACKET_DUPLICATE:${row.packetKey}`);
    seenChunkRows.add(row.chunkRowId);
    seenPacketKeys.add(row.packetKey);
  }

  const identityManifest = buildSemantic768IdentityManifestV1({
    representationRevision,
    rows: rows.map(({ packetKey, sourceRevision, vector }) => ({ packetKey, sourceRevision, vector })),
  });
  const rowIdentityChecksum = canonicalSha256V1({
    schema: SEMANTIC_CANDIDATE_SNAPSHOT_SCHEMA,
    workspaceRevision: input.ordinalMap.workspaceRevision,
    candidateOrdinalMapChecksum: input.ordinalMap.ordinalMapChecksum,
    representationRevision,
    rows: rows.map(({ vector: _vector, ...identity }) => identity),
  });
  const tensorChecksum = canonicalSha256V1({
    schema: 'atlas.semantic-candidate-tensor.v1',
    representationId: 'semantic_768',
    representationRevision,
    dimension: 768,
    rows: rows.map(({ candidateOrdinal, vector }) => ({ candidateOrdinal, vector })),
  });
  const candidateSnapshotRevision = `sha256:${canonicalSha256V1({
    schema: SEMANTIC_CANDIDATE_SNAPSHOT_SCHEMA,
    workspaceRevision: input.ordinalMap.workspaceRevision,
    candidateOrdinalMapChecksum: input.ordinalMap.ordinalMapChecksum,
    representationRevision,
    identityManifestChecksum: identityManifest.identityManifestChecksum,
    rowIdentityChecksum,
    tensorChecksum,
  })}`;

  return {
    schema: SEMANTIC_CANDIDATE_SNAPSHOT_SCHEMA,
    candidateSnapshotRevision,
    candidateOrdinalMapChecksum: input.ordinalMap.ordinalMapChecksum,
    workspaceRevision: input.ordinalMap.workspaceRevision,
    representationId: 'semantic_768',
    representationRevision,
    dimension: 768,
    rowCount: rows.length,
    rows,
    identityManifest,
    identityManifestChecksum: identityManifest.identityManifestChecksum,
    rowIdentityChecksum,
    tensorChecksum,
    lineageQualified: false,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

export function assertSemanticCandidateSnapshotV1(
  snapshot: SemanticCandidateSnapshotV1,
  ordinalMap: CandidateOrdinalMapV1,
): void {
  if (snapshot.schema !== SEMANTIC_CANDIDATE_SNAPSHOT_SCHEMA) throw new Error('SEMANTIC_CANDIDATE_SNAPSHOT_SCHEMA_MISMATCH');
  if (snapshot.canonicalAuthority || snapshot.writesPerformed || snapshot.lineageQualified) {
    throw new Error('SEMANTIC_CANDIDATE_SNAPSHOT_PROMOTION_NOT_ALLOWED');
  }
  const rebuilt = buildSemanticCandidateSnapshotV1({
    ordinalMap,
    representationRevision: snapshot.representationRevision,
    rows: snapshot.rows,
  });
  if (rebuilt.candidateSnapshotRevision !== snapshot.candidateSnapshotRevision
    || rebuilt.rowIdentityChecksum !== snapshot.rowIdentityChecksum
    || rebuilt.tensorChecksum !== snapshot.tensorChecksum) {
    throw new Error('SEMANTIC_CANDIDATE_SNAPSHOT_CHECKSUM_MISMATCH');
  }
}
