import { describe, expect, it } from 'vitest';
import { FeatureMatrixRowV1Schema, FeatureMatrixRowV2Schema, TopologySchema } from './feature-matrix-schema.js';
import {
  EnrichedTreeNodeSchema,
  materializeLinkedTupleDraftsFromEnrichedTreeNode,
} from './enriched-tree-node-contract.js';

describe('enriched tree node contract', () => {
  const now = new Date().toISOString();

  it('materializes linked tuple drafts from a strict enriched tree node', () => {
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
        source_hash: 'a'.repeat(64),
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
      pos: [
        { tag: 'NOUN', token: 'session', start_byte: 10, end_byte: 17, source: 'parser' },
      ],
      domains: [
        {
          domain_id: 'auth',
          label: 'auth',
          probability: 0.82,
          classifier: 'xgboost',
          classifier_version: '2026-07-29',
        },
        {
          domain_id: 'identity',
          label: 'identity',
          probability: 0.12,
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
        source_hash: 'a'.repeat(64),
        embedding_revision: 'embedding:768:v1',
        graph_revision: 'graph:2026-07-29',
        ontology_revision: 'ontology:2026-07-29',
        classifier_revision: 'classifier:2026-07-29',
      },
    });

    const drafts = materializeLinkedTupleDraftsFromEnrichedTreeNode({
      node,
      packetKey: 'packet:1',
      sourceRef: 'src/lib/server/auth.ts',
      documentId: 'doc:1',
      sourceTables: ['atlas_packets', 'atlas_linked_tuples'],
      labelerVersion: 'feature-row-bridge',
      taggerVersion: 'parser-v1',
      ontologyVersion: 'ontology:2026-07-29',
      nlpVersion: 'langextract:2026-07-29',
    });

    expect(drafts).toHaveLength(4);
    expect(drafts[0]).toMatchObject({
      packetKey: 'packet:1',
      sourceRef: 'src/lib/server/auth.ts',
      treeNodeId: 'node:src/lib/server/auth.ts:validateSession',
      surfaceText: 'Session validation',
      label: 'auth',
      labelKind: 'ontology',
    });
    expect(drafts.some((draft) => draft.labelKind === 'pos' && draft.partOfSpeech === 'NOUN')).toBe(true);
  });

  it('keeps V1 rows tolerant while V2 requires tree_node_id', () => {
    const v1 = FeatureMatrixRowV1Schema.parse({
      schema_version: '1.0',
      created_at: now,
      updated_at: now,
      workspace_revision: 'main',
      identity: {
        packet_key: 'packet:1',
        source_ref: 'src/lib/server/auth.ts',
        file_path: 'src/lib/server/auth.ts',
        function_symbol: 'validateSession',
        feature_id: 'feature:auth:sessions',
        title_id: 'title:auth',
        tree_node_id: null,
      },
      is_valid: true,
      validation_errors: [],
      feature_labels: ['Session validation'],
      domain_class: 'auth',
      secondary_domains: ['identity'],
      ontology_ids: ['ontology:auth.sessions'],
      concept_ids: ['concept:session-validation'],
      runtime_evidence_refs: [],
      test_evidence_refs: [],
    });

    expect(v1.identity.tree_node_id).toBeNull();
    expect(() =>
      FeatureMatrixRowV2Schema.parse({
        ...v1,
        schema_version: '2.0',
        identity: {
          ...v1.identity,
          tree_node_id: null,
        },
      })
    ).toThrow();
  });

  it('accepts pagerank lineage fields on topology payloads', () => {
    const topology = TopologySchema.parse({
      graph_revision: 'graph:2026-07-29',
      pagerank_version: 'pagerank:v2',
      pagerank_raw: 42.5,
      pagerank_score: 0.81,
      som_cell_row: 3,
      som_cell_col: 7,
      som_index: 67,
      som_distance_to_centroid: 0.12,
      hilbert_order: '0.103',
      neighbors_k_hop: ['packet:1'],
      computed_at: now,
    });

    expect(topology.graph_revision).toBe('graph:2026-07-29');
    expect(topology.pagerank_version).toBe('pagerank:v2');
    expect(topology.pagerank_raw).toBe(42.5);
  });
});
