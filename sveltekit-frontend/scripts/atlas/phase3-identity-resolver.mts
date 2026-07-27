#!/usr/bin/env node

/**
 * Phase 3 Step 9: Identity Resolver
 *
 * Resolves tree_node_id, source_ref, content_hash combinations from the control snapshot.
 * Marks result states: RESOLVED, FEATURE_ID_MISSING, TREE_NODE_ID_MISSING, SOURCE_HASH_MISMATCH, AMBIGUOUS_JOIN.
 *
 * Inputs:
 * - control-snapshot-1k/snapshot.ndjson (1,000 packets)
 * - control-snapshot-1k/observations.ndjson (4,900 observations)
 * - Postgres atlas_packets table (source of truth)
 * - Postgres codebase_chunk_index table (chunk identity)
 *
 * Outputs:
 * - identity-resolution-results.ndjson (1,000 packets with resolved states)
 * - identity-resolution-audit.json (gate validation report)
 *
 * Exit codes:
 * 0 = resolution complete, all gates pass
 * 1 = database connection failed
 * 2 = snapshot file not found
 * 3 = resolution validation gate failed
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import crypto from 'crypto';
import { Pool } from 'pg';
import { z } from 'zod';

// ============================================================================
// Zod Schemas for Identity Resolution
// ============================================================================

const ResolutionStateEnum = z.enum([
  'RESOLVED',
  'FEATURE_ID_MISSING',
  'TREE_NODE_ID_MISSING',
  'SOURCE_HASH_MISMATCH',
  'AMBIGUOUS_JOIN',
]);

const IdentityResolutionSchema = z.object({
  packet_key: z.string().regex(/^ace:packet:[a-z0-9_-]+$/),
  feature_id: z.string().optional(),
  tree_node_id: z.string().optional(),
  source_ref: z.string().optional(),
  content_hash: z.string().optional(),
  resolution_state: ResolutionStateEnum,
  postgres_packet_id: z.string().optional(),
  postgres_chunk_id: z.string().optional(),
  confidence: z.number().min(0).max(1),
  resolution_details: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.string().datetime(),
});

type ResolutionState = z.infer<typeof ResolutionStateEnum>;
type IdentityResolution = z.infer<typeof IdentityResolutionSchema>;

const ResolutionAuditGateSchema = z.object({
  gate_name: z.string(),
  gate_type: z.enum(['identity_resolution', 'consistency_check', 'data_quality']),
  check: z.string(),
  result: z.enum(['PASS', 'FAIL']),
  details: z.string(),
  resolution_count: z.number().optional(),
  failure_rate: z.number().optional(),
});

type ResolutionAuditGate = z.infer<typeof ResolutionAuditGateSchema>;

// ============================================================================
// Identity Resolution Engine
// ============================================================================

interface PacketIdentity {
  packet_key: string;
  feature_id?: string;
  tree_node_id?: string;
  source_ref?: string;
  content_hash?: string;
}

interface PostgresPacketRow {
  packet_key: string;
  feature_id?: string;
  source_ref?: string;
}

interface PostgresChunkRow {
  chunk_id: string;
  feature_id?: string;
  source_ref?: string;
  content_hash?: string;
  tree_node_id?: string;
}

async function loadSnapshotPackets(snapshotPath: string): Promise<PacketIdentity[]> {
  const packets: PacketIdentity[] = [];
  const fileStream = createReadStream(snapshotPath);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const packet = JSON.parse(line) as Record<string, any>;
      packets.push({
        packet_key: packet.packet_key,
        feature_id: packet.feature_id,
        tree_node_id: packet.tree_node_id,
        source_ref: packet.source_ref,
        content_hash: packet.content_hash,
      });
    } catch (err) {
      console.error(`Failed to parse packet line: ${line.slice(0, 100)}...`, err);
    }
  }

  return packets;
}

async function queryPostgresPackets(
  pool: Pool,
  packetKeys: string[]
): Promise<Map<string, PostgresPacketRow>> {
  const result = new Map<string, PostgresPacketRow>();

  if (packetKeys.length === 0) return result;

  const placeholders = packetKeys.map((_, i) => `$${i + 1}`).join(',');
  const query = `
    SELECT
      packet_key,
      feature_id,
      source_ref
    FROM atlas_packets
    WHERE packet_key = ANY($1::text[])
  `;

  try {
    const pgResult = await pool.query(query, [packetKeys]);
    for (const row of pgResult.rows) {
      result.set(row.packet_key, {
        packet_key: row.packet_key,
        feature_id: row.feature_id || undefined,
        source_ref: row.source_ref || undefined,
      });
    }
  } catch (err) {
    console.error('Query postgres packets failed:', err);
  }

  return result;
}

async function queryPostgresChunks(
  pool: Pool,
  sourceRefs: string[]
): Promise<Map<string, PostgresChunkRow[]>> {
  const result = new Map<string, PostgresChunkRow[]>();

  if (sourceRefs.length === 0) return result;

  const query = `
    SELECT
      chunk_id,
      feature_id,
      source_ref,
      content_hash,
      tree_node_id
    FROM codebase_chunk_index
    WHERE source_ref = ANY($1::text[])
    ORDER BY source_ref, chunk_id
  `;

  try {
    const pgResult = await pool.query(query, [sourceRefs]);
    for (const row of pgResult.rows) {
      const key = row.source_ref;
      if (!result.has(key)) {
        result.set(key, []);
      }
      result.get(key)!.push({
        chunk_id: row.chunk_id,
        feature_id: row.feature_id || undefined,
        source_ref: row.source_ref || undefined,
        content_hash: row.content_hash || undefined,
        tree_node_id: row.tree_node_id || undefined,
      });
    }
  } catch (err) {
    console.error('Query postgres chunks failed:', err);
  }

  return result;
}

function resolvePacketIdentity(
  packet: PacketIdentity,
  postgresPacket: PostgresPacketRow | undefined,
  postgresChunks: PostgresChunkRow[] | undefined
): IdentityResolution {
  const now = new Date().toISOString();
  let state: ResolutionState = 'RESOLVED';
  let confidence = 1.0;
  const details: Record<string, unknown> = {};

  // Check feature_id
  if (!packet.feature_id && (!postgresPacket || !postgresPacket.feature_id)) {
    state = 'FEATURE_ID_MISSING';
    confidence = 0.0;
    details.feature_id_error = 'No feature_id in packet or postgres';
  }

  // Check tree_node_id
  if (!packet.tree_node_id) {
    if (state === 'RESOLVED') {
      state = 'TREE_NODE_ID_MISSING';
      confidence = 0.5;
    }
    details.tree_node_id_error = 'No tree_node_id in packet';
  } else if (postgresChunks && postgresChunks.length > 0) {
    const matchingChunk = postgresChunks.find(c => c.tree_node_id === packet.tree_node_id);
    if (!matchingChunk) {
      if (state === 'RESOLVED') {
        state = 'TREE_NODE_ID_MISSING';
        confidence = 0.5;
      }
      details.tree_node_id_error = `No matching tree_node_id in chunks for source_ref`;
    } else {
      details.matched_chunk_id = matchingChunk.chunk_id;
    }
  }

  // Check source_ref vs source_hash
  if (packet.source_ref) {
    if (postgresPacket?.source_ref && postgresPacket.source_ref !== packet.source_ref) {
      state = 'SOURCE_HASH_MISMATCH';
      confidence = 0.0;
      details.source_ref_mismatch = {
        packet_source_ref: packet.source_ref,
        postgres_source_ref: postgresPacket.source_ref,
      };
    }
  }

  // Check for ambiguous joins (multiple chunks match)
  if (postgresChunks && postgresChunks.length > 1) {
    const matchingChunks = postgresChunks.filter(
      c =>
        (!packet.content_hash || c.content_hash === packet.content_hash) &&
        (!packet.tree_node_id || c.tree_node_id === packet.tree_node_id)
    );
    if (matchingChunks.length > 1) {
      state = 'AMBIGUOUS_JOIN';
      confidence = 1.0 / matchingChunks.length;
      details.ambiguous_chunks = matchingChunks.map(c => ({
        chunk_id: c.chunk_id,
        tree_node_id: c.tree_node_id,
      }));
    }
  }

  return {
    packet_key: packet.packet_key,
    feature_id: packet.feature_id,
    tree_node_id: packet.tree_node_id,
    source_ref: packet.source_ref,
    content_hash: packet.content_hash,
    resolution_state: state,
    postgres_packet_id: postgresPacket?.packet_key,
    postgres_chunk_id:
      postgresChunks && postgresChunks.length > 0 ? postgresChunks[0].chunk_id : undefined,
    confidence,
    resolution_details: Object.keys(details).length > 0 ? details : undefined,
    timestamp: now,
  };
}

// ============================================================================
// Validation Gates
// ============================================================================

async function runResolutionGates(resolutions: IdentityResolution[]): Promise<ResolutionAuditGate[]> {
  const gates: ResolutionAuditGate[] = [];

  // Gate 1: Resolution Coverage
  const resolvedCount = resolutions.filter(r => r.resolution_state === 'RESOLVED').length;
  const resolutionRate = resolutions.length > 0 ? resolvedCount / resolutions.length : 0;
  gates.push({
    gate_name: 'Resolution Coverage',
    gate_type: 'identity_resolution',
    check: `At least 80% of packets resolved (${(resolutionRate * 100).toFixed(1)}% actual)`,
    result: resolutionRate >= 0.8 ? 'PASS' : 'FAIL',
    details: `${resolvedCount}/${resolutions.length} packets resolved`,
    resolution_count: resolvedCount,
    failure_rate: 1.0 - resolutionRate,
  });

  // Gate 2: Confidence Distribution
  const avgConfidence =
    resolutions.reduce((sum, r) => sum + r.confidence, 0) / resolutions.length;
  gates.push({
    gate_name: 'Confidence Distribution',
    gate_type: 'data_quality',
    check: `Average confidence ≥ 0.7 (${avgConfidence.toFixed(2)} actual)`,
    result: avgConfidence >= 0.7 ? 'PASS' : 'FAIL',
    details: `Avg confidence: ${avgConfidence.toFixed(3)}`,
  });

  // Gate 3: Mismatch Consistency
  const mismatchCount = resolutions.filter(r => r.resolution_state === 'SOURCE_HASH_MISMATCH')
    .length;
  const mismatchRate = resolutions.length > 0 ? mismatchCount / resolutions.length : 0;
  gates.push({
    gate_name: 'Source Hash Consistency',
    gate_type: 'consistency_check',
    check: `Less than 5% source hash mismatches (${(mismatchRate * 100).toFixed(1)}% actual)`,
    result: mismatchRate < 0.05 ? 'PASS' : 'FAIL',
    details: `${mismatchCount} mismatches found`,
  });

  // Gate 4: Ambiguity Rate
  const ambiguousCount = resolutions.filter(r => r.resolution_state === 'AMBIGUOUS_JOIN').length;
  const ambiguityRate = resolutions.length > 0 ? ambiguousCount / resolutions.length : 0;
  gates.push({
    gate_name: 'Ambiguity Rate',
    gate_type: 'data_quality',
    check: `Less than 2% ambiguous joins (${(ambiguityRate * 100).toFixed(1)}% actual)`,
    result: ambiguityRate < 0.02 ? 'PASS' : 'FAIL',
    details: `${ambiguousCount} ambiguous joins found`,
  });

  // Gate 5: Overall Gate Pass/Fail
  const allGatesPassed = gates.slice(0, 4).every(g => g.result === 'PASS');
  gates.push({
    gate_name: 'Phase 3 Step 9 Identity Resolution Complete',
    gate_type: 'identity_resolution',
    check: 'All identity resolution gates pass',
    result: allGatesPassed ? 'PASS' : 'FAIL',
    details: `${gates.filter(g => g.result === 'PASS').length}/4 gates passed`,
  });

  return gates;
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log('Phase 3 Step 9: Identity Resolver');
  console.log('==================================\n');

  // Connect to PostgreSQL
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5434'),
    database: process.env.POSTGRES_DB || 'legal_ai_db',
    user: process.env.POSTGRES_USER || 'legal_admin',
    password: process.env.POSTGRES_PASSWORD || '123456',
  });

  try {
    // Step 1: Load snapshot packets
    console.log('Step 1: Loading snapshot packets...');
    const snapshotPath = resolve(
      process.cwd(),
      'scripts/atlas/control-snapshot-1k/snapshot.ndjson'
    );
    const packets = await loadSnapshotPackets(snapshotPath);
    console.log(`✓ Loaded ${packets.length} packets from snapshot\n`);

    // Step 2: Query Postgres for packet identities
    console.log('Step 2: Querying Postgres atlas_packets table...');
    const packetKeys = packets.map(p => p.packet_key);
    const postgresPackets = await queryPostgresPackets(pool, packetKeys);
    console.log(`✓ Found ${postgresPackets.size} packets in Postgres\n`);

    // Step 3: Query Postgres for chunk identities
    console.log('Step 3: Querying Postgres codebase_chunk_index table...');
    const sourceRefs = Array.from(
      new Set(packets.map(p => p.source_ref).filter(Boolean) as string[])
    );
    const postgresChunks = await queryPostgresChunks(pool, sourceRefs);
    console.log(`✓ Found ${postgresChunks.size} source_ref entries with chunks\n`);

    // Step 4: Resolve identities
    console.log('Step 4: Resolving packet identities...');
    const resolutions: IdentityResolution[] = [];
    for (const packet of packets) {
      const pgPacket = postgresPackets.get(packet.packet_key);
      const pgChunks = packet.source_ref ? postgresChunks.get(packet.source_ref) : undefined;
      const resolution = resolvePacketIdentity(packet, pgPacket, pgChunks);
      resolutions.push(resolution);
    }
    console.log(`✓ Resolved ${resolutions.length} packet identities\n`);

    // Step 5: Validate with gates
    console.log('Step 5: Running validation gates...');
    const gates = await runResolutionGates(resolutions);
    for (const gate of gates) {
      const status = gate.result === 'PASS' ? '✓' : '✗';
      console.log(`${status} ${gate.gate_name}: ${gate.details}`);
    }
    console.log();

    // Step 6: Export results
    console.log('Step 6: Exporting results...');
    mkdirSync('scripts/atlas/identity-resolution-results', { recursive: true });

    const resultsPath = resolve(process.cwd(), 'scripts/atlas/identity-resolution-results/results.ndjson');
    const resultsStream = writeFileSync(resultsPath, '');
    for (const resolution of resolutions) {
      const validated = IdentityResolutionSchema.parse(resolution);
      writeFileSync(resultsPath, JSON.stringify(validated) + '\n', { flag: 'a' });
    }
    console.log(`✓ Exported ${resolutions.length} resolutions to ${resultsPath}`);

    const auditPath = resolve(process.cwd(), 'scripts/atlas/identity-resolution-results/audit.json');
    writeFileSync(auditPath, JSON.stringify({ gates, timestamp: new Date().toISOString() }, null, 2));
    console.log(`✓ Exported audit report to ${auditPath}\n`);

    // Summary
    const resolvedCount = resolutions.filter(r => r.resolution_state === 'RESOLVED').length;
    const failureRate = 1 - (resolvedCount / resolutions.length || 0);
    console.log('Summary');
    console.log('-------');
    console.log(`Packets analyzed: ${resolutions.length}`);
    console.log(`Packets resolved: ${resolvedCount} (${((resolvedCount / resolutions.length) * 100).toFixed(1)}%)`);
    console.log(
      `Resolution states:`,
      Object.entries(
        resolutions.reduce(
          (acc, r) => {
            acc[r.resolution_state] = (acc[r.resolution_state] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        )
      )
        .map(([state, count]) => `${state}=${count}`)
        .join(', ')
    );

    // Exit code
    const allGatesPassed = gates.every(g => g.result === 'PASS');
    process.exit(allGatesPassed ? 0 : 3);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
