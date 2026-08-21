#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildCandidateFeatureMatrix } from '../../src/lib/server/retrieval/retrieval-candidate-feature-matrix-v1.js';
import {
  buildTorchFeatureTensorV1,
  encodeFloat32LittleEndianV1,
} from '../../src/lib/server/atlas/tensors/torch-feature-tensor-v1.js';

function sha256(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function digestStrings(values: readonly string[]): string {
  const hash = createHash('sha256');
  for (const value of values) hash.update(`${Buffer.byteLength(value, 'utf8')}:`, 'utf8').update(value, 'utf8');
  return hash.digest('hex');
}

const outPath = path.resolve(
  process.argv.find((arg) => arg.startsWith('--output='))?.slice('--output='.length) ??
    'docs/reports/torch-feature-tensor-fixture-v1.json',
);

const matrix = buildCandidateFeatureMatrix([
  {
    packet_key: 'packet:torch-fixture:alpha',
    semantic_similarity_768: 0.91,
    lexical_score: 0.73,
    exact_symbol_match: 1,
    ast_signal: 0.8,
    authority_norm: 0.6,
    community_fit: 0.4,
    domain_fit_query: 0.9,
    concept_fit: 0.7,
    nary_relation_fit: 0.2,
    kmeans_centroid_similarity: 0.55,
    kmeans_cluster_rank: 1,
    som_distance: 0.15,
    som_neighbor_radius: 1,
    hilbert_locality: 0.5,
    summary_quality: 0.82,
    summary_provenance: 1,
    recency: 0.95,
    retrieval_frequency: 0.35,
    execution_utility: 0.88,
    graph_distance: 0.25,
    process_fit: 0.72,
    dependency_fanout: 0.45,
    feature_label_confidence: 0.93,
    source_revision_match: 1,
    representation_revision_match: 1,
  },
  {
    packet_key: 'packet:torch-fixture:beta',
    semantic_similarity_768: 0.77,
    lexical_score: 0.81,
    exact_symbol_match: 0,
    ast_signal: 0.65,
    authority_norm: 0.7,
    community_fit: 0.75,
    domain_fit_query: 0.68,
    concept_fit: 0.59,
    nary_relation_fit: 0.4,
    kmeans_centroid_similarity: 0.62,
    kmeans_cluster_rank: 3,
    som_distance: 0.28,
    som_neighbor_radius: 2,
    hilbert_locality: 0.61,
    summary_quality: 0.74,
    summary_provenance: 0.9,
    recency: 0.8,
    retrieval_frequency: 0.6,
    // execution_utility intentionally missing to prove mask semantics
    graph_distance: 0.5,
    process_fit: 0.66,
    dependency_fanout: 0.3,
    feature_label_confidence: 0.85,
    source_revision_match: 1,
    representation_revision_match: 1,
  },
  {
    packet_key: 'packet:torch-fixture:gamma',
    semantic_similarity_768: 0.52,
    lexical_score: 0.2,
    exact_symbol_match: 0,
    ast_signal: 0.3,
    authority_norm: 0.5,
    community_fit: 0.2,
    domain_fit_query: 0.42,
    concept_fit: 0.33,
    nary_relation_fit: 0.11,
    kmeans_centroid_similarity: 0.41,
    kmeans_cluster_rank: 7,
    som_distance: 0.63,
    som_neighbor_radius: 2,
    hilbert_locality: 0.31,
    summary_quality: 0.58,
    summary_provenance: 0.8,
    recency: 0.4,
    retrieval_frequency: 0.2,
    execution_utility: 0.36,
    graph_distance: 0.8,
    process_fit: 0.25,
    dependency_fanout: 0.15,
    feature_label_confidence: 0.62,
    source_revision_match: 0,
    representation_revision_match: 1,
  },
]);

const { artifact, features, presenceMask } = buildTorchFeatureTensorV1({
  matrix,
  queryId: 'query:torch03:fixture-v1',
  workspaceRevision: 'workspace:torch03:fixture-v1',
  representationRevision: 'representation:torch03:fixture-v1',
  featureRevision: 'feature:torch03:fixture-v1',
});

const featureBytes = encodeFloat32LittleEndianV1(features);
const fixture = {
  ...artifact,
  fixtureSchema: 'atlas.torch-feature-tensor-fixture.v1',
  featureBytesBase64: Buffer.from(featureBytes).toString('base64'),
  presenceMaskBytesBase64: Buffer.from(presenceMask).toString('base64'),
  fixtureSha256: '',
};

if (artifact.featureBytesSha256 !== sha256(featureBytes)) throw new Error('FEATURE_BYTES_DIGEST_INTERNAL_MISMATCH');
if (artifact.presenceMaskBytesSha256 !== sha256(presenceMask)) throw new Error('MASK_BYTES_DIGEST_INTERNAL_MISMATCH');
if (artifact.rowKeysSha256 !== digestStrings(artifact.rowKeys)) throw new Error('ROW_KEY_DIGEST_INTERNAL_MISMATCH');

const preimage = JSON.stringify({ ...fixture, fixtureSha256: undefined });
fixture.fixtureSha256 = sha256(preimage);
await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: 'TORCH_FEATURE_TENSOR_FIXTURE_WRITTEN',
  output: outPath,
  rows: artifact.rowCount,
  columns: artifact.columnCount,
  featureBytesSha256: artifact.featureBytesSha256,
  presenceMaskBytesSha256: artifact.presenceMaskBytesSha256,
  rowKeysSha256: artifact.rowKeysSha256,
  fixtureSha256: fixture.fixtureSha256,
  canonicalOwnerChanged: false,
  evidenceAuthority: false,
}, null, 2));
