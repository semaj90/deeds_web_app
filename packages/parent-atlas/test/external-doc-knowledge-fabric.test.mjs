import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildExternalDocFabricManifest,
  externalDocChunkSchema,
  externalDocDerivedFeaturesSchema,
  externalDocsInferenceAlignmentSchema,
  externalDocsRetrievalPlanSchema,
  ontologyTupleSchema,
  qdrantExternalDocsProjectionPlanSchema,
} from '../dist/core/external-doc-knowledge-fabric.js';

const sha = 'a'.repeat(64);

test('builds a revisioned OKF external-doc manifest with 20x20 SOM and 768d semantic owner', () => {
  const manifest = buildExternalDocFabricManifest({
    manifest_revision: 'okf-r1',
    workspace_revision: 'workspace-r1',
    source_snapshot_revision: 'source-r1',
    sources: [{
      source_id: 'qdrant',
      source_revision: 'qdrant-docs-r1',
      title: 'Qdrant Documentation',
      base_urls: ['https://qdrant.tech/documentation/'],
      allowed_domains: ['qdrant.tech'],
      authority_class: 'OFFICIAL_PRIMARY',
      default_fetcher: 'FIRECRAWL_V2',
      output_namespace: 'docs/.okf/qdrant',
      include_paths: ['/documentation/'],
      exclude_paths: [],
      maximum_pages: 500,
      maximum_depth: 4,
      canonical_authority: false,
    }],
    qdrant_projection: {
      projection_revision: 'qdrant-proj-r1',
      collection: 'external_programming_docs_768',
      vector_dimension: 768,
      distance: 'Cosine',
      retain_original_vectors: true,
      quantization: 'SCALAR_INT8',
      quantized_search_rescore: true,
      oversampling: 2,
      strict_filtering_required: true,
      canonical_authority: false,
    },
    som_grid: { rows: 20, columns: 20 },
    default_kmeans_clusters: 64,
    default_low_rank: 64,
    producer_revision: 'parent-atlas-test-r1',
  });

  assert.equal(manifest.qdrant_projection.vector_dimension, 768);
  assert.deepEqual(manifest.som_grid, { rows: 20, columns: 20 });
  assert.equal(manifest.manifest_checksum.length, 64);
  assert.ok(manifest.sources.every((source) => source.canonical_authority === false));
});

test('N-ary ontology tuple degree must equal its participant count', () => {
  assert.throws(() => ontologyTupleSchema.parse({
    tuple_id: 'tuple:1',
    predicate: 'connects',
    predicate_lemma: 'connect',
    participants: [
      { role: 'source', text: 'A', normalized_text: 'a', ontology_class: 'CONCEPT', start_char: 0, end_char: 1 },
      { role: 'target', text: 'B', normalized_text: 'b', ontology_class: 'CONCEPT', start_char: 11, end_char: 12 },
    ],
    degree: 3,
    extraction_method: 'STANZA_DEPENDENCY',
    evidence_span_refs: ['span:1'],
    confidence: 1,
    canonical_authority: false,
  }), /degree/);
});

test('SOM coordinates are derived and must be a complete 20x20 coordinate pair', () => {
  assert.throws(() => externalDocDerivedFeaturesSchema.parse({
    chunk_id: 'chunk:1',
    feature_revision: 'feature-r1',
    semantic_snapshot_revision: 'semantic-r1',
    semantic_dimension: 768,
    embedding_checksum: sha,
    som_row: 3,
    som_column: null,
    canonical_authority: false,
  }), /SOM row\/column/);

  const parsed = externalDocDerivedFeaturesSchema.parse({
    chunk_id: 'chunk:1',
    feature_revision: 'feature-r1',
    semantic_snapshot_revision: 'semantic-r1',
    semantic_dimension: 768,
    embedding_checksum: sha,
    low_rank_revision: 'svd-r1',
    low_rank_rank: 64,
    low_rank_row_l2_sq: 4.5,
    tang_sampling_weight: 0.2,
    pagerank: 0.01,
    kmeans_cluster: 17,
    kmeans_probability: 0.8,
    som_row: 19,
    som_column: 19,
    canonical_authority: false,
  });
  assert.equal(parsed.canonical_authority, false);
});

test('retrieval keeps one semantic lane and requires exact refinement/source promotion', () => {
  assert.throws(() => externalDocsRetrievalPlanSchema.parse({
    plan_revision: 'plan-r1',
    query_id: 'query:1',
    query_revision: 'query-r1',
    maximum_candidates: 256,
    semantic_prefetch_k: 128,
    exact_refine_k: 192,
  }), /exact_refine_k/);

  const plan = externalDocsRetrievalPlanSchema.parse({
    plan_revision: 'plan-r1',
    query_id: 'query:1',
    query_revision: 'query-r1',
    maximum_candidates: 1024,
    semantic_prefetch_k: 256,
    exact_refine_k: 32,
    maximum_relation_hops: 2,
  });
  assert.equal(plan.semantic_lane_votes, 1);
  assert.equal(plan.exact_semantic_refinement_required, true);
  assert.equal(plan.exact_source_promotion_required, true);
});

test('Qdrant projection retains originals for quantized rescore', () => {
  const projection = qdrantExternalDocsProjectionPlanSchema.parse({
    projection_revision: 'projection-r1',
    collection: 'external_programming_docs_768',
    vector_dimension: 768,
    distance: 'Cosine',
    retain_original_vectors: true,
    quantization: 'TURBOQUANT',
    quantized_search_rescore: true,
    oversampling: 3,
    strict_filtering_required: true,
    canonical_authority: false,
  });
  assert.equal(projection.retain_original_vectors, true);
  assert.equal(projection.quantized_search_rescore, true);
});

test('QLoRA alignment cannot admit scraped docs without verified-claim receipts', () => {
  assert.throws(() => externalDocsInferenceAlignmentSchema.parse({
    alignment_revision: 'align-r1',
    inference_runtime_id: 'llama-server:8090',
    inference_runtime_revision: 'runtime-r1',
    model_id: 'ornith',
    model_revision: 'ornith-r1',
    adapter_id: null,
    adapter_revision: null,
    embedding_model_revision: 'embeddinggemma-r1',
    retrieval_plan_revision: 'retrieval-r1',
    context_manifest_checksum: sha,
    evidence_snapshot_revision: 'evidence-r1',
    qlora_training_examples_allowed: true,
    required_claim_verification_receipt_ids: [],
    canonical_authority: false,
  }), /verified-claim/);
});

test('chunk contract preserves source revision and derived ontology without canonical authority', () => {
  const chunk = externalDocChunkSchema.parse({
    chunk_id: 'chunk:1',
    source_id: 'qdrant',
    source_revision: 'qdrant-r1',
    fetch_id: 'fetch:1',
    source_url: 'https://qdrant.tech/documentation/',
    document_checksum: sha,
    chunk_checksum: sha,
    ordinal: 0,
    heading_path: ['Hybrid Search'],
    start_char: 0,
    end_char: 20,
    text: 'Qdrant supports search.',
    language: 'en',
    domain_class: 'retrieval',
    ontology_classes: ['RETRIEVAL'],
    canonical_authority: false,
  });
  assert.equal(chunk.source_revision, 'qdrant-r1');
  assert.equal(chunk.canonical_authority, false);
});
