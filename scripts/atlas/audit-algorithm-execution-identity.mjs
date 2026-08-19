#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const modelManifestPath = path.join(root, 'models', 'model-manifest.json');
const featureIndexPath = path.join(root, '.okf', 'indexes', 'feature-intelligence.yaml');
const outputPath = path.join(root, 'reports', 'algorithm-execution-identity-audit.json');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function inferYamlSemanticDimension(text) {
  const patterns = [
    /semantic_768/,
    /dimensions?\s*:\s*768/,
    /dimension\s*:\s*768/,
  ];
  return patterns.some((pattern) => pattern.test(text)) ? 768 : null;
}

function topologyFromRegistryEntry(model) {
  const expertCount = model.num_experts ?? model.num_local_experts ?? model.n_experts ?? model.expert_count ?? null;
  const topK = model.num_experts_per_tok ?? model.experts_per_token ?? model.top_k ?? model.moe_top_k ?? null;
  const valid = Number.isInteger(expertCount) && expertCount > 0 && Number.isInteger(topK) && topK > 0 && topK <= expertCount;
  return {
    model_id: model.id,
    runtime: model.runtime ?? null,
    topology_status: valid ? 'PROVEN_MOE' : (model.is_moe === false || model.moe === false ? 'PROVEN_DENSE' : 'TOPOLOGY_UNPROVEN'),
    architecture: valid ? 'moe' : (model.is_moe === false || model.moe === false ? 'dense' : 'unknown'),
    num_experts: valid ? expertCount : null,
    top_k: valid ? topK : null,
    registry_name_or_tags_used_as_topology_evidence: false,
  };
}

const modelRaw = await readFile(modelManifestPath, 'utf8');
const modelManifest = JSON.parse(modelRaw);
let featureRaw = '';
try {
  featureRaw = await readFile(featureIndexPath, 'utf8');
} catch {
  // OKF index is optional to this audit; absence remains observable.
}

const registrySemantic = modelManifest?.canonicalDimensions?.semantic ?? null;
const featureSemantic = inferYamlSemanticDimension(featureRaw);
const dimensionConflict = Number.isInteger(registrySemantic)
  && Number.isInteger(featureSemantic)
  && registrySemantic !== featureSemantic;

const report = {
  schema: 'atlas.algorithm-execution-identity-audit.v1',
  generated_at: new Date().toISOString(),
  inputs: {
    model_manifest: path.relative(root, modelManifestPath).replaceAll('\\', '/'),
    model_manifest_checksum: sha256(modelRaw),
    feature_index: featureRaw ? path.relative(root, featureIndexPath).replaceAll('\\', '/') : null,
    feature_index_checksum: featureRaw ? sha256(featureRaw) : null,
  },
  representation: {
    model_registry_declared_semantic_dimension: registrySemantic,
    feature_intelligence_detected_semantic_dimension: featureSemantic,
    status: dimensionConflict ? 'DIMENSION_CONFLICT_REQUIRES_PINNED_MANIFEST' : 'NO_DETECTED_CONFLICT',
    rule: 'A live AlgorithmExecutionManifestV1 must record the actual dimensions + representation_revision; global registry constants never override a pinned tensor snapshot.',
  },
  model_topology: (modelManifest.models ?? []).map(topologyFromRegistryEntry),
  infrastructure_rules: {
    n_api: 'transport/native ABI boundary only',
    grpc: 'transport only; channel reuse/streaming policy belongs outside mathematical algorithm identity',
    kafka_cdc: 'receipt/invalidation transport; never canonical authority',
    redis_valkey: 'cache only; cache keys must pin source/representation/algorithm revisions',
    simdjson: 'CPU parsing implementation detail; never tensor math or canonical fact authority',
    tensorrt: 'compiled inference backend; model/topology and numerical parity remain separately receipted',
  },
  geometry_rules: {
    nary_incidence: 'canonical relationship traversal geometry',
    quaternion_s3: 'derived routing/manifold projection',
    hilbert_curve_locality: 'space-filling locality ordering, not Hilbert-space semantics',
    jacobian_tangent: 'local sensitivity diagnostic, not global relation identity',
    harmonic: 'no canonical harmonic-sphere algorithm detected in this branch; do not infer one from evidence-harmony naming',
  },
  canonical_authority: false,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (dimensionConflict) process.exitCode = 2;
