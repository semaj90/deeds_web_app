import { describe, expect, it } from 'vitest';
import { topologyCoordinate4V1Schema } from '../orchestration/atlas-pipeline-stage-contracts-v1.js';
import {
  assertKMeansAssignmentV1,
  buildKMeansAssignmentV1,
  KMeansAssignmentV1Schema,
  ManifoldPca4V1Schema,
  RepresentationFamilyV1Schema,
  SOMAssignmentV1Schema,
} from './representation-gradient-v1.js';

const revision = (digit: string) => `sha256:${digit.repeat(64)}`;

describe('RepresentationFamilyV1', () => {
  it('keeps same-dimensional semantic MRL and autoencoder representations distinct', () => {
    expect(RepresentationFamilyV1Schema.parse('SEMANTIC_EMBEDDING')).not.toBe(
      RepresentationFamilyV1Schema.parse('AUTOENCODER_LATENT')
    );
    expect(RepresentationFamilyV1Schema.safeParse('RESIDENCY_TIER').success).toBe(false);
  });
});

describe('ManifoldPca4V1 representation identity', () => {
  const pca = {
    schema: 'atlas.manifold-pca4.v1' as const,
    representationId: 'manifold_pca_4' as const,
    representationRevision: revision('1'),
    canonicalCandidateId: 'packet://candidate/1',
    workspaceRevision: revision('2'),
    candidateRevision: revision('3'),
    inputArtifactRef: 'artifact://semantic/1',
    inputArtifactRevision: revision('4'),
    pcaProvenance: {
      basisRevision: revision('5'),
      trainingCohortRevision: revision('6'),
      meanDigest: revision('7'),
      componentsDigest: revision('8'),
    },
    pcaCoordinates: [0.1, 0.2, 0.3, 0.4] as [number, number, number, number],
    outputChecksum: revision('9'),
    canonicalAuthority: false as const,
  };

  it('requires independent basis, input artifact, representation and candidate revisions', () => {
    expect(ManifoldPca4V1Schema.parse(pca)).toEqual(pca);
    expect(ManifoldPca4V1Schema.safeParse({ ...pca, inputArtifactRevision: undefined }).success).toBe(false);
    expect(ManifoldPca4V1Schema.safeParse({ ...pca, canonicalAuthority: true }).success).toBe(false);
  });

  it('rejects a topology coordinate as PCA and PCA coordinates as topology', () => {
    const topology = {
      schema: 'atlas.topology-coordinate4.v1' as const,
      workspaceRevision: revision('2'),
      graphRevision: revision('3'),
      canonicalId: 'packet://candidate/1',
      coordinate: [0.1, 0.2, 0.3, 0.4] as [number, number, number, number],
      routeSignature: null,
      communityId: null,
      evidenceRefs: [],
      canonicalAuthority: false as const,
    };

    expect(topologyCoordinate4V1Schema.parse(topology)).toEqual(topology);
    expect(ManifoldPca4V1Schema.safeParse(topology).success).toBe(false);
    expect(topologyCoordinate4V1Schema.safeParse(pca).success).toBe(false);
  });
});

describe('SOMAssignmentV1', () => {
  const assignment = {
    schema: 'atlas.som-assignment.v1' as const,
    canonicalCandidateId: 'packet://candidate/1',
    candidateOrdinal: 14,
    candidateSnapshotRevision: 'candidate-snapshot:sha256:abc123',
    ordinalMapChecksum: revision('1'),
    workspaceRevision: revision('2'),
    sourceRevision: revision('3'),
    inputArtifactRef: 'artifact://latent/1',
    inputArtifactChecksum: revision('4'),
    inputRepresentationId: 'latent_64',
    inputRepresentationRevision: revision('5'),
    somModelRevision: revision('6'),
    cell: { row: 3, column: 7 },
    assignmentChecksum: revision('7'),
    canonicalAuthority: false as const,
  };

  it('binds one candidate assignment to its exact input and topology revisions', () => {
    expect(SOMAssignmentV1Schema.parse(assignment)).toEqual(assignment);
  });

  it('requires candidate, ordinal-map, source, input and model lineage', () => {
    for (const field of [
      'candidateSnapshotRevision',
      'ordinalMapChecksum',
      'workspaceRevision',
      'sourceRevision',
      'inputArtifactChecksum',
      'inputRepresentationRevision',
      'somModelRevision',
      'assignmentChecksum',
    ]) {
      expect(SOMAssignmentV1Schema.safeParse({ ...assignment, [field]: undefined }).success).toBe(false);
    }
  });

  it('rejects canonical authority, invalid ordinals, and vector payloads', () => {
    expect(SOMAssignmentV1Schema.safeParse({ ...assignment, canonicalAuthority: true }).success).toBe(false);
    expect(SOMAssignmentV1Schema.safeParse({ ...assignment, candidateOrdinal: -1 }).success).toBe(false);
    expect(SOMAssignmentV1Schema.safeParse({ ...assignment, cell: { row: -1, column: 0 } }).success).toBe(false);
    expect(SOMAssignmentV1Schema.safeParse({ ...assignment, vector: [0.1, 0.2] }).success).toBe(false);
  });
});

describe('KMeansAssignmentV1', () => {
  const assignmentInput = {
    canonicalCandidateId: 'chunk://candidate/1',
    candidateOrdinal: 4,
    candidateCount: 12,
    candidateSnapshotRevision: revision('1'),
    ordinalMapChecksum: revision('2'),
    workspaceRevision: revision('3'),
    sourceRevision: revision('4'),
    inputArtifactRef: 'artifact://semantic-768/snapshot-1',
    inputArtifactChecksum: revision('5'),
    inputRepresentationId: 'semantic_768',
    inputRepresentationRevision: revision('6'),
    algorithmRevision: revision('7'),
    parametersChecksum: revision('8'),
    centroidId: 'centroid://kmeans/2',
    centroidChecksum: revision('9'),
    clusterOrdinal: 2,
  };

  it('seals exact candidate, snapshot, input, algorithm, centroid, and assignment lineage', () => {
    const assignment = buildKMeansAssignmentV1(assignmentInput);
    expect(buildKMeansAssignmentV1(assignmentInput)).toEqual(assignment);
    expect(assertKMeansAssignmentV1(assignment)).toEqual(assignment);
    expect(assignment.canonicalAuthority).toBe(false);
    expect(assignment.assignmentChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('rejects candidate ordinal overflow, authority promotion, missing lineage, and tampering', () => {
    expect(() => buildKMeansAssignmentV1({ ...assignmentInput, candidateOrdinal: 12 }))
      .toThrow(/ORDINAL_OUT_OF_RANGE/);
    const assignment = buildKMeansAssignmentV1(assignmentInput);
    expect(KMeansAssignmentV1Schema.safeParse({ ...assignment, canonicalAuthority: true }).success).toBe(false);
    expect(KMeansAssignmentV1Schema.safeParse({ ...assignment, sourceRevision: undefined }).success).toBe(false);
    expect(() => assertKMeansAssignmentV1({ ...assignment, centroidChecksum: revision('a') }))
      .toThrow(/CHECKSUM_MISMATCH/);
  });
});
