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

// Canonical contract shape per Session 142 reframing
const CONTRACT_SHAPE = {
  SemanticPacketV1: {
    identity: ['packet_key', 'tree_node_id', 'source_ref', 'title_id', 'content_hash'],
    content: ['summary', 'embedding', 'gemma4_summary', 'tags'],
    knowledge: ['feature_id', 'feature_label', 'ontology_label', 'topology_label'],
    resolution: ['status', 'confidence', 'verified_at', 'verification_command'],
    authority: ['karpathy_blend_score', 'pagerank_score', 'authority_class'],
    representations: ['qdrant_point_id', 'postgres_row_id', 'redis_key', 'cold_storage_uri'],
  },
  HypergraphFactV1: {
    identity: ['fact_id', 'fact_ulid', 'packet_key'],
    structure: ['type', 'participants', 'properties'],
    evidence: ['evidence_packet_ids', 'confidence', 'disputed'],
  },
  FeatureMatrixRowV1: {
    routing: ['som_cluster', 'kmeans_cluster', 'cluster_key'],
    topology: ['neo4j_neighbors', 'community_id', 'directory_path'],
    semantic: ['embedding', 'dense_score', 'sparse_score'],
    lexical: ['trigram_score', 'fts_score'],
    ontology: ['ontology_label', 'domain_class'],
    classifier: ['required_verification', 'priority_rank'],
  },
  ContractValidationResult: {
    outcome: ['is_valid', 'validation_errors'],
    audit: ['validated_at', 'validated_by', 'trace_id'],
  },
};

// Ownership lanes (canonical seam points)
const OWNERSHIP_LANES = {
  OKF_SOURCE: 'declarative semantic source (root files)',
  PACKET_VALIDATION: 'phase18-envelope-schema.ts + Zod',
  HYPERRAG_PACKET_RPC: 'hyperrag-packet-rpc.ts response contract',
  PACKET_IDENTITY: 'packet identity utilities (packet-key, tree-node-id)',
  TOPOLOGY_ROUTING: 'SOM/KMeans/Neo4j projection',
  QDRANT_PAYLOAD: 'Qdrant collection payload schema',
  POSTGRES_ROWS: 'atlas_packets + codebase_chunk_index tables',
  REDIS_VALUES: 'bifrost:packet:*, centroid:*, gpu:karpathy:scores',
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

async function runGrep(pattern, glob = 'sveltekit-frontend/src/**/*.ts') {
  try {
    const cmd = `rg -n "${pattern}" "${glob}"`;
    const output = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return output.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

async function auditOkfSources() {
  console.log('📋 Auditing OKF sources...');
  const okfFiles = await runGrep('OKFSchema|okf_form|OKF');
  const okfPattern = await runGrep('ofk_result|OkfForm');

  return {
    lane: 'OKF_SOURCE',
    files_found: [...new Set([...okfFiles, ...okfPattern].map(l => l.split(':')[0]))].length,
    declaration_count: okfFiles.length,
    usage_count: okfPattern.length,
    status: okfFiles.length > 0 ? 'WIRED' : 'NOT_WIRED',
  };
}

async function auditPacketValidation() {
  console.log('📋 Auditing packet validation (Zod)...');
  const validationFiles = await runGrep('phase18-envelope|validatePhase18');
  const zodSchemas = await runGrep('phase18RequestEnvelope|phase18ResponseEnvelope');

  return {
    lane: 'PACKET_VALIDATION',
    files_found: [...new Set(validationFiles.map(l => l.split(':')[0]))].length,
    validation_schemas: zodSchemas.length,
    status: zodSchemas.length > 0 ? 'WIRED' : 'NOT_WIRED',
  };
}

async function auditHyperragPacketRpc() {
  console.log('📋 Auditing HyperRAG packet RPC...');
  const rpcFiles = await runGrep('HyperRagPacketRpc|hyperrag-packet-rpc');
  const rpcUsage = await runGrep('HyperRagPacket');

  return {
    lane: 'HYPERRAG_PACKET_RPC',
    files_found: [...new Set(rpcFiles.map(l => l.split(':')[0]))].length,
    rpc_usage: rpcUsage.length,
    status: rpcFiles.length > 0 ? 'WIRED' : 'NOT_WIRED',
  };
}

async function auditPacketIdentity() {
  console.log('📋 Auditing packet identity utilities...');

  const packetKeyRefs = await runGrep('packet_key');
  const treeNodeIdRefs = await runGrep('tree_node_id');
  const titleIdRefs = await runGrep('title_id');

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
    status: packetKeyRefs.length > 0 ? 'WIRED' : 'NOT_WIRED',
  };
}

async function auditTopologyRouting() {
  console.log('📋 Auditing topology/routing features...');

  const somRefs = await runGrep('som_cluster|somCluster');
  const kmeansRefs = await runGrep('kmeans_cluster|kmeansCluster');
  const pageRankRefs = await runGrep('pagerank|pageRank');

  return {
    lane: 'TOPOLOGY_ROUTING',
    som_refs: somRefs.length,
    kmeans_refs: kmeansRefs.length,
    pagerank_refs: pageRankRefs.length,
    status: (somRefs.length > 0 && kmeansRefs.length > 0) ? 'WIRED' : 'PARTIAL',
  };
}

async function auditQdrantPayload() {
  console.log('📋 Auditing Qdrant payload schema...');

  const qdrantPayload = await runGrep('buildVectorPayload|qdrant_tags');
  const payloadUsage = await runGrep('payload');

  return {
    lane: 'QDRANT_PAYLOAD',
    payload_schema_refs: qdrantPayload.length,
    payload_usage: Math.min(payloadUsage.length, 50), // Cap to avoid false positives
    status: qdrantPayload.length > 0 ? 'WIRED' : 'NOT_WIRED',
  };
}

async function auditPostgresRows() {
  console.log('📋 Auditing Postgres schema (atlas_packets, codebase_chunk_index)...');

  const atlasPacketsRefs = await runGrep('atlas_packets');
  const codebaseChunkRefs = await runGrep('codebase_chunk_index');

  return {
    lane: 'POSTGRES_ROWS',
    atlas_packets_refs: atlasPacketsRefs.length,
    codebase_chunk_index_refs: codebaseChunkRefs.length,
    status: (atlasPacketsRefs.length > 0 || codebaseChunkRefs.length > 0) ? 'WIRED' : 'NOT_WIRED',
  };
}

async function auditRedisValues() {
  console.log('📋 Auditing Redis/Bifrost cache...');

  const bifrostRefs = await runGrep('bifrost:');
  const redisKeyRefs = await runGrep('redis');

  return {
    lane: 'REDIS_VALUES',
    bifrost_refs: bifrostRefs.length,
    redis_key_refs: Math.min(redisKeyRefs.length, 30), // Cap general redis refs
    status: bifrostRefs.length > 0 ? 'WIRED' : 'NOT_WIRED',
  };
}

async function buildIdentityMap() {
  console.log('🔗 Building packet_key identity lineage...');

  const map = {
    canonical_identity: 'packet_key (deterministic sha256 of source_ref + tree_node_id + title_id)',
    derivation: {
      source_file: 'source_ref (file path)',
      structural_identity: 'tree_node_id (AST node identifier from tree-sitter)',
      grouping_identity: 'title_id (semantic grouping key)',
      content_integrity: 'content_hash (sha256 of content)',
    },
    immutability_rule: 'packet_key MUST remain identical across all storage layers',
    traversal_layers: {
      source: 'Original file → source_ref extracted',
      validation: 'Zod schema validation → packet_key computed',
      postgres: 'atlas_packets.packet_key canonical row',
      qdrant: 'codebase_chunks_768 payload.packet_key',
      redis: 'bifrost:packet:{packet_key}',
      hyperrag: 'HyperRagPacketRpcPacket.packet_key in response',
      agent: 'ACE context packet.packet_key unchanged',
    },
    evidence_gates: [
      'packet_key immutability across storage (Postgres → Qdrant → Redis → HyperRAG → Agent)',
      'content_hash matches original file (no mutation)',
      'no unresolved state silently converted to RESOLVED',
      'feature routing fields (som_cluster, kmeans_cluster) maintain routing/topology semantics only',
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

  // Exit code based on completeness
  const wiredLanes = Object.values(results.lane_audits).filter(a => a.status === 'WIRED').length;
  const totalLanes = Object.keys(results.lane_audits).length;
  const completeness = (wiredLanes / totalLanes) * 100;

  console.log(`\n🎯 Overall Completeness: ${completeness.toFixed(1)}% (${wiredLanes}/${totalLanes} lanes wired)`);

  process.exit(completeness >= 75 ? 0 : 1);
}

main().catch(err => {
  console.error('❌ Reconciliation audit failed:', err.message);
  process.exit(1);
});
