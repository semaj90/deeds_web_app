import { describe, expect, it } from 'vitest';
import { EnrichedTreeNodeSchema } from './enriched-tree-node-contract.js';
import {
  toNeo4jProjectionFromEnrichedTreeNode,
} from './enriched-tree-node-projections.js';
import {
  toQdrantPayloadFromStrictTreeNode,
} from './projections/qdrant-packet-projection.js';
import {
  toHyperRagRequestFromStrictTreeNode,
} from './projections/hyperrag-packet-projection.js';

describe('enriched tree node projections', () => {
  const now = new Date().toISOString();

  const node = EnrichedTreeNodeSchema.parse({
    identity: {
      tree_node_id: 'node:src/lib/server/auth.ts:validateSession',
      directory_path: 'src/lib/server',
      source_ref: 'src/lib/server/auth.ts',
      file_path: 'src/lib/server/auth.ts',
      function_symbol: 'validateSession',
      node_type: 'function',
      domain_class: 'auth',
      community_id: 'community:auth',
      kmeans_cluster_id: 7,
      feature_id: 'feature:auth:sessions',
      feature_label: 'Session validation',
      source_hash: 'b'.repeat(64),
      created_at: now,
      updated_at: now,
      corpus_snapshot_id: 'snapshot:2026-07-29',
    },
    ast: {
      language: 'typescript',
      node_kind: 'function_declaration',
      parent_tree_node_id: null,
      symbol_path: ['auth', 'validateSession'],
      start_byte: 10,
      end_byte: 120,
    },
    pos: [],
    domains: [
      {
        domain_id: 'auth',
        label: 'auth',
        probability: 0.82,
        classifier: 'xgboost',
        classifier_version: '2026-07-29',
      },
    ],
    ontology_links: [
      {
        ontology_id: 'ontology:auth.sessions',
        concept_id: 'concept:session-validation',
        relation: 'VALIDATES',
        confidence: 0.93,
        evidence_ref: 'evidence:1',
      },
    ],
    revisions: {
      workspace_revision: 'workspace:main',
      source_hash: 'b'.repeat(64),
      embedding_revision: 'embedding:768:v1',
      graph_revision: 'graph:2026-07-29',
      ontology_revision: 'ontology:2026-07-29',
      classifier_revision: 'classifier:2026-07-29',
    },
  });

  const seed = {
    node,
    packetKey: 'packet:1',
    sourceRef: 'src/lib/server/auth.ts',
    workspaceId: 'workspace:main',
    workspaceRevision: 'workspace:main',
    collectionName: 'codebase_chunks_768',
    titleId: 'title:auth',
    chunkId: 'chunk:1',
    repositoryId: 'deeds-web-app',
    filePath: 'src/lib/server/auth.ts',
    contentHash: 'b'.repeat(64),
    ontologyId: 'ontology:auth.sessions',
    ontologyVersion: 'ontology:2026-07-29',
    somClusterId: 7,
  };

  it('projects a strict tree node into qdrant and hyperrag request shapes', () => {
    const qdrant = toQdrantPayloadFromStrictTreeNode(seed);
    const hyperrag = toHyperRagRequestFromStrictTreeNode(seed);

    expect(qdrant.packet_key).toBe('packet:1');
    expect(qdrant.feature_id).toBe('feature:auth:sessions');
    expect(qdrant.tree_node_id).toBe('node:src/lib/server/auth.ts:validateSession');
    expect(qdrant.collection_name).toBe('codebase_chunks_768');

    expect(hyperrag.packet_key).toBe('packet:1');
    expect(hyperrag.feature_id).toBe('feature:auth:sessions');
    expect(hyperrag.tree_node_id).toBe('node:src/lib/server/auth.ts:validateSession');
  });

  it('projects a strict tree node into a neo4j projection', () => {
    const neo4j = toNeo4jProjectionFromEnrichedTreeNode(seed);

    expect(neo4j.nodeKey).toBe('node:src/lib/server/auth.ts:validateSession');
    expect(neo4j.labels).toContain('TreeNode');
    expect(neo4j.properties.feature_id).toBe('feature:auth:sessions');
    expect(neo4j.relationships).toHaveLength(1);
  });
});
