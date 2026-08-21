import { describe, expect, it } from 'vitest';

import {
  EMBEDDINGGEMMA_CLASSIFICATION_PROMPT_REVISION,
  QueryClassificationV2Schema,
  formatEmbeddingGemmaClassificationInput,
} from './query-classification-v2.js';
import {
  QUERY_FEATURE_ORDER_V1,
  flattenQueryFeaturesV1,
  projectQueryFeaturesV1,
} from './query-feature-projection-v1.js';
import {
  compileRetrievalPlanV1,
  type RetrievalExecutorCapabilityV1,
} from './retrieval-executor-policy-v1.js';

function classification(overrides: Record<string, unknown> = {}) {
  const domains = {
    code: 0.05,
    database: 0.05,
    retrieval: 0.7,
    graph: 0.05,
    api: 0.05,
    security: 0.01,
    documentation: 0.02,
    workflow: 0.02,
    testing: 0.03,
    unknown: 0.02,
  };
  const operations = {
    find: 0.05,
    explain: 0.05,
    debug: 0.7,
    modify: 0.05,
    compare: 0.03,
    trace: 0.05,
    test: 0.04,
    synthesize: 0.03,
  };
  return QueryClassificationV2Schema.parse({
    schema: 'atlas.query-classification.v2',
    queryDigest: 'a'.repeat(64),
    featureContractRevision: 'atlas.query-router-tensor.v1',
    modelRevision: 'fixture-v1',
    embeddingModelId: 'google/embeddinggemma-300m',
    embeddingRepresentationId: 'classification_mrl_128',
    embeddingSourceRepresentationId: 'classification_768',
    embeddingDimension: 128,
    embeddingPromptRevision: EMBEDDINGGEMMA_CLASSIFICATION_PROMPT_REVISION,
    domain: 'retrieval',
    domainProbabilities: domains,
    operation: 'debug',
    operationProbabilities: operations,
    retrievalNeeds: {
      lexicalExact: 0.9,
      sparseContextual: 0.8,
      sparseExpansion: 0.2,
      semantic: 0.9,
      ast: 0.8,
      graph: 0.6,
      exactSymbol: 0.9,
      mutationFreshness: 0.8,
    },
    budget: { candidateBudget: 1024, graphHops: 2, rerankBudget: 50 },
    confidence: 0.8,
    evidenceAuthority: false,
    ...overrides,
  });
}

const extraCapabilities: RetrievalExecutorCapabilityV1[] = [
  { id: 'postgres_fts', available: true, logicalLane: 'lexical', exact: true, approximate: false, gpu: false, persistentIndex: true, onDiskCapable: true, evidenceAuthority: false, notes: 'fixture' },
  { id: 'qdrant_bm25', available: true, logicalLane: 'sparse', exact: true, approximate: false, gpu: false, persistentIndex: true, onDiskCapable: true, evidenceAuthority: false, notes: 'fixture' },
  { id: 'qdrant_minicoil', available: true, logicalLane: 'sparse', exact: true, approximate: false, gpu: false, persistentIndex: true, onDiskCapable: true, evidenceAuthority: false, notes: 'fixture' },
  { id: 'qdrant_splade', available: true, logicalLane: 'sparse', exact: true, approximate: false, gpu: false, persistentIndex: true, onDiskCapable: true, evidenceAuthority: false, notes: 'fixture' },
  { id: 'qdrant_hnsw_768', available: true, logicalLane: 'semantic', exact: false, approximate: true, gpu: false, persistentIndex: true, onDiskCapable: true, evidenceAuthority: false, notes: 'fixture' },
  { id: 'pgvector_exact_768', available: true, logicalLane: 'semantic', exact: true, approximate: false, gpu: false, persistentIndex: true, onDiskCapable: true, evidenceAuthority: false, notes: 'fixture' },
  { id: 'cuvs_bruteforce_768', available: true, logicalLane: 'semantic', exact: true, approximate: false, gpu: true, persistentIndex: false, onDiskCapable: false, evidenceAuthority: false, notes: 'fixture' },
  { id: 'cuvs_cagra_768', available: true, logicalLane: 'semantic', exact: false, approximate: true, gpu: true, persistentIndex: false, onDiskCapable: false, evidenceAuthority: false, notes: 'fixture' },
  { id: 'cuvs_vamana_768', available: true, logicalLane: 'semantic', exact: false, approximate: true, gpu: true, persistentIndex: false, onDiskCapable: false, evidenceAuthority: false, notes: 'fixture' },
  { id: 'diskann_vamana_768', available: true, logicalLane: 'semantic', exact: false, approximate: true, gpu: false, persistentIndex: true, onDiskCapable: true, evidenceAuthority: false, notes: 'fixture' },
  { id: 'ast_structural', available: true, logicalLane: 'ast', exact: true, approximate: false, gpu: false, persistentIndex: false, onDiskCapable: false, evidenceAuthority: false, notes: 'fixture' },
  { id: 'graph_bounded', available: true, logicalLane: 'graph', exact: false, approximate: false, gpu: false, persistentIndex: true, onDiskCapable: true, evidenceAuthority: false, notes: 'fixture' },
  { id: 'cross_encoder_reranker', available: true, logicalLane: 'rerank', exact: false, approximate: false, gpu: false, persistentIndex: false, onDiskCapable: false, evidenceAuthority: false, notes: 'fixture' },
];

describe('query routing v2', () => {
  it('formats the official EmbeddingGemma classification task prefix', () => {
    expect(formatEmbeddingGemmaClassificationInput('find qdrant writer')).toBe(
      'task: classification | query: find qdrant writer',
    );
  });

  it('extracts deterministic code/debug/retrieval signals', () => {
    const row = projectQueryFeaturesV1('fix GraphifyStructuralMaterializer() Qdrant upsert error in src/lib/a.ts');
    expect(row.identifierCount).toBeGreaterThan(0);
    expect(row.retrievalTermDensity).toBeGreaterThan(0);
    expect(row.debugTermDensity).toBeGreaterThan(0);
    expect(row.mutationVerbDensity).toBeGreaterThan(0);
    expect(row.hasFunctionCallShape).toBe(1);
    expect(row.extensionCount).toBeGreaterThan(0);
  });

  it('freezes a 26-value deterministic query feature order', () => {
    const row = projectQueryFeaturesV1('compare HNSW versus DiskANN for semantic retrieval');
    expect(QUERY_FEATURE_ORDER_V1).toHaveLength(26);
    expect(flattenQueryFeaturesV1(row)).toHaveLength(26);
  });

  it('selects miniCOIL for contextual exact-overlap needs and only one sparse executor', () => {
    const plan = compileRetrievalPlanV1(
      classification(),
      { gpuAvailable: true, freeVramBytes: 2_000_000_000, allowGpuAnn: true, allowDiskAnn: true, allowReranker: true, maxCandidates: 512, maxGraphHops: 2 },
      extraCapabilities,
    );
    expect(plan.sparseExecutors).toEqual(['qdrant_minicoil']);
    expect(plan.oneVotePerLogicalLane).toBe(true);
    expect(plan.semanticExecutors).toContain('qdrant_hnsw_768');
    expect(plan.semanticExecutors).toContain('cuvs_cagra_768');
    expect(plan.semanticExecutors).toContain('cuvs_bruteforce_768');
    expect(plan.semanticExecutors).not.toContain('diskann_vamana_768');
    expect(plan.candidateBudget).toBe(512);
  });

  it('can select DiskANN/Vamana for large disk-oriented candidate budgets', () => {
    const plan = compileRetrievalPlanV1(
      classification({ budget: { candidateBudget: 2048, graphHops: 1, rerankBudget: 20 } }),
      { gpuAvailable: false, freeVramBytes: 0, allowGpuAnn: false, allowDiskAnn: true, allowReranker: false, maxCandidates: 2048, maxGraphHops: 1 },
      extraCapabilities,
    );
    expect(plan.semanticExecutors).toContain('diskann_vamana_768');
    expect(plan.semanticExecutors).toContain('pgvector_exact_768');
    expect(plan.rerankExecutors).toEqual([]);
  });

  it('selects SPLADE only when lexical expansion is the requested sparse behavior', () => {
    const c = classification({
      retrievalNeeds: {
        lexicalExact: 0.2,
        sparseContextual: 0.2,
        sparseExpansion: 0.9,
        semantic: 0.8,
        ast: 0.2,
        graph: 0.2,
        exactSymbol: 0.1,
        mutationFreshness: 0.2,
      },
    });
    const plan = compileRetrievalPlanV1(
      c,
      { gpuAvailable: false, freeVramBytes: 0, allowGpuAnn: false, allowDiskAnn: false, allowReranker: false, maxCandidates: 128, maxGraphHops: 0 },
      extraCapabilities,
    );
    expect(plan.sparseExecutors).toEqual(['qdrant_splade']);
  });
});
