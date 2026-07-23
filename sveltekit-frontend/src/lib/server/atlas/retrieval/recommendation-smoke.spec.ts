import { describe, expect, it } from 'vitest';
import { ACPRecommendationPacketSchema, evaluateTaskPromotion } from '../contracts/recommendation.js';
import { parseRgJsonLines, planKMeansRouting, validateTreeNodeIdentities } from './candidate-foundation.js';

describe('Atlas recommendation fixed smoke', () => {
  it('keeps lexical evidence and global ANN active before bounded ACP task promotion', () => {
    const queryId = 'query:cluster-routing';
    validateTreeNodeIdentities([
      { packetKey: 'packet:score-clusters', treeNodeId: 'tree:scoreAllClusters', sourceRef: 'src/retrieval/clusters.ts', corpusSnapshotId: 'snapshot:fixture' },
      { packetKey: 'packet:router', treeNodeId: 'tree:retrievalRouter', sourceRef: 'src/retrieval/router.ts', corpusSnapshotId: 'snapshot:fixture' },
      { packetKey: 'packet:workflow', treeNodeId: 'tree:recommendationWorkflow', sourceRef: 'src/recommendations/workflow.ts', corpusSnapshotId: 'snapshot:fixture' },
    ]);

    const routing = planKMeansRouting([1, 0], {
      modelId: 'kmeans-384-fixture', corpusSnapshotId: 'snapshot:fixture', vectorLaneId: 'dense_384', dimension: 2,
      centroids: [{ clusterId: 3, vector: [1, 0] }, { clusterId: 8, vector: [0, 1] }, { clusterId: 11, vector: [-1, 0] }],
    });
    expect(routing).toMatchObject({ status: 'ACTIVE', selectedClusterIds: [3, 8, 11], globalAnnFallback: true });

    const lexical = parseRgJsonLines([
      JSON.stringify({ type: 'match', data: { path: { text: 'src/retrieval/clusters.ts' }, line_number: 8, lines: { text: 'export function scoreAllClusters() {}\n' }, submatches: [{ start: 16, end: 32 }] } }),
    ], 'C:/fixture', 'scoreAllClusters');
    expect(lexical).toHaveLength(1);

    const packet = ACPRecommendationPacketSchema.parse({
      contract: 'atlas.acp.recommendation.v1', query_id: queryId, intent: 'inspect', corpus_snapshot_id: 'snapshot:fixture',
      budget: { max_source_files: 3, max_raw_tokens: 12000, max_tool_calls: 3, max_graph_hops: 2 },
      permissions: { mode: 'proposal_only', allowed_roots: ['src'] },
      candidates: [
        { tree_node_id: 'tree:scoreAllClusters', source_ref: 'src/retrieval/clusters.ts', relevance_probability: 0.95, reason_codes: ['EXACT_IDENTIFIER', 'KMEANS_ROUTE'], evidence_refs: ['rg:scoreAllClusters:8'], estimated_context_tokens: 450, graph_paths: [{ nodes: ['tree:retrievalRouter', 'tree:scoreAllClusters'], edges: ['CALLS'], path_score: 0.9 }] },
        { tree_node_id: 'tree:recommendationWorkflow', source_ref: 'src/recommendations/workflow.ts', relevance_probability: 0.8, reason_codes: ['GRAPH_WORKFLOW_PATH'], evidence_refs: ['graph:workflow'], estimated_context_tokens: 350, graph_paths: [{ nodes: ['tree:retrievalRouter', 'tree:scoreAllClusters', 'tree:recommendationWorkflow'], edges: ['CALLS', 'INVOKES_WORKFLOW'], path_score: 0.75 }] },
      ],
    });
    expect(packet.candidates.reduce((sum, candidate) => sum + candidate.estimated_context_tokens, 0)).toBeLessThan(12000);

    const gate = evaluateTaskPromotion({
      recommendation_id: 'rec:cluster-routing', retrieval_confidence: 0.92, evidence_completeness: 0.92,
      duplicate_task_probability: 0.5, actionable: true, affected_paths_known: true,
      acceptance_criteria_present: true, permissions_resolved: true, permission_mode: 'proposal_only',
    });
    expect(gate).toMatchObject({ gate_decision: 'REVIEW_REQUIRED', failure_reasons: ['DUPLICATE_TASK_RISK'] });
  });
});
