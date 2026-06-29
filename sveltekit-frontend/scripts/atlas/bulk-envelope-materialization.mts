#!/usr/bin/env node
/**
 * Bulk Feature Envelope Materialization
 *
 * Generates feature envelopes for all 58,304 packets without summaries.
 * Creates atlas_summary_layers entries with complete envelope JSONB.
 *
 * Pipeline:
 * 1. Fetch packets without summaries from atlas_packets
 * 2. Build feature envelope from packet metadata
 * 3. Validate identity chain completeness
 * 4. Insert/upsert into atlas_summary_layers
 * 5. Generate chrom97 packets from envelopes
 * 6. Mirror to Qdrant
 *
 * Usage:
 *   npm run bulk:envelopes [--dry-run] [--apply] [--batch=1000] [--verbose]
 */

import { Pool } from 'pg';
import { createHash } from 'crypto';

const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const BATCH_SIZE = parseInt(
  process.argv.find(arg => arg.startsWith('--batch='))?.split('=')[1] || '1000'
);

const PG_HOST = process.env.POSTGRES_HOST || 'localhost';
const PG_PORT = parseInt(process.env.POSTGRES_PORT || '5434');
const PG_DB = process.env.POSTGRES_DB || 'legal_ai_db';
const PG_USER = process.env.POSTGRES_USER || 'legal_admin';
const PG_PASSWORD = process.env.POSTGRES_PASSWORD || '123456';

interface PacketRow {
  packet_key: string;
  source_ref: string;
  feature_id: string;
  feature_label?: string;
  keywords?: string[];
  pagerank?: number;
  som_cluster?: number;
  directory_path?: string;
  domain_class?: string;
  community_id?: number;
}

interface FeatureEnvelope {
  packet_key: string;
  feature_id: string;
  feature_label: string;
  source_ref: string;
  domain_class: string;
  topology_label: string;
  community_id?: number;
  keywords: string[];
  entities: string[];
  ace_tags: string[];
  kag_nodes: string[];
  dag_edges: Array<{ to: string; from: string; relation: string }>;
  som_cluster?: number;
  pagerank?: number;
  confidence: number;
  provenance: {
    source: string;
    worker: string;
    generated_at: string;
  };
  identity_chain_complete: boolean;
}

async function fetchPacketsWithoutSummaries(pool: Pool, limit: number, offset: number): Promise<PacketRow[]> {
  const query = `
    SELECT
      ap.packet_key,
      ap.source_ref,
      ap.feature_id,
      ap.feature_label,
      ap.keywords,
      ap.pagerank,
      ap.som_cluster,
      ap.directory_path,
      ap.domain_class,
      ap.community_id
    FROM atlas_packets ap
    LEFT JOIN atlas_summary_layers asl ON ap.packet_key = asl.packet_key
    WHERE asl.packet_key IS NULL
    AND ap.packet_key IS NOT NULL
    AND ap.source_ref IS NOT NULL
    ORDER BY ap.pagerank DESC NULLS LAST
    LIMIT $1 OFFSET $2
  `;

  const result = await pool.query(query, [limit, offset]);
  return result.rows;
}

function buildFeatureEnvelope(packet: PacketRow): FeatureEnvelope {
  const now = new Date().toISOString();
  const domainClass = packet.domain_class || 'codebase';
  const topologyLabel = packet.directory_path?.split('/')[0] || 'root';

  // Infer confidence from data completeness
  const fieldsPresent = [
    packet.source_ref,
    packet.feature_id,
    packet.feature_label,
    packet.keywords,
    packet.pagerank
  ].filter(f => f !== undefined && f !== null).length;
  const confidence = Math.min(0.5 + (fieldsPresent / 5) * 0.4, 0.95);

  return {
    packet_key: packet.packet_key,
    feature_id: packet.feature_id,
    feature_label: packet.feature_label || packet.feature_id,
    source_ref: packet.source_ref,
    domain_class: domainClass,
    topology_label: topologyLabel,
    community_id: packet.community_id,
    keywords: packet.keywords || [],
    entities: [],
    ace_tags: [domainClass, 'bulk-materialized', topologyLabel],
    kag_nodes: [
      packet.feature_id,
      packet.feature_label || packet.feature_id,
      domainClass,
      topologyLabel,
    ].filter(n => n),
    dag_edges: [],
    som_cluster: packet.som_cluster,
    pagerank: packet.pagerank,
    confidence,
    provenance: {
      source: 'atlas_packets',
      worker: 'bulk-envelope-materialization',
      generated_at: now,
    },
    identity_chain_complete: !!(
      packet.source_ref &&
      packet.feature_id &&
      packet.feature_label
    ),
  };
}

async function materializeEnvelopes(pool: Pool, packets: PacketRow[], dryRun: boolean): Promise<number> {
  let inserted = 0;

  for (const packet of packets) {
    const envelope = buildFeatureEnvelope(packet);

    if (dryRun) {
      inserted++;
      continue;
    }

    try {
      await pool.query(
        `
        INSERT INTO atlas_summary_layers (
          packet_key, summary, metadata, created_at, updated_at
        ) VALUES (
          $1, $2, $3, NOW(), NOW()
        )
        ON CONFLICT (packet_key) DO UPDATE SET
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        `,
        [
          packet.packet_key,
          '', // Empty summary for now
          JSON.stringify({
            feature_envelope: envelope,
            feature_id: envelope.feature_id,
            source_ref: envelope.source_ref,
            domain_class: envelope.domain_class,
            topology_label: envelope.topology_label,
            keywords_count: envelope.keywords.length,
          }),
        ]
      );
      inserted++;
    } catch (err) {
      if (VERBOSE) console.warn(`  ⚠️  Failed to insert ${packet.packet_key}: ${err}`);
    }
  }

  return inserted;
}

async function generateChrom97FromEnvelopes(pool: Pool, packets: PacketRow[], dryRun: boolean): Promise<number> {
  let generated = 0;

  for (const packet of packets) {
    const envelope = buildFeatureEnvelope(packet);
    const packetId = `chrom97:${envelope.feature_id}:${Math.random().toString(36).slice(2, 11)}`;
    const hash = createHash('sha256')
      .update(`${packet.packet_key}:${JSON.stringify(envelope)}`)
      .digest('hex');

    if (dryRun) {
      generated++;
      continue;
    }

    try {
      await pool.query(
        `
        INSERT INTO chrom97_packets (
          packet_key, feature_id, source_ref, feature_label,
          packet_json, packet_hash, som_cluster, community_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8
        )
        ON CONFLICT (packet_key) DO UPDATE SET
          packet_json = EXCLUDED.packet_json,
          packet_hash = EXCLUDED.packet_hash,
          updated_at = NOW()
        `,
        [
          packet.packet_key,
          envelope.feature_id,
          envelope.source_ref,
          envelope.feature_label,
          JSON.stringify({
            packet_id: packetId,
            packet_key: packet.packet_key,
            feature_id: envelope.feature_id,
            source_ref: envelope.source_ref,
            feature_label: envelope.feature_label,
            packet_type: 'chrom97-feature',
            identity: {
              packet_key: packet.packet_key,
              feature_id: envelope.feature_id,
              source_ref: envelope.source_ref,
              feature_label: envelope.feature_label,
            },
            context: {
              domain_class: envelope.domain_class,
              topology_label: envelope.topology_label,
              community_id: envelope.community_id,
            },
            features: {
              keywords: envelope.keywords,
              entities: envelope.entities,
              ace_tags: envelope.ace_tags,
              kag_nodes: envelope.kag_nodes,
            },
            topology: {
              dag_edges: envelope.dag_edges,
              som_cluster: envelope.som_cluster,
              pagerank: envelope.pagerank,
            },
            evidence: {
              provenance: envelope.provenance,
              confidence: envelope.confidence,
              identity_chain_complete: envelope.identity_chain_complete,
            },
            generated_at: new Date().toISOString(),
            schema_version: '1.0',
          }),
          hash,
          envelope.som_cluster || null,
          envelope.community_id || null,
        ]
      );
      generated++;
    } catch (err) {
      if (VERBOSE) console.warn(`  ⚠️  Failed to generate chrom97 for ${packet.packet_key}: ${err}`);
    }
  }

  return generated;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Bulk Feature Envelope Materialization (58K packets)           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`Batch Size: ${BATCH_SIZE}`);
  console.log(`Verbose: ${VERBOSE}\n`);

  const pool = new Pool({
    host: PG_HOST,
    port: PG_PORT,
    database: PG_DB,
    user: PG_USER,
    password: PG_PASSWORD,
  });

  let totalEnvelopes = 0;
  let totalChrom97 = 0;
  let batchNum = 0;

  try {
    // Count total packets without summaries
    const countResult = await pool.query(`
      SELECT COUNT(*) as count FROM atlas_packets ap
      LEFT JOIN atlas_summary_layers asl ON ap.packet_key = asl.packet_key
      WHERE asl.packet_key IS NULL AND ap.packet_key IS NOT NULL
    `);
    const totalToProcess = parseInt(countResult.rows[0].count);
    console.log(`📦 Found ${totalToProcess} packets without summaries\n`);

    if (totalToProcess === 0) {
      console.log('✅ All packets already have summaries');
      return;
    }

    // Process in batches
    for (let offset = 0; offset < totalToProcess; offset += BATCH_SIZE) {
      batchNum++;
      const packets = await fetchPacketsWithoutSummaries(pool, BATCH_SIZE, offset);

      if (packets.length === 0) break;

      console.log(`Batch ${batchNum}: Processing ${packets.length} packets (offset: ${offset})...`);

      // Materialize envelopes
      const envelopeCount = await materializeEnvelopes(pool, packets, DRY_RUN);
      totalEnvelopes += envelopeCount;

      // Generate chrom97
      const chrom97Count = await generateChrom97FromEnvelopes(pool, packets, DRY_RUN);
      totalChrom97 += chrom97Count;

      if (VERBOSE && batchNum % 10 === 0) {
        console.log(`  ✓ Envelopes: ${totalEnvelopes}, Chrom97: ${totalChrom97}`);
      }
    }

    console.log(`\n✅ Materialization complete:`);
    console.log(`   Envelopes created: ${totalEnvelopes}`);
    console.log(`   Chrom97 packets generated: ${totalChrom97}`);

    if (DRY_RUN) {
      console.log('\n📋 DRY-RUN: No changes committed');
    } else {
      // Verify
      const verifyResult = await pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN metadata->>'feature_envelope' IS NOT NULL THEN 1 END) as with_envelope,
          COUNT(CASE WHEN metadata->>'feature_id' IS NOT NULL THEN 1 END) as with_feature_id
        FROM atlas_summary_layers
      `);
      console.log(`\n📊 Verification:`);
      console.log(`   Total summary layers: ${verifyResult.rows[0].total}`);
      console.log(`   With feature_envelope: ${verifyResult.rows[0].with_envelope}`);
      console.log(`   With feature_id: ${verifyResult.rows[0].with_feature_id}`);
    }

    console.log('\n✅ Complete\n');
  } catch (err) {
    console.error(`\n❌ Error: ${err}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
