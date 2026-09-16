import { describe, expect, it } from 'vitest';
import { runHyperRagFusionRuntimeV1 } from './hyperrag-fusion-runtime-adapter-v1.js';

const repository = {
  findRelationshipsForEntities: async () => [],
} as any;

describe('HyperRAG live fusion adapter', () => {
  it('admits exact current canonical hits and keeps n-ary output additive', async () => {
    const result = await runHyperRagFusionRuntimeV1({
      queryId: 'query:fixture',
      workspaceRevision: 'workspace:1',
      producerRevision: 'hyperrag-test-v1',
      repository,
      packets: [{
        packet_key: 'packet:1',
        source_ref: 'src/example.ts',
        feature_id: 'feature:1',
        workspace_revision: 'workspace:1',
        identity_status: 'canonical',
        score: 0.8,
      }],
    });

    expect(result.status).toBe('ENRICHED');
    expect(result.acceptedCandidateCount).toBe(1);
    expect(result.acePayloads).toHaveLength(1);
    expect(result.acePayloads[0]?.packet_key).toBe('packet:1');
    expect(result.facade?.relationships).toEqual([]);
  });

  it('rejects stale or degraded hits without fabricating canonical identity', async () => {
    const result = await runHyperRagFusionRuntimeV1({
      queryId: 'query:fixture',
      workspaceRevision: 'workspace:current',
      producerRevision: 'hyperrag-test-v1',
      repository,
      packets: [
        { packet_key: 'packet:old', source_ref: 'src/old.ts', feature_id: 'feature:old', workspace_revision: 'workspace:old', identity_status: 'canonical' },
        { packet_key: 'packet:degraded', source_ref: 'src/degraded.ts', feature_id: 'feature:degraded', workspace_revision: 'workspace:current', identity_status: 'degraded' },
      ],
    });

    expect(result.status).toBe('NO_CANONICAL_HITS');
    expect(result.acceptedCandidateCount).toBe(0);
    expect(result.rejectedCandidateCount).toBe(2);
    expect(result.acePayloads).toEqual([]);
  });
});
