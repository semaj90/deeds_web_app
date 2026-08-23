import { describe, expect, it } from 'vitest';

import {
  buildRepresentationMatrixIndexContractV1,
  verifyRepresentationMatrixIndexContractV1,
} from './representation-matrix-index-contract-v1.js';

const digest = (char: string) => char.repeat(64);

function validInput() {
  return {
    candidateSnapshotRevision: 'candidate-snapshot:v1',
    ordinalMapChecksum: digest('a'),
    workspaceRevision: 'sha256:' + digest('b'),
    matrices: [
      {
        representationId: 'semantic_768',
        role: 'CANONICAL_SEMANTIC' as const,
        sourceRepresentationId: null,
        rows: 4,
        cols: 768,
        dtype: 'float32' as const,
        storageFormat: 'NPY_F32_MMAP' as const,
        candidateSnapshotRevision: 'candidate-snapshot:v1',
        ordinalMapChecksum: digest('a'),
        rowIdentityChecksum: digest('c'),
        matrixChecksum: digest('d'),
        workspaceRevision: 'sha256:' + digest('b'),
        representationRevision: 'semantic_768@v1',
        producerRevision: 'semantic-freezer@v2',
        canonicalAuthority: false as const,
      },
      {
        representationId: 'latent_128',
        role: 'DERIVED_LATENT' as const,
        sourceRepresentationId: 'semantic_768',
        rows: 4,
        cols: 128,
        dtype: 'float16' as const,
        storageFormat: 'MMAP_F16' as const,
        candidateSnapshotRevision: 'candidate-snapshot:v1',
        ordinalMapChecksum: digest('a'),
        rowIdentityChecksum: digest('c'),
        matrixChecksum: digest('e'),
        workspaceRevision: 'sha256:' + digest('b'),
        representationRevision: 'latent_128@v1',
        producerRevision: 'latent-builder@v1',
        canonicalAuthority: false as const,
      },
      {
        representationId: 'latent_64',
        role: 'DERIVED_LATENT' as const,
        sourceRepresentationId: 'semantic_768',
        rows: 4,
        cols: 64,
        dtype: 'int8' as const,
        storageFormat: 'MMAP_I8' as const,
        candidateSnapshotRevision: 'candidate-snapshot:v1',
        ordinalMapChecksum: digest('a'),
        rowIdentityChecksum: digest('c'),
        matrixChecksum: digest('f'),
        workspaceRevision: 'sha256:' + digest('b'),
        representationRevision: 'latent_64@v1',
        producerRevision: 'latent-builder@v1',
        canonicalAuthority: false as const,
      },
      {
        representationId: 'candidate_features_v1',
        role: 'CANDIDATE_FEATURES' as const,
        sourceRepresentationId: null,
        rows: 4,
        cols: 12,
        dtype: 'float32' as const,
        storageFormat: 'ARROW_IPC' as const,
        candidateSnapshotRevision: 'candidate-snapshot:v1',
        ordinalMapChecksum: digest('a'),
        rowIdentityChecksum: digest('c'),
        matrixChecksum: digest('1'),
        workspaceRevision: 'sha256:' + digest('b'),
        representationRevision: 'candidate_features@v1',
        producerRevision: 'feature-columnar@v1',
        canonicalAuthority: false as const,
      },
    ],
    semanticExecutors: [
      {
        executor: 'PGVECTOR_EXACT' as const,
        logicalLane: 'semantic' as const,
        representationId: 'semantic_768' as const,
        representationRevision: 'semantic_768@v1',
        candidateSnapshotRevision: 'candidate-snapshot:v1',
        ordinalMapChecksum: digest('a'),
        backendLocation: 'postgres:codebase_chunk_index.content_embedding_768',
        physicalVectorName: null,
        indexKind: 'EXACT' as const,
        returnsCandidateOrdinals: true as const,
        returnsRawVectors: false as const,
        identityAuthority: false as const,
        independentFusionVote: false as const,
      },
      {
        executor: 'QDRANT_HNSW' as const,
        logicalLane: 'semantic' as const,
        representationId: 'semantic_768' as const,
        representationRevision: 'semantic_768@v1',
        candidateSnapshotRevision: 'candidate-snapshot:v1',
        ordinalMapChecksum: digest('a'),
        backendLocation: 'qdrant:codebase_chunks_768_v2',
        physicalVectorName: 'content',
        indexKind: 'HNSW' as const,
        returnsCandidateOrdinals: true as const,
        returnsRawVectors: false as const,
        identityAuthority: false as const,
        independentFusionVote: false as const,
      },
      {
        executor: 'CUVS_EXACT' as const,
        logicalLane: 'semantic' as const,
        representationId: 'semantic_768' as const,
        representationRevision: 'semantic_768@v1',
        candidateSnapshotRevision: 'candidate-snapshot:v1',
        ordinalMapChecksum: digest('a'),
        backendLocation: 'artifact:semantic_768.npy',
        physicalVectorName: null,
        indexKind: 'EXACT' as const,
        returnsCandidateOrdinals: true as const,
        returnsRawVectors: false as const,
        identityAuthority: false as const,
        independentFusionVote: false as const,
      },
      {
        executor: 'CAGRA' as const,
        logicalLane: 'semantic' as const,
        representationId: 'semantic_768' as const,
        representationRevision: 'semantic_768@v1',
        candidateSnapshotRevision: 'candidate-snapshot:v1',
        ordinalMapChecksum: digest('a'),
        backendLocation: 'gpu:cagra:semantic_768@v1',
        physicalVectorName: null,
        indexKind: 'GRAPH_ANN' as const,
        returnsCandidateOrdinals: true as const,
        returnsRawVectors: false as const,
        identityAuthority: false as const,
        independentFusionVote: false as const,
      },
      {
        executor: 'TURBOVEC' as const,
        logicalLane: 'semantic' as const,
        representationId: 'semantic_768' as const,
        representationRevision: 'semantic_768@v1',
        candidateSnapshotRevision: 'candidate-snapshot:v1',
        ordinalMapChecksum: digest('a'),
        backendLocation: 'artifact:turbovec:semantic_768@v1',
        physicalVectorName: null,
        indexKind: 'COMPRESSED_ANN' as const,
        returnsCandidateOrdinals: true as const,
        returnsRawVectors: false as const,
        identityAuthority: false as const,
        independentFusionVote: false as const,
      },
    ],
  };
}

describe('representation matrix/index contract', () => {
  it('freezes one semantic lane across multiple executors without extra votes', () => {
    const contract = buildRepresentationMatrixIndexContractV1(validInput());
    expect(contract.semanticLaneVoteCount).toBe(1);
    expect(contract.largeVectorTransportAllowed).toBe(false);
    expect(contract.semanticExecutors.every((executor) => executor.independentFusionVote === false)).toBe(true);
    expect(contract.semanticExecutors.find((executor) => executor.executor === 'QDRANT_HNSW')?.physicalVectorName).toBe('content');
    expect(verifyRepresentationMatrixIndexContractV1(contract)).toEqual(contract);
  });

  it('rejects a non-semantic_768 canonical matrix', () => {
    const input = validInput();
    input.matrices[0] = { ...input.matrices[0], representationId: 'semantic_512' };
    expect(() => buildRepresentationMatrixIndexContractV1(input)).toThrow('SEMANTIC_768_SINGLE_CANONICAL_MATRIX_REQUIRED');
  });

  it('rejects latent matrices that are not derived from semantic_768', () => {
    const input = validInput();
    input.matrices[1] = { ...input.matrices[1], sourceRepresentationId: 'semantic_128_mrl' };
    expect(() => buildRepresentationMatrixIndexContractV1(input)).toThrow('LATENT_SOURCE_REPRESENTATION_MISMATCH:latent_128');
  });

  it('rejects row and ordinal alignment drift', () => {
    const rowDrift = validInput();
    rowDrift.matrices[3] = { ...rowDrift.matrices[3], rows: 3 };
    expect(() => buildRepresentationMatrixIndexContractV1(rowDrift)).toThrow('MATRIX_ROW_COUNT_ALIGNMENT_REQUIRED');

    const ordinalDrift = validInput();
    ordinalDrift.semanticExecutors[1] = { ...ordinalDrift.semanticExecutors[1], ordinalMapChecksum: digest('9') };
    expect(() => buildRepresentationMatrixIndexContractV1(ordinalDrift)).toThrow('EXECUTOR_ORDINAL_MAP_CHECKSUM_MISMATCH:QDRANT_HNSW');
  });

  it('detects contract tampering', () => {
    const contract = buildRepresentationMatrixIndexContractV1(validInput());
    expect(() => verifyRepresentationMatrixIndexContractV1({
      ...contract,
      workspaceRevision: 'sha256:' + digest('9'),
    })).toThrow('REPRESENTATION_MATRIX_INDEX_CONTRACT_CHECKSUM_MISMATCH');
  });
});
