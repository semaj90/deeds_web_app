import { describe, expect, it } from 'vitest';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import { buildSemanticCandidateSnapshotV1 } from './semantic-candidate-snapshot-v1.js';
import {
  assertCandidatePopulationFreezeV1,
  buildCandidatePopulationFreezeV1,
} from './candidate-population-freeze-v1.js';

const workspaceRevision = 'sha256:workspace-v1';
const representationRevision = 'semantic_768:v1';
const sourceAuthorityReceiptChecksum = `sha256:${'a'.repeat(64)}`;
const vector = (value: number) => Array.from({ length: 768 }, () => value);

function inputs() {
  const ordinalMap = materializeCandidateOrdinalMap({
    candidateSnapshotRevision: 'snapshot:fixture-v1',
    workspaceRevision,
    producerRevision: 'producer:fixture-v1',
    candidates: [
      { canonicalId: 'chunk:a', packetKey: 'packet:a', sourceRef: 'src/a.ts', treeNodeId: null, symbolVersionId: null, workspaceRevision, sourceRevision: 'sha256:source-a', graphRevision: null, semanticRevision: representationRevision, degradedIdentity: false, evidenceRefs: [], representationBindings: [] },
      { canonicalId: 'chunk:b', packetKey: 'packet:b', sourceRef: 'src/b.ts', treeNodeId: null, symbolVersionId: null, workspaceRevision, sourceRevision: 'sha256:source-b', graphRevision: null, semanticRevision: representationRevision, degradedIdentity: false, evidenceRefs: [], representationBindings: [] },
    ],
  });
  const semanticSnapshot = buildSemanticCandidateSnapshotV1({
    ordinalMap,
    representationRevision,
    rows: [
      { candidateOrdinal: 0, canonicalId: 'chunk:a', packetKey: 'packet:a', sourceRef: 'src/a.ts', sourceRevision: 'sha256:source-a', chunkRowId: 'row-a', embeddingDigest: 'sha256:embedding-a', vector: vector(1) },
      { candidateOrdinal: 1, canonicalId: 'chunk:b', packetKey: 'packet:b', sourceRef: 'src/b.ts', sourceRevision: 'sha256:source-b', chunkRowId: 'row-b', embeddingDigest: 'sha256:embedding-b', vector: vector(2) },
    ],
  });
  return { ordinalMap, semanticSnapshot };
}

describe('CandidatePopulationFreezeV1', () => {
  it('binds one ordinal map and semantic matrix to explicit lineage evidence', () => {
    const value = buildCandidatePopulationFreezeV1({ ...inputs(), workspaceRevision, sourceAuthorityReceiptChecksum, lineageQualified: true, semanticComplete: true });
    expect(value.rowCount).toBe(2);
    expect(value.downstreamAllowed).toBe(true);
    expect(value.canonicalAuthority).toBe(false);
    expect(value.writesPerformed).toBe(false);
    expect(() => assertCandidatePopulationFreezeV1(value)).not.toThrow();
  });

  it('rejects the current non-authoritative lineage state', () => {
    expect(() => buildCandidatePopulationFreezeV1({ ...inputs(), workspaceRevision, sourceAuthorityReceiptChecksum, lineageQualified: false, semanticComplete: true })).toThrow('LINEAGE_REQUIRED');
    expect(() => buildCandidatePopulationFreezeV1({ ...inputs(), workspaceRevision, sourceAuthorityReceiptChecksum, lineageQualified: true, semanticComplete: false })).toThrow('MATRIX_INCOMPLETE');
  });

  it('rejects mismatched workspace or ordinal identity', () => {
    const value = inputs();
    expect(() => buildCandidatePopulationFreezeV1({ ...value, workspaceRevision: 'sha256:other', sourceAuthorityReceiptChecksum, lineageQualified: true, semanticComplete: true })).toThrow('WORKSPACE_REVISION_MISMATCH');
    expect(() => buildCandidatePopulationFreezeV1({ ...value, workspaceRevision, sourceAuthorityReceiptChecksum, lineageQualified: true, semanticComplete: true, semanticSnapshot: { ...value.semanticSnapshot, candidateOrdinalMapChecksum: 'sha256:' + '0'.repeat(64) } })).toThrow('ORDINAL_MAP_MISMATCH');
  });
});
