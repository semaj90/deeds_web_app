import { describe, expect, it } from 'vitest';
import { compileQueryRouterDatasetV1, compileQueryRouterTrainingRowV1, projectClassification768ToMrl128 } from './query-router-dataset-v1.js';
import { EMBEDDINGGEMMA_CLASSIFICATION_PROMPT_REVISION } from './query-classification-v2.js';

function vector768(seed = 1): number[] { return Array.from({ length: 768 }, (_, index) => Math.sin((index + 1) * seed) + 0.001 * (index % 11)); }
function row(overrides: Record<string, unknown> = {}) {
  return {
    schema: 'atlas.query-router-evaluation-record.v1', queryId: 'query-1', query: 'find GraphifyStructuralMaterializer source revision logic',
    queryRevision: 'query-corpus-v1', labelRevision: 'labels-v1', embeddingModelId: 'google/embeddinggemma-300m', embeddingModelRevision: 'embeddinggemma-rev-a',
    embeddingPromptRevision: EMBEDDINGGEMMA_CLASSIFICATION_PROMPT_REVISION, embeddingSourceRepresentationId: 'classification_768', embedding768: vector768(),
    domainLabel: 'code', operationLabel: 'find', retrievalNeeds: { lexicalExact: 0.8, sparseContextual: 0.7, sparseExpansion: 0.2, semantic: 0.9, ast: 1, graph: 0.5, exactSymbol: 1, mutationFreshness: 0.8 },
    budgetTargets: { candidateBudget: 1024, graphHops: 2, rerankBudget: 64 }, evidenceRefs: ['eval:fixture:1'], ...overrides,
  };
}
function norm(values: readonly number[]): number { return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)); }

describe('QueryRouterDatasetV1', () => {
  it('projects classification_768 to normalized MRL 128', () => {
    const projected = projectClassification768ToMrl128(vector768());
    expect(projected).toHaveLength(128);
    expect(Math.abs(norm(projected) - 1)).toBeLessThan(1e-6);
  });
  it('compiles the frozen 154-input trainer row with lineage', () => {
    const compiled = compileQueryRouterTrainingRowV1(row());
    expect(compiled.embedding_mrl_128).toHaveLength(128);
    expect(compiled.query_features).toHaveLength(26);
    expect(compiled.retrieval_needs).toHaveLength(8);
    expect(compiled.budget_targets).toHaveLength(3);
    expect(compiled.embedding_representation_id).toBe('classification_mrl_128');
    expect(compiled.embedding_source_representation_id).toBe('classification_768');
    expect(compiled.tensor_revision).toBe('atlas.query-router-tensor.v1');
  });
  it('produces a deterministic JSONL checksum for one frozen corpus', () => {
    const records = [row(), row({ queryId: 'query-2', query: 'debug postgres bitmap scan failure', embedding768: vector768(2) })];
    const a = compileQueryRouterDatasetV1(records); const b = compileQueryRouterDatasetV1(records);
    expect(a.receipt.datasetSha256).toBe(b.receipt.datasetSha256);
    expect(a.receipt.sourceRecordsSha256).toBe(b.receipt.sourceRecordsSha256);
    expect(a.receipt.rowCount).toBe(2); expect(a.receipt.inputDimension).toBe(154); expect(a.receipt.canonicalWritesAllowed).toBe(false);
  });
  it('rejects mixed embedding model revisions', () => {
    expect(() => compileQueryRouterDatasetV1([row(), row({ queryId: 'query-2', embeddingModelRevision: 'embeddinggemma-rev-b' })])).toThrow(/QUERY_ROUTER_MIXED_EMBEDDING_MODEL_REVISION/);
  });
  it('rejects mixed prompt revisions through the source schema', () => {
    expect(() => compileQueryRouterDatasetV1([row(), row({ queryId: 'query-2', embeddingPromptRevision: 'wrong-prompt-revision' })])).toThrow();
  });
  it('rejects mixed label revisions', () => {
    expect(() => compileQueryRouterDatasetV1([row(), row({ queryId: 'query-2', labelRevision: 'labels-v2' })])).toThrow(/QUERY_ROUTER_MIXED_LABEL_REVISION/);
  });
});
