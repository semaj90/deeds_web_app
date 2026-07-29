export const SPARSE_CONTRACT = Object.freeze({
  schemaVersion: 1,
  dense: Object.freeze({
    name: 'content',
    dimension: 768,
    representationName: 'semantic_768',
  }),
  sparse: Object.freeze({
    name: 'lexical_v1',
    encoderKind: 'code_aware_bm25',
    vocabularyRevision: null,
    weightingRevision: null,
    maxTerms: 256,
  }),
  authority: Object.freeze({
    table: 'codebase_chunk_index',
    idColumn: 'id',
    sourceRefColumn: 'relative_path',
    contentHashColumn: 'content_hash',
  }),
  allowedCollections: Object.freeze([
    'codebase_chunks_768_v2',
    'codebase_chunks_hybrid_',
    'codebase_chunks_sparse_test_',
  ]),
  forbiddenCollections: Object.freeze(new Set(['codebase_chunks_768'])),
});

export function buildSparseProofEnvelope(input) {
  return {
    schema_version: SPARSE_CONTRACT.schemaVersion,
    run_id: input.runId,
    artifact_id: input.artifactId,
    artifact_state: input.artifactState ?? 'ACTIVE_VERIFIED',
    collection: input.collection,
    corpus_revision: input.corpusRevision,
    representation_revision: input.representationRevision,
    source_count: input.sourceCount,
    success_count: input.successCount,
    failure_count: input.failureCount,
    started_at: input.startedAt,
    completed_at: input.completedAt,
    checks: input.checks,
    notes: input.notes ?? [],
  };
}
