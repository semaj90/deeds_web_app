#!/usr/bin/env node
/**
 * scripts/atlas/phase1-harden-identity-ledger.mjs
 *
 * Phase 1: Harden the identity ledger by adding:
 * - Overlap matrix (which Postgres tables provide evidence)
 * - Match counts (packet_key, atlas_qdrant_id, chunk_qdrant_id, source_ref)
 * - Cardinality (point-to-packet, packet-to-point)
 * - Conflict detection (existing_backlink_conflict)
 * - Mutation eligibility decision
 *
 * Input: Qdrant codebase_chunks_768 (52,984 classified points only)
 * Output: /tmp/ledger-hardened-phase1.ndjson with enhanced metadata
 */

import fetch from 'node-fetch';
import * as fs from 'fs';
import { createWriteStream } from 'fs';
import pg from 'pg';

const { Pool } = pg;

const QDRANT_URL = 'http://127.0.0.1:6333';
const COLLECTION = 'codebase_chunks_768';
const RUN_ID = 'identity_audit_20260726';

const VALID_ARTIFACT_KINDS = new Set([
  'source_module',
  'documentation_page',
  'config_file',
  'agent_card',
  'native_source',
  'migration_script',
  'test_file',
  'type_declaration',
  'shader_source',
  'schema_contract',
  'proto_file',
]);

// Postgres connection from Docker container (host.docker.internal not needed from WSL Windows host)
const pgPool = new Pool({
  host: '127.0.0.1',
  port: 5434,
  user: 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
  database: 'legal_ai_db',
  // Disable SSL for local Docker
  ssl: false,
});

// Track statistics
let stats = {
  total_points: 0,
  classified_points: 0,
  skipped_directory_cluster: 0,
  packet_key_found: 0,
  atlas_qdrant_id_found: 0,
  chunk_qdrant_id_found: 0,
  source_ref_found: 0,
  cross_evidence_agrees: 0,
  cardinality_1_1: 0,
  backlink_conflict: 0,
  mutation_eligible: 0,
  errors: 0,
};

/**
 * Query Postgres to find matches for a given Qdrant point.
 * Returns overlap evidence.
 */
async function findPostgresMatches(qdrantPointId, payloadPacketKey, payloadSourceRef) {
  const evidence = {
    packet_key_matches: [],
    atlas_qdrant_id_matches: [],
    chunk_qdrant_id_matches: [],
    source_ref_matches: [],
  };

  try {
    // 1. Check atlas_packets by packet_key
    if (payloadPacketKey) {
      const res = await pgPool.query(
        'SELECT id, packet_key, qdrant_point_id, source_ref FROM atlas_packets WHERE packet_key = $1 LIMIT 10',
        [payloadPacketKey]
      );
      evidence.packet_key_matches = res.rows;
    }

    // 2. Check atlas_packets by qdrant_point_id
    const res2 = await pgPool.query(
      'SELECT id, packet_key, qdrant_point_id, source_ref FROM atlas_packets WHERE qdrant_point_id = $1 LIMIT 10',
      [qdrantPointId]
    );
    evidence.atlas_qdrant_id_matches = res2.rows;

    // 3. Check codebase_chunk_index by qdrant_id
    const res3 = await pgPool.query(
      'SELECT id, qdrant_id, source_ref FROM codebase_chunk_index WHERE qdrant_id = $1 LIMIT 10',
      [qdrantPointId]
    );
    evidence.chunk_qdrant_id_matches = res3.rows;

    // 4. Check atlas_packets by source_ref
    if (payloadSourceRef) {
      const res4 = await pgPool.query(
        'SELECT id, packet_key, qdrant_point_id, source_ref FROM atlas_packets WHERE source_ref = $1 LIMIT 10',
        [payloadSourceRef]
      );
      evidence.source_ref_matches = res4.rows;
    }
  } catch (err) {
    console.error(`[error] Postgres query failed for point ${qdrantPointId}:`, err.message);
    stats.errors++;
  }

  return evidence;
}

/**
 * Determine if evidence cross-agrees and cardinality is 1:1.
 */
function analyzeEvidence(evidence, qdrantPointId, payloadPacketKey) {
  const analysis = {
    packet_key_match_count: evidence.packet_key_matches.length,
    atlas_qdrant_id_match_count: evidence.atlas_qdrant_id_matches.length,
    chunk_qdrant_id_match_count: evidence.chunk_qdrant_id_matches.length,
    source_ref_match_count: evidence.source_ref_matches.length,
    resolved_packet_key: null,
    resolved_source_ref: null,
    cross_evidence_agrees: false,
    point_to_packet_cardinality: null,
    packet_to_point_cardinality: null,
    existing_backlink_conflict: false,
    conflict_reason: null,
  };

  // Resolve canonical values
  if (evidence.packet_key_matches.length > 0) {
    analysis.resolved_packet_key = evidence.packet_key_matches[0].packet_key;
    analysis.resolved_source_ref = evidence.packet_key_matches[0].source_ref;
  }

  if (evidence.atlas_qdrant_id_matches.length > 0) {
    analysis.resolved_packet_key ||= evidence.atlas_qdrant_id_matches[0].packet_key;
    analysis.resolved_source_ref ||= evidence.atlas_qdrant_id_matches[0].source_ref;
  }

  // Check point-to-packet cardinality (does this Qdrant point map to exactly 1 packet?)
  const pointMappers = [
    evidence.packet_key_matches.length,
    evidence.atlas_qdrant_id_matches.length,
    evidence.chunk_qdrant_id_matches.length,
  ];
  const uniquePackets = new Set([
    ...evidence.packet_key_matches.map((m) => m.id || m.packet_key),
    ...evidence.atlas_qdrant_id_matches.map((m) => m.id || m.packet_key),
    ...evidence.chunk_qdrant_id_matches.map((m) => m.id),
  ]).size;

  analysis.point_to_packet_cardinality = uniquePackets === 0 ? 0 : uniquePackets === 1 ? 1 : 2;

  // Check packet-to-point cardinality (does the resolved packet point back to this Qdrant point?)
  if (analysis.resolved_packet_key && evidence.packet_key_matches.length === 1) {
    const packet = evidence.packet_key_matches[0];
    if (packet.qdrant_point_id === qdrantPointId) {
      analysis.packet_to_point_cardinality = 1;
    } else if (packet.qdrant_point_id === null) {
      analysis.packet_to_point_cardinality = 0; // No backlink yet
    } else {
      analysis.packet_to_point_cardinality = 2; // Points to different Qdrant point
      analysis.existing_backlink_conflict = true;
      analysis.conflict_reason = `atlas_packets.qdrant_point_id=${packet.qdrant_point_id} != ${qdrantPointId}`;
    }
  }

  // Determine cross-evidence agreement
  // Agreement: all available evidence types resolve to the same packet
  const hasAgreement =
    analysis.packet_key_match_count > 0 &&
    analysis.atlas_qdrant_id_match_count <= 1 &&
    analysis.chunk_qdrant_id_match_count <= 1 &&
    (analysis.packet_to_packet_cardinality === 1 || analysis.packet_to_packet_cardinality === 0);

  analysis.cross_evidence_agrees = hasAgreement;

  return analysis;
}

/**
 * Determine if a point is eligible for backfill mutation.
 */
function decideMutationEligibility(analysis) {
  return (
    analysis.cross_evidence_agrees &&
    analysis.point_to_packet_cardinality === 1 &&
    (analysis.packet_to_point_cardinality === 0 || analysis.packet_to_point_cardinality === 1) &&
    !analysis.existing_backlink_conflict
  );
}

async function hardenenLedger() {
  const outputPath = '/tmp/ledger-hardened-phase1.ndjson';
  const outputStream = createWriteStream(outputPath, { flags: 'w' });

  console.log(`[phase1] Hardening ledger for Phase 1 analysis...`);
  console.log(`[phase1] Input: ${COLLECTION} (52,984 classified points)`);
  console.log(`[phase1] Output: ${outputPath}`);

  let offset = 0;
  let processedThisBatch = 0;

  do {
    const body = {
      limit: 100,
      with_payload: [
        'packet_key',
        'source_ref',
        'kind',
        'artifact_kind',
        'packet_kind',
        'ledger_type',
      ],
      with_vector: false,
    };

    if (offset !== undefined && offset !== null) {
      body.offset = offset;
    }

    let response;
    try {
      response = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
    } catch (err) {
      console.error(`[error] Qdrant scroll failed:`, err.message);
      process.exit(1);
    }

    const result = await response.json();
    processedThisBatch = 0;

    if (!result.result || !Array.isArray(result.result.points)) {
      console.error(`[error] Unexpected response shape`);
      process.exit(1);
    }

    for (const point of result.result.points) {
      stats.total_points++;

      const kind = point.payload?.kind;
      const artifactKind = point.payload?.artifact_kind;

      // Skip directory-cluster points (no packet_key, not eligible)
      if (kind === 'directory-cluster') {
        stats.skipped_directory_cluster++;
        continue;
      }

      stats.classified_points++;

      const qdrantPointId = point.id;
      const payloadPacketKey = point.payload?.packet_key;
      const payloadSourceRef = point.payload?.source_ref;

      // Query Postgres
      const evidence = await findPostgresMatches(qdrantPointId, payloadPacketKey, payloadSourceRef);

      // Analyze evidence
      const analysis = analyzeEvidence(evidence, qdrantPointId, payloadPacketKey);

      // Track stats
      if (analysis.packet_key_match_count > 0) stats.packet_key_found++;
      if (analysis.atlas_qdrant_id_match_count > 0) stats.atlas_qdrant_id_found++;
      if (analysis.chunk_qdrant_id_match_count > 0) stats.chunk_qdrant_id_found++;
      if (analysis.source_ref_match_count > 0) stats.source_ref_found++;
      if (analysis.cross_evidence_agrees) stats.cross_evidence_agrees++;
      if (analysis.point_to_packet_cardinality === 1 && analysis.packet_to_point_cardinality === 1) {
        stats.cardinality_1_1++;
      }
      if (analysis.existing_backlink_conflict) stats.backlink_conflict++;

      // Decide mutation eligibility
      const mutationEligible = decideMutationEligibility(analysis);
      if (mutationEligible) stats.mutation_eligible++;

      // Build hardened entry
      const hardenedEntry = {
        run_id: RUN_ID,
        collection: COLLECTION,
        qdrant_point_id: qdrantPointId,
        id_type: typeof point.id === 'string' ? 'uuid' : 'uint64',
        payload_packet_key: payloadPacketKey,
        payload_source_ref: payloadSourceRef,
        payload_kind: kind,
        payload_artifact_kind: artifactKind,
        ...analysis,
        mutation_eligible: mutationEligible,
      };

      // Write NDJSON
      outputStream.write(JSON.stringify(hardenedEntry) + '\n');
      processedThisBatch++;
    }

    offset = result.result.next_page_offset;

    if (stats.total_points % 5000 === 0) {
      console.log(
        `  [progress] Scanned ${stats.total_points} points. Classified: ${stats.classified_points}, Cross-evidence: ${stats.cross_evidence_agrees}, Eligible: ${stats.mutation_eligible}`
      );
    }
  } while (offset !== null && offset !== undefined);

  outputStream.end();

  // Wait for stream to finish
  await new Promise((resolve) => outputStream.on('finish', resolve));

  console.log(`\n[complete] Ledger hardening finished.`);
  console.log(`\n[statistics]`);
  console.log(`  Total points scanned:           ${stats.total_points}`);
  console.log(`  Directory-cluster (skipped):    ${stats.skipped_directory_cluster}`);
  console.log(`  Classified points processed:    ${stats.classified_points}`);
  console.log(`  Packet-key found:               ${stats.packet_key_found} (${((stats.packet_key_found / stats.classified_points) * 100).toFixed(2)}%)`);
  console.log(`  Atlas qdrant_id found:          ${stats.atlas_qdrant_id_found} (${((stats.atlas_qdrant_id_found / stats.classified_points) * 100).toFixed(2)}%)`);
  console.log(`  Chunk qdrant_id found:          ${stats.chunk_qdrant_id_found} (${((stats.chunk_qdrant_id_found / stats.classified_points) * 100).toFixed(2)}%)`);
  console.log(`  Source-ref found:               ${stats.source_ref_found} (${((stats.source_ref_found / stats.classified_points) * 100).toFixed(2)}%)`);
  console.log(`  Cross-evidence agrees:          ${stats.cross_evidence_agrees} (${((stats.cross_evidence_agrees / stats.classified_points) * 100).toFixed(2)}%)`);
  console.log(`  Cardinality 1:1:                ${stats.cardinality_1_1} (${((stats.cardinality_1_1 / stats.classified_points) * 100).toFixed(2)}%)`);
  console.log(`  Existing backlink conflicts:    ${stats.backlink_conflict}`);
  console.log(`  Mutation-eligible rows:         ${stats.mutation_eligible} (${((stats.mutation_eligible / stats.classified_points) * 100).toFixed(2)}%)`);
  console.log(`  Query errors:                   ${stats.errors}`);

  console.log(`\n[output] ${outputPath}`);

  await pgPool.end();
}

hardenenLedger().catch((err) => {
  console.error(`[fatal]`, err);
  process.exit(1);
});
