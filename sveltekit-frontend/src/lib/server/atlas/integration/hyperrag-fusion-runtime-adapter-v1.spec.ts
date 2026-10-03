import { describe, expect, it } from 'vitest';
import { buildAcePacketV3, buildFeatureRelationship } from '@deeds/parent-atlas';
import { enrichAcePacketV3WithHyperRagV1, runHyperRagFusionRuntimeV1 } from './hyperrag-fusion-runtime-adapter-v1.js';

const sha = (c: string) => `sha256:${c.repeat(64)}`;

function packetV3() {
	const pending = <T>(data: T) => ({ status: 'PENDING' as const, revision: null, evidence_refs: [], data });
	return buildAcePacketV3({
		base: {
			packet_revision: 'packet-rev-1',
			envelope: { packet_key: 'packet:1', source_ref: 'src/example.ts', canonical_source_ref: 'src/example.ts', feature_id: 'feature:1', source_revision: 'source-rev-1' },
			hypergraph: null,
			producer_revision: 'packet-producer-1',
		},
		identity: {
			packet_key: 'packet:1', source_ref: 'src/example.ts', workspace_revision: 'workspace:1', source_revision: 'source-rev-1',
			packet_revision: 'packet-rev-1', producer_revision: 'packet-producer-1', representation_id: 'semantic_768', representation_revision: null,
			feature_revision: null, graph_revision: null, symbol_version_id: null, tree_node_id: null,
		},
		source: pending({ language: 'typescript', source_digest: sha('a'), start_byte: null, end_byte: null, ast_state: 'NOT_MATERIALIZED' as const }),
		semantic: pending({
			summary: pending({ text: null, input_digest: null, model_revision: null }),
			embedding: pending({ model: null, dimension: null, input_digest: null, embedding_digest: null, vector_ref: null }),
			keywords: [], entities: [], concept_ids: [], domain_class: null,
		}),
		topology: pending({ community_id: null, pagerank: null, som: null, kmeans_cluster: null, centroid_refs: [] }),
		residency: pending({ tier: 'COLD' as const, lod: 'IDENTITY', utility: null, prefetch_reasons: [], cache_identity_checksum: null }),
		evidence: pending({ refs: [], contradictions: [], stale_refs: [] }),
	});
}

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

	it('runs bounded typed HyperRAG evidence through the v3 composition boundary', async () => {
		const relation = buildFeatureRelationship({
			relationship_id: 'relationship:feature-evidence', relationship_type: 'supported_by',
			participants: [
				{ role: 'feature', entity_type: 'feature', entity_id: 'feature:1' },
				{ role: 'source', entity_type: 'source', entity_id: 'src/example.ts' },
			], cardinality: [], source_ref: 'src/example.ts', source_revision: 'source-rev-1',
			relationship_revision: 'relationship-rev-1', producer_revision: 'relationship-producer-1',
			evidence_refs: ['evidence:exact-source'], confidence: 0.9, metadata: {},
		});
		const result = await enrichAcePacketV3WithHyperRagV1({
			packet: packetV3(), queryId: 'query:1', producerRevision: 'hyperrag-producer-1',
			repository: { findRelationshipsForEntities: async () => [relation] } as any,
			maximumHopCount: 2, fanoutLimit: 3,
		});

		expect(result.status).toBe('ENRICHED');
		expect(result.packet.base.hypergraph?.packet_key).toBe('packet:1');
		expect(result.packet.base.hypergraph?.lineage.source_snapshot_revision).toBe('workspace:1');
		expect(result.packet.base.hypergraph?.retrieval.graph_hops_executed).toBeLessThanOrEqual(2);
		expect(result.packet.base.hypergraph?.retrieval.fanout_limit).toBe(3);
		expect(result.packet.base.hypergraph?.relationship_evidence[0]?.relationship_id).toBe('relationship:feature-evidence');
	});
});
