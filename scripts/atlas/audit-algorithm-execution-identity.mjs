#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const modelManifestPath = path.join(root, 'models', 'model-manifest.json');
const featureIndexPath = path.join(root, '.okf', 'indexes', 'feature-intelligence.yaml');
const runtimeSemanticOwnerPath = path.join(
  root,
  'sveltekit-frontend',
  'src',
  'lib',
  'server',
  'embedding',
  'embedding-contract-768.ts',
);
const outputPath = path.join(root, 'reports', 'algorithm-execution-identity-audit.json');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function inferYamlSemanticDimension(text) {
  const patterns = [
    /semantic_768/,
    /canonical_dimension\s*:\s*768/,
    /dimensions?\s*:\s*768/,
    /dimension\s*:\s*768/,
  ];
  return patterns.some((pattern) => pattern.test(text)) ? 768 : null;
}

function parseRuntimeSemanticOwner(text) {
  const representation = text.match(/SEMANTIC_REPRESENTATION_ID\s*=\s*['"]([^'"]+)['"]/)?.[1] ?? null;
  const dimensionRaw = text.match(/SEMANTIC_DIMENSION\s*=\s*(\d+)/)?.[1] ?? null;
  const collection = text.match(/CANONICAL_QDRANT_COLLECTION\s*=\s*['"]([^'"]+)['"]/)?.[1] ?? null;
  const dimension = dimensionRaw == null ? null : Number.parseInt(dimensionRaw, 10);
  const valid = representation === 'semantic_768'
    && dimension === 768
    && collection === 'codebase_chunks_768';
  return { representation, dimension, collection, valid };
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

const [modelRaw, runtimeOwnerRaw] = await Promise.all([
  readFile(modelManifestPath, 'utf8'),
  readFile(runtimeSemanticOwnerPath, 'utf8'),
]);
const modelManifest = JSON.parse(modelRaw);
let featureRaw = '';
try {
  featureRaw = await readFile(featureIndexPath, 'utf8');
} catch {
  // Absence remains observable; it is a gate failure below.
}

const registrySemantic = modelManifest?.canonicalDimensions?.semantic ?? null;
const featureSemantic = inferYamlSemanticDimension(featureRaw);
const runtimeOwner = parseRuntimeSemanticOwner(runtimeOwnerRaw);
const runtimeAligned = runtimeOwner.valid;
const featureAligned = featureSemantic === runtimeOwner.dimension;
const registryAligned = registrySemantic === runtimeOwner.dimension;

const hardFailure = !runtimeAligned || !featureAligned;
const registryDrift = runtimeAligned && Number.isInteger(registrySemantic) && !registryAligned;
const representationStatus = hardFailure
  ? 'SEMANTIC_RUNTIME_AUTHORITY_UNRESOLVED'
  : registryDrift
    ? 'RESOLVED_RUNTIME_768_WITH_STALE_MODEL_REGISTRY_METADATA'
    : 'RESOLVED_RUNTIME_768';

const report = {
  schema: 'atlas.algorithm-execution-identity-audit.v2',
  generated_at: new Date().toISOString(),
  status: hardFailure ? 'FAIL' : registryDrift ? 'PASS_WITH_METADATA_DRIFT' : 'PASS',
  inputs: {
    runtime_semantic_owner: path.relative(root, runtimeSemanticOwnerPath).replaceAll('\\', '/'),
    runtime_semantic_owner_checksum: sha256(runtimeOwnerRaw),
    model_manifest: path.relative(root, modelManifestPath).replaceAll('\\', '/'),
    model_manifest_checksum: sha256(modelRaw),
    feature_index: featureRaw ? path.relative(root, featureIndexPath).replaceAll('\\', '/') : null,
    feature_index_checksum: featureRaw ? sha256(featureRaw) : null,
  },
  representation: {
    authority_scope: 'active_runtime_semantic_lane',
    authority_owner: path.relative(root, runtimeSemanticOwnerPath).replaceAll('\\', '/'),
    authority_representation_id: runtimeOwner.representation,
    authority_dimension: runtimeOwner.dimension,
    authority_qdrant_collection: runtimeOwner.collection,
    feature_intelligence_detected_semantic_dimension: featureSemantic,
    model_registry_declared_semantic_dimension: registrySemantic,
    model_registry_role: 'deployment_inventory_metadata_not_runtime_semantic_contract_authority',
    model_registry_metadata_drift: registryDrift,
    status: representationStatus,
    rule: 'The active runtime semantic owner wins. Every live AlgorithmExecutionManifestV1 must still pin dimensions, representation_revision, snapshot revision and checksums so stale metadata cannot redirect execution.',
  },
  gates: {
    RUNTIME_SEMANTIC_OWNER_IS_768: runtimeAligned ? 'PASS' : 'FAIL',
    FEATURE_INDEX_MATCHES_RUNTIME_OWNER: featureAligned ? 'PASS' : 'FAIL',
    MODEL_REGISTRY_METADATA_MATCHES_RUNTIME_OWNER: registryAligned ? 'PASS' : 'WARN_STALE_METADATA',
  },
  follow_up: registryDrift
    ? [
        'Update models/model-manifest.json canonicalDimensions.semantic and the canonical embedding entry in a dedicated registry-reconciliation change.',
        'Do not re-enable 384 runtime reads/writes while performing that metadata cleanup.',
      ]
    : [],
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
if (hardFailure) process.exitCode = 2;
