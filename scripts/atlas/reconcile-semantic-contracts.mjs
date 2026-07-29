#!/usr/bin/env node
/**
 * Semantic Infrastructure Reconciliation Audit
 *
 * Maps existing seams (OKF sources, packet validation, HyperRAG packet RPC,
 * packet identity, topology/routing, Qdrant payload, PostgreSQL rows, Redis values)
 * to canonical owners per the SemanticPacketV1 contract.
 *
 * Outputs:
 * - semantic-contract-reconciliation.json  (contract status by ownership lane)
 * - semantic-contract-conflicts.ndjson    (field name/type mismatches)
 * - semantic-contract-identity-map.json   (packet_key identity lineage)
 */

import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';

const OUTPUT_DIR = 'reports/semantic-contracts';
const REPO_ROOT = process.cwd();

// Canonical contract shape per the live repo seams
const CONTRACT_SHAPE = {
  SemanticPacketV1: {
    identity: ['packetKey', 'workspaceId', 'sourceRef', 'semanticAnchor'],
    semantic: ['featureId', 'featureLabel', 'titleId', 'domainClass'],
    lineage: ['treeNodeId', 'qualifiedName', 'signatureHash', 'previousTreeNodeId', 'structuralRevision'],
    content: ['contentHash', 'summary', 'summaryModel'],
    representations: ['embedding.legacy_768', 'embedding.semantic_384', 'embedding.latent_64', 'embedding.topology_4d'],
    derived: ['derivedParameters', 'rankFusion', 'identityLane', 'identityConfidence'],
  },
  HypergraphFactV1: {
    identity: ['factId', 'packetKey', 'workspaceId', 'factVersion'],
    structure: ['factType', 'participants', 'participantsByRole', 'relations'],
    evidence: ['evidencePacketKeys', 'evidenceRefs', 'confidence', 'authorityClass', 'resolutionState'],
  },
  FeatureMatrixRowV1: {
    identity: ['identity.packet_key', 'identity.source_ref', 'identity.file_path', 'identity.feature_id', 'identity.title_id', 'identity.tree_node_id'],
    dense: ['dense_768', 'dense_384', 'latent_64'],
    lexical: ['lexical', 'bm25', 'bm42'],
    topology: ['topology', 'pagerank_score', 'som_cell_row', 'som_cell_col', 'som_index', 'som_distance_to_centroid'],
    classifiers: ['classifiers', 'naive_bayes_class', 'naive_bayes_score', 'logistic_regression_score', 'xgboost_score'],
    provenance: ['workspace_revision', 'schema_version', 'feature_labels', 'is_valid', 'validation_errors'],
  },
  ContractValidationResult: {
    outcome: ['isValid', 'canPromotion', 'violations'],
    audit: ['validatedAt', 'validatedBy', 'phase', 'blockedLayers', 'warnLayers', 'passLayers'],
    snapshots: ['projections'],
  },
};

// Ownership lanes (canonical seam points)
const OWNERSHIP_LANES = {
  OKF_SOURCE: 'declarative semantic source (.okf and docs contracts)',
  PACKET_VALIDATION: 'validation-result-v1.ts + Zod runtime gates',
  HYPERRAG_PACKET_RPC: 'hyperrag-projection-contract.ts + packet RPC routes',
  PACKET_IDENTITY: 'semantic-packet-v1.ts + identity utilities',
  FEATURE_MATRIX: 'feature-matrix-schema.ts + dense-lane-policy.ts + retrieval-candidate.ts',
  TOPOLOGY_ROUTING: 'SOM/KMeans/Neo4j projection + latent_64 routing',
  QDRANT_PAYLOAD: 'Qdrant collection payload schema and named vectors',
  POSTGRES_ROWS: 'atlas_packets + feature-matrix rows + OKF provenance tables',
  REDIS_VALUES: 'bifrost:packet:*, centroid:*, ace:packet:*',
};

// Field name mappings (reconcile naming across layers)
const FIELD_MAPPINGS = {
  // packet_key identity (immutable, deterministic)
  packet_key: ['packet_key', 'packetKey'],

  // tree_node_id identity (structural AST identity)
  tree_node_id: ['tree_node_id', 'treeNodeId', 'node_id'],

  // title_id identity (grouping)
  title_id: ['title_id', 'titleId'],

  // source_ref identity (source file path)
  source_ref: ['source_ref', 'sourceRef', 'file_path', 'source_path'],

  // content_hash (integrity)
  content_hash: ['content_hash', 'contentHash', 'summary_hash', 'summaryHash'],

  // qdrant identity
  qdrant_point_id: ['qdrant_point_id', 'qdrantPointId', 'qdrant_id'],

  // postgres identity
  postgres_row_id: ['id', 'row_id', 'packet_id'],

  // redis key
  redis_key: ['bifrost:packet:*', 'centroid:feature:*', 'gpu:karpathy:*'],
};

const LANE_EVIDENCE_TYPES = {
  FILE_EXISTS: 'FILE_EXISTS',
  IMPORT_REFERENCE: 'IMPORT_REFERENCE',
  FIXTURE_RESULT: 'FIXTURE_RESULT',
  RUNTIME_RESULT: 'RUNTIME_RESULT',
  CROSS_STORE_RESULT: 'CROSS_STORE_RESULT',
};

function deriveLaneStatus(evidence) {
  const types = new Set((evidence ?? []).map((item) => item.evidenceType));
  if (types.has(LANE_EVIDENCE_TYPES.CROSS_STORE_RESULT)) return 'CROSS_STORE_PROVEN';
  if (types.has(LANE_EVIDENCE_TYPES.RUNTIME_RESULT)) return 'RUNTIME_SMOKE_PROVEN';
  if (types.has(LANE_EVIDENCE_TYPES.FIXTURE_RESULT)) return 'FIXTURE_PROVEN';
  if (types.has(LANE_EVIDENCE_TYPES.IMPORT_REFERENCE)) return 'STATICALLY_REFERENCED';
  if (types.has(LANE_EVIDENCE_TYPES.FILE_EXISTS)) return 'PRESENT';
  return 'ABSENT';
}

async function runGrep(pattern, targetFiles = []) {
  try {
    const fileArgs = targetFiles
      .filter(Boolean)
      .map((file) => `"${path.join(REPO_ROOT, file)}"`)
      .join(' ');
    if (!fileArgs) return [];
    const cmd = `rg -n --hidden --no-ignore -e "${pattern}" ${fileArgs}`;
    const output = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return output.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

const OKF_OWNER_FILES = [
  '.okf/manifest.yaml',
  '.okf/systems/hyperrag.md',
  'docs/deep-research-task-schema.okf.yaml',
  'docs/contracts/latent64.okf.json',
  'config/vector-lanes.schema.json',
  'sveltekit-frontend/src/lib/server/okf/mastra-workflows.okf.yaml',
  'sveltekit-frontend/src/lib/server/okf/mastra-okf-loader.ts',
  'src/routes/api/export/okf/+server.ts',
  'src/lib/server/export/okf-serializer.ts',
  'src/lib/server/ingest/ingest-packet-schema.ts',
  'src/lib/server/atlas/ace-kag-dag-evidence-schema.ts',
  'sveltekit-frontend/src/lib/server/ontology/packet-ontology.schema.ts',
  'sveltekit-frontend/src/lib/server/identity/ulid.ts',
  'sveltekit-frontend/src/lib/server/hyperrag/hyperrag-projection-contract.ts',
  'sveltekit-frontend/src/routes/api/hyperrag/packet-rpc/+server.ts',
  'sveltekit-frontend/src/routes/api/atlas/hyperrag-packet-rpc/+server.ts',
  'src/lib/server/topology/feature-tracking-layer.ts',
];

const PACKET_VALIDATION_FILES = [
  'src/lib/server/ingest/ingest-packet-schema.ts',
  'src/lib/server/atlas/ace-kag-dag-evidence-schema.ts',
  'sveltekit-frontend/src/lib/server/ontology/packet-ontology.schema.ts',
  'sveltekit-frontend/src/lib/server/okf/mastra-okf-loader.ts',
];

const HYPERRAG_RPC_FILES = [
  'sveltekit-frontend/src/lib/server/hyperrag/hyperrag-projection-contract.ts',
  'sveltekit-frontend/src/routes/api/hyperrag/packet-rpc/+server.ts',
  'sveltekit-frontend/src/routes/api/atlas/hyperrag-packet-rpc/+server.ts',
  'src/lib/server/topology/feature-tracking-layer.ts',
];

const PACKET_IDENTITY_FILES = [
  'src/lib/server/ingest/ingest-packet-schema.ts',
  'src/lib/server/atlas/ace-kag-dag-evidence-schema.ts',
  'sveltekit-frontend/src/lib/server/ontology/packet-ontology.schema.ts',
  'sveltekit-frontend/src/lib/server/identity/ulid.ts',
  'sveltekit-frontend/src/lib/server/hyperrag/hyperrag-projection-contract.ts',
];

const TOPOLOGY_ROUTING_FILES = [
  'sveltekit-frontend/src/lib/server/topology/feature-tracking-layer.ts',
  'sveltekit-frontend/src/lib/server/atlas/contracts/dense-lane-policy.ts',
  'scripts/atlas/compute-neo4j-pagerank.mts',
  'scripts/atlas/train-som-20x20.mts',
  'scripts/atlas/train-kmeans-384.mts',
  'scripts/atlas/backfill-topology-lane.mts',
  'scripts/atlas/backfill-topology-authority.mts',
];

const QDRANT_PAYLOAD_FILES = [
  'sveltekit-frontend/src/lib/server/vector/qdrant-manager.ts',
  'sveltekit-frontend/src/lib/server/vector/vector-contracts.ts',
  'sveltekit-frontend/src/lib/server/atlas/qdrant-collection-contracts.ts',
  'scripts/atlas/enrich-qdrant-som-payload.mts',
  'scripts/atlas/phase108d-qdrant-payload-enrichment.mts',
  'scripts/atlas/backfill-qdrant-identity-payload.mts',
];

const POSTGRES_ROW_FILES = [
  'src/lib/server/db/schema.ts',
  'src/lib/server/db/client.ts',
  'sveltekit-frontend/src/lib/server/db/client.ts',
  'scripts/atlas/phase108d-single-packet-proof.mts',
  'scripts/atlas/phase108d-proof-matrix.mts',
  'scripts/atlas/qdrant-postgres-identity-audit.mjs',
];

const REDIS_VALUE_FILES = [
  'scripts/atlas/lib/redis-client-factory.mjs',
  'sveltekit-frontend/src/lib/server/cache/bifrost-som-prefilter.ts',
  'sveltekit-frontend/src/lib/server/cache/atlas-cache-cascade.ts',
  'scripts/atlas/prewarm-redis-centroids.mts',
  'scripts/atlas/phase108d-redis-snapshot.mts',
  'scripts/atlas/phase108d-single-packet-proof.mts',
];

async function auditOkfSources() {
  console.log('📋 Auditing OKF sources...');
  const okfFiles = await runGrep('OKFSchema|okf_form|OKF', OKF_OWNER_FILES);
  const okfPattern = await runGrep('ofk_result|OkfForm', OKF_OWNER_FILES);
  const evidence = [];
  if (okfFiles.length > 0) {
    evidence.push({
      evidenceType: LANE_EVIDENCE_TYPES.FILE_EXISTS,
      sourceRef: okfFiles[0].split(':')[0],
      validationResultId: 'okf-source-files',
      observedAt: new Date().toISOString(),
    });
  }
  if (okfPattern.length > 0) {
    evidence.push({
      evidenceType: LANE_EVIDENCE_TYPES.IMPORT_REFERENCE,
      sourceRef: okfPattern[0].split(':')[0],
      validationResultId: 'okf-source-usage',
      observedAt: new Date().toISOString(),
    });
  }

  return {
    lane: 'OKF_SOURCE',
    files_found: [...new Set([...okfFiles, ...okfPattern].map(l => l.split(':')[0]))].length,
    declaration_count: okfFiles.length,
    usage_count: okfPattern.length,
    evidence,
    status: deriveLaneStatus(evidence),
  };
}

async function auditPacketValidation() {
  console.log('📋 Auditing packet validation (Zod)...');
  const validationFiles = await runGrep('phase18-envelope|validatePhase18', PACKET_VALIDATION_FILES);
  const zodSchemas = await runGrep('phase18RequestEnvelope|phase18ResponseEnvelope', PACKET_VALIDATION_FILES);
  const evidence = [];
  if (validationFiles.length > 0) {
    evidence.push({
      evidenceType: LANE_EVIDENCE_TYPES.FILE_EXISTS,
      sourceRef: validationFiles[0].split(':')[0],
      validationResultId: 'packet-validation-files',
      observedAt: new Date().toISOString(),
    });
  }
  if (zodSchemas.length > 0) {
    evidence.push({
      evidenceType: LANE_EVIDENCE_TYPES.IMPORT_REFERENCE,
      sourceRef: zodSchemas[0].split(':')[0],
      validationResultId: 'packet-validation-zod',
      observedAt: new Date().toISOString(),
    });
  }

  return {
    lane: 'PACKET_VALIDATION',
    files_found: [...new Set(validationFiles.map(l => l.split(':')[0]))].length,
    validation_schemas: zodSchemas.length,
    evidence,
    status: deriveLaneStatus(evidence),
  };
}

async function auditHyperragPacketRpc() {
  console.log('📋 Auditing HyperRAG packet RPC...');
  const rpcFiles = await runGrep('HyperRagPacketRpc|hyperrag-packet-rpc', HYPERRAG_RPC_FILES);
  const rpcUsage = await runGrep('HyperRagPacket', HYPERRAG_RPC_FILES);
  const evidence = [];
  if (rpcFiles.length > 0) {
    evidence.push({
      evidenceType: LANE_EVIDENCE_TYPES.FILE_EXISTS,
      sourceRef: rpcFiles[0].split(':')[0],
      validationResultId: 'hyperrag-rpc-files',
      observedAt: new Date().toISOString(),
    });
  }
  if (rpcUsage.length > 0) {
    evidence.push({
      evidenceType: LANE_EVIDENCE_TYPES.IMPORT_REFERENCE,
      sourceRef: rpcUsage[0].split(':')[0],
      validationResultId: 'hyperrag-rpc-usage',
      observedAt: new Date().toISOString(),
    });
  }

  return {
    lane: 'HYPERRAG_PACKET_RPC',
    files_found: [...new Set(rpcFiles.map(l => l.split(':')[0]))].length,
    rpc_usage: rpcUsage.length,
    evidence,
    status: deriveLaneStatus(evidence),
  };
}

async function auditPacketIdentity() {
  console.log('📋 Auditing packet identity utilities...');

  const packetKeyRefs = await runGrep('packet_key', PACKET_IDENTITY_FILES);
  const treeNodeIdRefs = await runGrep('tree_node_id', PACKET_IDENTITY_FILES);
  const titleIdRefs = await runGrep('title_id', PACKET_IDENTITY_FILES);
  const evidence = [];
  if (packetKeyRefs.length > 0) {
    evidence.push({
      evidenceType: LANE_EVIDENCE_TYPES.IMPORT_REFERENCE,
      sourceRef: packetKeyRefs[0].split(':')[0],
      validationResultId: 'packet-key-refs',
      observedAt: new Date().toISOString(),
    });
  }
  if (treeNodeIdRefs.length > 0) {
    evidence.push({
      evidenceType: LANE_EVIDENCE_TYPES.IMPORT_REFERENCE,
      sourceRef: treeNodeIdRefs[0].split(':')[0],
      validationResultId: 'tree-node-id-refs',
      observedAt: new Date().toISOString(),
    });
  }

  // Check for conflicts (field name mismatches)
  const conflicts = {
    packet_key_naming: new Set(),
    tree_node_id_naming: new Set(),
    title_id_naming: new Set(),
  };

  packetKeyRefs.forEach(line => {
    const file = line.split(':')[0];
    if (line.includes('packetKey')) conflicts.packet_key_naming.add(`${file}: uses camelCase, should be snake_case`);
  });

  treeNodeIdRefs.forEach(line => {
    const file = line.split(':')[0];
    if (line.includes('treeNodeId')) conflicts.tree_node_id_naming.add(`${file}: uses camelCase, should be snake_case`);
  });

  return {
    lane: 'PACKET_IDENTITY',
    packet_key_refs: packetKeyRefs.length,
    tree_node_id_refs: treeNodeIdRefs.length,
    title_id_refs: titleIdRefs.length,
    naming_conflicts: Array.from([...conflicts.packet_key_naming, ...conflicts.tree_node_id_naming, ...conflicts.title_id_naming]),
    evidence,
    status: conflicts.packet_key_naming.size || conflicts.tree_node_id_naming.size || conflicts.title_id_naming.size
      ? 'CONFLICTING'
      : deriveLaneStatus(evidence),
  };
}

async function auditTopologyRouting() {
  console.log('📋 Auditing topology/routing features...');

  const somRefs = await runGrep('som_cluster|somCluster', TOPOLOGY_ROUTING_FILES);
  const kmeansRefs = await runGrep('kmeans_cluster|kmeansCluster', TOPOLOGY_ROUTING_FILES);
  const pageRankRefs = await runGrep('pagerank|pageRank', TOPOLOGY_ROUTING_FILES);
  const evidence = [];
  if (somRefs.length > 0) {
    evidence.push({
      evidenceType: LANE_EVIDENCE_TYPES.IMPORT_REFERENCE,
      sourceRef: somRefs[0].split(':')[0],
      validationResultId: 'som-refs',
      observedAt: new Date().toISOString(),
    });
  }
  if (kmeansRefs.length > 0) {
    evidence.push({
      evidenceType: LANE_EVIDENCE_TYPES.IMPORT_REFERENCE,
      sourceRef: kmeansRefs[0].split(':')[0],
      validationResultId: 'kmeans-refs',
      observedAt: new Date().toISOString(),
    });
  }
  if (pageRankRefs.length > 0) {
    evidence.push({
      evidenceType: LANE_EVIDENCE_TYPES.IMPORT_REFERENCE,
      sourceRef: pageRankRefs[0].split(':')[0],
      validationResultId: 'pagerank-refs',
      observedAt: new Date().toISOString(),
    });
  }

  return {
    lane: 'TOPOLOGY_ROUTING',
    som_refs: somRefs.length,
    kmeans_refs: kmeansRefs.length,
    pagerank_refs: pageRankRefs.length,
    evidence,
    status: deriveLaneStatus(evidence),
  };
}

async function auditQdrantPayload() {
  console.log('📋 Auditing Qdrant payload schema...');

  const qdrantPayload = await runGrep('buildVectorPayload|qdrant_tags', QDRANT_PAYLOAD_FILES);
  const payloadUsage = await runGrep('payload', QDRANT_PAYLOAD_FILES);
  const evidence = [];
  if (qdrantPayload.length > 0) {
    evidence.push({
      evidenceType: LANE_EVIDENCE_TYPES.FILE_EXISTS,
      sourceRef: qdrantPayload[0].split(':')[0],
      validationResultId: 'qdrant-payload-files',
      observedAt: new Date().toISOString(),
    });
  }
  if (payloadUsage.length > 0) {
    evidence.push({
      evidenceType: LANE_EVIDENCE_TYPES.IMPORT_REFERENCE,
      sourceRef: payloadUsage[0].split(':')[0],
      validationResultId: 'qdrant-payload-usage',
      observedAt: new Date().toISOString(),
    });
  }

  return {
    lane: 'QDRANT_PAYLOAD',
    payload_schema_refs: qdrantPayload.length,
    payload_usage: Math.min(payloadUsage.length, 50), // Cap to avoid false positives
    evidence,
    status: deriveLaneStatus(evidence),
  };
}

async function auditPostgresRows() {
  console.log('📋 Auditing Postgres schema (atlas_packets, codebase_chunk_index)...');

  const atlasPacketsRefs = await runGrep('atlas_packets', POSTGRES_ROW_FILES);
  const codebaseChunkRefs = await runGrep('codebase_chunk_index', POSTGRES_ROW_FILES);
  const evidence = [];
  if (atlasPacketsRefs.length > 0) {
    evidence.push({
      evidenceType: LANE_EVIDENCE_TYPES.FILE_EXISTS,
      sourceRef: atlasPacketsRefs[0].split(':')[0],
      validationResultId: 'atlas-packets-files',
      observedAt: new Date().toISOString(),
    });
  }
  if (codebaseChunkRefs.length > 0) {
    evidence.push({
      evidenceType: LANE_EVIDENCE_TYPES.IMPORT_REFERENCE,
      sourceRef: codebaseChunkRefs[0].split(':')[0],
      validationResultId: 'codebase-chunk-files',
      observedAt: new Date().toISOString(),
    });
  }

  return {
    lane: 'POSTGRES_ROWS',
    atlas_packets_refs: atlasPacketsRefs.length,
    codebase_chunk_index_refs: codebaseChunkRefs.length,
    evidence,
    status: deriveLaneStatus(evidence),
  };
}

async function auditRedisValues() {
  console.log('📋 Auditing Redis/Bifrost cache...');

  const bifrostRefs = await runGrep('bifrost:', REDIS_VALUE_FILES);
  const redisKeyRefs = await runGrep('redis', REDIS_VALUE_FILES);
  const evidence = [];
  if (bifrostRefs.length > 0) {
    evidence.push({
      evidenceType: LANE_EVIDENCE_TYPES.FILE_EXISTS,
      sourceRef: bifrostRefs[0].split(':')[0],
      validationResultId: 'bifrost-refs',
      observedAt: new Date().toISOString(),
    });
  }
  if (redisKeyRefs.length > 0) {
    evidence.push({
      evidenceType: LANE_EVIDENCE_TYPES.IMPORT_REFERENCE,
      sourceRef: redisKeyRefs[0].split(':')[0],
      validationResultId: 'redis-key-refs',
      observedAt: new Date().toISOString(),
    });
  }

  return {
    lane: 'REDIS_VALUES',
    bifrost_refs: bifrostRefs.length,
    redis_key_refs: Math.min(redisKeyRefs.length, 30), // Cap general redis refs
    evidence,
    status: deriveLaneStatus(evidence),
  };
}

async function buildIdentityMap() {
  console.log('🔗 Building packet_key identity lineage...');

  const map = {
    canonical_identity: 'packetKey / packet_key (canonical identity; all mirrors must preserve it)',
    derivation: {
      source_file: 'sourceRef (file path / source provenance)',
      structural_identity: 'treeNodeId / tree_node_id (AST identity)',
      grouping_identity: 'titleId / title_id (semantic grouping key)',
      content_integrity: 'contentHash / content_hash (sha256 of content)',
    },
    immutability_rule: 'packet_key MUST remain identical across all storage layers',
    traversal_layers: {
      source: 'Original file / OKF contract → sourceRef extracted',
      validation: 'Zod / schema validation → packet identity admitted',
      postgres: 'atlas_packets.packet_key canonical row',
      qdrant: 'codebase_chunks_768 and codebase_chunks_384 payload.packet_key',
      redis: 'bifrost:packet:{packet_key} / ace:packet:{runId}',
      hyperrag: 'HyperRagProjectionRequest + packet RPC response',
      agent: 'ACE context packet keeps packet identity unchanged',
    },
    evidence_gates: [
      'packet identity immutability across storage (Postgres → Qdrant → Redis → HyperRAG → Agent)',
      'contentHash matches original file or canonical source materialization (no mutation)',
      'no unresolved state silently converted to RESOLVED',
      'feature routing fields (latent_64, SOM, PageRank, kmeans_cluster) keep routing/topology semantics only',
    ],
  };

  return map;
}

async function main() {
  console.log('🔍 Semantic Infrastructure Reconciliation Audit\n');
  console.log(`Output directory: ${OUTPUT_DIR}\n`);

  // Ensure output directory
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Audit all ownership lanes
  const results = {
    timestamp: new Date().toISOString(),
    repo_root: REPO_ROOT,
    contract_shape: CONTRACT_SHAPE,
    ownership_lanes: OWNERSHIP_LANES,
    lane_audits: {
      okf_sources: await auditOkfSources(),
      packet_validation: await auditPacketValidation(),
      hyperrag_packet_rpc: await auditHyperragPacketRpc(),
      packet_identity: await auditPacketIdentity(),
      topology_routing: await auditTopologyRouting(),
      qdrant_payload: await auditQdrantPayload(),
      postgres_rows: await auditPostgresRows(),
      redis_values: await auditRedisValues(),
    },
    identity_map: await buildIdentityMap(),
  };

  // Write reconciliation report
  const reconPath = path.join(OUTPUT_DIR, 'semantic-contract-reconciliation.json');
  await fs.writeFile(reconPath, JSON.stringify(results, null, 2));
  console.log(`✅ Wrote reconciliation report: ${reconPath}`);

  // Collect conflicts
  const conflicts = results.lane_audits.packet_identity.naming_conflicts || [];
  const conflictPath = path.join(OUTPUT_DIR, 'semantic-contract-conflicts.ndjson');
  await fs.writeFile(
    conflictPath,
    conflicts.map(c => JSON.stringify({ conflict: c, type: 'field_naming', severity: 'medium' })).join('\n')
  );
  console.log(`✅ Wrote conflicts report: ${conflictPath}`);

  // Write identity map
  const identityPath = path.join(OUTPUT_DIR, 'semantic-contract-identity-map.json');
  await fs.writeFile(identityPath, JSON.stringify(results.identity_map, null, 2));
  console.log(`✅ Wrote identity map: ${identityPath}`);

  // Summary
  console.log('\n📊 Audit Summary:');
  Object.entries(results.lane_audits).forEach(([lane, audit]) => {
    console.log(`  ${audit.lane}: ${audit.status}`);
  });

  const statusCounts = Object.values(results.lane_audits).reduce((acc, audit) => {
    acc[audit.status] = (acc[audit.status] ?? 0) + 1;
    return acc;
  }, {});
  const totalLanes = Object.keys(results.lane_audits).length;
  const evidencePresent = Object.values(results.lane_audits).filter((audit) => audit.status !== 'ABSENT').length;
  const coverage = (evidencePresent / totalLanes) * 100;

  console.log(`\n🎯 Evidence Coverage: ${coverage.toFixed(1)}% (${evidencePresent}/${totalLanes} lanes with evidence)`);
  console.log(`   Status counts: ${Object.entries(statusCounts).map(([k, v]) => `${k}=${v}`).join(', ')}`);

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Reconciliation audit failed:', err.message);
  process.exit(1);
});
