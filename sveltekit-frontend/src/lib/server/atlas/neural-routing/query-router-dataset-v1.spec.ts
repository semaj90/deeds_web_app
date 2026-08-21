import { describe, expect, it } from 'vitest';
import {
  QueryRouterDatasetRowV1Schema,
  QueryRouterSeedV1Schema,
  flattenQueryRouterRetrievalNeedsV1,
  normalizeQueryRouterBudgetTargetsV1,
} from './query-router-dataset-v1.js';

describe('QueryRouterDatasetV1', () => {
  it('accepts a revision-qualified reviewed seed', () => {
    const seed = QueryRouterSeedV1Schema.parse({
      schema: 'atlas.query-router-seed.v1',
      queryId: 'q-1',
      query: 'find Qdrant sparse upsert writers',
      queryRevision: 'query-r1',
      labelRevision: 'labels-r1',
      domainLabel: 'retrieval',
      operationLabel: 'find',
      retrievalNeeds: {
        lexicalExact: 0.9,
        sparseContextual: 0.8,
        sparseExpansion: 0.2,
        semantic: 0.7,
        ast: 0.9,
        graph: 0.4,
        exactSymbol: 0.8,
        mutationFreshness: 0.6,
      },
      budget: { candidateBudget: 512, graphHops: 2, rerankBudget: 50 },
      evidenceRefs: ['fixture:q-1'],
    });
    expect(seed.labelRevision).toBe('labels-r1');
  });

  it('freezes retrieval-need feature ordering', () => {
    expect(flattenQueryRouterRetrievalNeedsV1({
      lexicalExact: 0.1,
      sparseContextual: 0.2,
      sparseExpansion: 0.3,
      semantic: 0.4,
      ast: 0.5,
      graph: 0.6,
      exactSymbol: 0.7,
      mutationFreshness: 0.8,
    })).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]);
  });

  it('normalizes bounded budgets deterministically', () => {
    expect(normalizeQueryRouterBudgetTargetsV1({ candidateBudget: 8, graphHops: 0, rerankBudget: 0 })).toEqual([0, 0, 0]);
    expect(normalizeQueryRouterBudgetTargetsV1({ candidateBudget: 4096, graphHops: 6, rerankBudget: 256 })).toEqual([1, 1, 1]);
  });

  it('rejects an unrevisioned seed', () => {
    expect(() => QueryRouterSeedV1Schema.parse({
      schema: 'atlas.query-router-seed.v1',
      queryId: 'q-2',
      query: 'debug graph traversal',
      queryRevision: '',
      labelRevision: '',
      domainLabel: 'graph',
      operationLabel: 'debug',
      retrievalNeeds: {
        lexicalExact: 0.5,
        sparseContextual: 0.2,
        sparseExpansion: 0.1,
        semantic: 0.8,
        ast: 0.6,
        graph: 0.9,
        exactSymbol: 0.4,
        mutationFreshness: 0.8,
      },
      budget: { candidateBudget: 256, graphHops: 2, rerankBudget: 32 },
    })).toThrow();
  });

  it('rejects wrong embedding width in an exported row', () => {
    expect(() => QueryRouterDatasetRowV1Schema.parse({
      schema: 'atlas.query-router-dataset-row.v1',
      query_id: 'q-3',
      query_digest: 'a'.repeat(64),
      query_revision: 'q-r1',
      label_revision: 'l-r1',
      embedding_model_id: 'google/embeddinggemma-300m',
      embedding_model_revision: 'model-r1',
      embedding_prompt_revision: 'prompt-r1',
      embedding_source_representation_id: 'classification_768',
      embedding_representation_id: 'classification_mrl_128',
      embedding_projection_revision: 'mrl-r1',
      embedding_mrl_128: Array(127).fill(0),
      query_feature_contract_revision: 'atlas.query-feature-projection.v1',
      query_features: Array(26).fill(0),
      domain_label: 'code',
      operation_label: 'find',
      retrieval_needs: Array(8).fill(0),
      budget_targets: Array(3).fill(0),
      evidence_refs: [],
      source_seed_digest: 'b'.repeat(64),
      dataset_contract_revision: 'atlas.query-router-dataset.v1',
      evidenceAuthority: false,
    })).toThrow();
  });
});
