import { describe, expect, it } from 'vitest';
import { buildSemanticCandidateSnapshotV1 } from './semantic-candidate-snapshot-v1.js';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';

const workspaceRevision = 'sha256:workspace-v1';
const representationRevision = 'semantic_768:v1';
const vector = (value: number) => Array.from({ length: 768 }, () => value);

function map() {
  return materializeCandidateOrdinalMap({
    candidateSnapshotRevision: 'snapshot:fixture-v1',
    workspaceRevision,
    producerRevision: 'producer:fixture-v1',
    candidates: [
      { canonicalId: 'chunk:b', packetKey: 'packet:b', sourceRef: 'src/b.ts', treeNodeId: null, symbolVersionId: null, workspaceRevision, sourceRevision: 'sha256:source-b', graphRevision: null, semanticRevision: representationRevision, degradedIdentity: false, evidenceRefs: [], representationBindings: [] },
      { canonicalId: 'chunk:a', packetKey: 'packet:a', sourceRef: 'src/a.ts', treeNodeId: null, symbolVersionId: null, workspaceRevision, sourceRevision: 'sha256:source-a', graphRevision: null, semanticRevision: representationRevision, degradedIdentity: false, evidenceRefs: [], representationBindings: [] },
    ],
  });
}

function rows() {
  return [
    { candidateOrdinal: 1, canonicalId: 'chunk:b', packetKey: 'packet:b', sourceRef: 'src/b.ts', sourceRevision: 'sha256:source-b', chunkRowId: 'chunk-row-b', embeddingDigest: 'sha256:embedding-b', vector: vector(2) },
    { candidateOrdinal: 0, canonicalId: 'chunk:a', packetKey: 'packet:a', sourceRef: 'src/a.ts', sourceRevision: 'sha256:source-a', chunkRowId: 'chunk-row-a', embeddingDigest: 'sha256:embedding-a', vector: vector(1) },
  ];
}

describe('SemanticCandidateSnapshotV1', () => {
  it('uses the ordinal map as the shared matrix order', () => {
    const snapshot = buildSemanticCandidateSnapshotV1({ ordinalMap: map(), representationRevision, rows: rows() });
    expect(snapshot.rows.map((row) => row.candidateOrdinal)).toEqual([0, 1]);
    expect(snapshot.rows.map((row) => row.packetKey)).toEqual(['packet:a', 'packet:b']);
    expect(snapshot.dimension).toBe(768);
    expect(snapshot.canonicalAuthority).toBe(false);
    expect(snapshot.writesPerformed).toBe(false);
    expect(snapshot.lineageQualified).toBe(false);
  });

  it('replays with stable identity and tensor checksums', () => {
    const first = buildSemanticCandidateSnapshotV1({ ordinalMap: map(), representationRevision, rows: rows() });
    const second = buildSemanticCandidateSnapshotV1({ ordinalMap: map(), representationRevision, rows: rows().reverse() });
    expect(second.candidateSnapshotRevision).toBe(first.candidateSnapshotRevision);
    expect(second.rowIdentityChecksum).toBe(first.rowIdentityChecksum);
    expect(second.tensorChecksum).toBe(first.tensorChecksum);
  });

  it('fails closed when a row does not match the ordinal map', () => {
    expect(() => buildSemanticCandidateSnapshotV1({
      ordinalMap: map(),
      representationRevision,
      rows: rows().map((row) => row.candidateOrdinal === 0 ? { ...row, sourceRevision: 'sha256:wrong' } : row),
    })).toThrow('SEMANTIC_CANDIDATE_SNAPSHOT_SOURCE_REVISION_MISMATCH');
  });

  it('fails closed for non-finite or incorrectly sized vectors', () => {
    expect(() => buildSemanticCandidateSnapshotV1({
      ordinalMap: map(),
      representationRevision,
      rows: rows().map((row) => row.candidateOrdinal === 0 ? { ...row, vector: [Number.NaN] } : row),
    })).toThrow('SEMANTIC_CANDIDATE_SNAPSHOT_DIMENSION');
  });
});
