import { describe, expect, it } from 'vitest';
import { topologyCoordinate4V1Schema } from '../orchestration/atlas-pipeline-stage-contracts-v1.js';
import { ManifoldPca4V1Schema } from './representation-gradient-v1.js';

const revision = (digit: string) => `sha256:${digit.repeat(64)}`;

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
