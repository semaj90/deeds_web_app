import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolMock = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('$lib/server/db/client.js', () => ({ pool: poolMock }));

import { buildObservationFeatureProjectionV1 } from '../contracts/observation-feature-projection-v1.js';
import { buildClusterFeatureProjectionV1 } from '../contracts/cluster-feature-projection-v1.js';
import { materializeObservationFeatureProjectionV1 } from './observation-feature-materializer.js';

function projection() {
  return buildObservationFeatureProjectionV1({
    packetKey: 'packet:orfixture',
    sourceRef: 'src/fixture.ts',
    sourceRevision: `sha256:${'a'.repeat(64)}`,
    registryRevision: `sha256:${'b'.repeat(64)}`,
    representationId: 'semantic_768',
    representationRevision: `sha256:${'c'.repeat(64)}`,
    evidenceRefs: ['src/fixture.ts#sha256:source'],
    featureRevision: 'feature:fixture:v1',
    producerRevision: 'producer:fixture:v1',
  });
}

describe('observation feature materializer workspace lineage', () => {
  beforeEach(() => poolMock.query.mockReset());

  it('requires a non-empty workspace revision before issuing SQL', async () => {
    await expect(
      materializeObservationFeatureProjectionV1(projection(), { workspaceRevision: '  ' }),
    ).rejects.toThrow('ORF_WORKSPACE_REVISION_REQUIRED');
    expect(poolMock.query).not.toHaveBeenCalled();
  });

  it('writes and returns the supplied workspace revision', async () => {
    poolMock.query.mockResolvedValue({ rowCount: 1 });
    const workspaceRevision = `sha256:${'d'.repeat(64)}`;

    const receipt = await materializeObservationFeatureProjectionV1(projection(), { workspaceRevision });

    expect(poolMock.query).toHaveBeenCalledTimes(1);
    expect(poolMock.query.mock.calls[0][1][6]).toBe(workspaceRevision);
    expect(receipt.workspaceRevision).toBe(workspaceRevision);
  });

  it('persists the checksummed cluster projection beside scalar hints', async () => {
    poolMock.query.mockResolvedValue({ rowCount: 1 });
    const input = projection();
    const cluster = buildClusterFeatureProjectionV1({
      packetKey: input.packetKey,
      sourceRef: input.sourceRef,
      sourceVersionReceiptId: input.sourceVersionReceiptId,
      sourceRepresentationId: 'semantic_768',
      sourceRepresentationRevision: input.representationRevision,
      routingRepresentationId: null,
      autoencoderRevision: null,
      kmeans: { clusterId: 7, probability: 0.9, distanceToCentroid: 0.1, algorithmRevision: 'kmeans:r1', randomState: 3 },
      som: { row: 4, col: 9, distance: 0.2, algorithmRevision: 'som:r1' },
      graphCommunity: { communityId: null, algorithm: null, algorithmRevision: null, graphRevision: null },
      producerRevision: 'cluster:r1',
    });

    await materializeObservationFeatureProjectionV1(input, {
      workspaceRevision: `sha256:${'d'.repeat(64)}`,
      cluster,
    });

    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toContain('cluster_feature_projection');
    expect(JSON.parse(params[18])).toEqual(cluster);
    expect(params[19]).toBe(7);
    expect(params[20]).toBe(4);
    expect(params[21]).toBe(9);
  });

  it('rejects a cluster projection bound to another packet before issuing SQL', async () => {
    const input = projection();
    const cluster = buildClusterFeatureProjectionV1({
      packetKey: 'packet:other',
      sourceRef: input.sourceRef,
      sourceVersionReceiptId: input.sourceVersionReceiptId,
      sourceRepresentationId: 'semantic_768',
      sourceRepresentationRevision: input.representationRevision,
      routingRepresentationId: null,
      autoencoderRevision: null,
      kmeans: { clusterId: 7, probability: 0.9, distanceToCentroid: 0.1, algorithmRevision: 'kmeans:r1', randomState: 3 },
      som: { row: 4, col: 9, distance: 0.2, algorithmRevision: 'som:r1' },
      graphCommunity: { communityId: null, algorithm: null, algorithmRevision: null, graphRevision: null },
      producerRevision: 'cluster:r1',
    });

    await expect(materializeObservationFeatureProjectionV1(input, {
      workspaceRevision: `sha256:${'d'.repeat(64)}`,
      cluster,
    })).rejects.toThrow('ORF_CLUSTER_BINDING_REJECTED:CLUSTER_FEATURE_PROJECTION_IDENTITY_MISMATCH');
    expect(poolMock.query).not.toHaveBeenCalled();
  });
});
