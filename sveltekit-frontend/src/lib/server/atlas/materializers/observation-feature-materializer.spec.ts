import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolMock = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('$lib/server/db/client.js', () => ({ pool: poolMock }));

import { buildObservationFeatureProjectionV1 } from '../contracts/observation-feature-projection-v1.js';
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
});
