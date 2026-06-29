#!/usr/bin/env node
/**
 * Chrom97 Packet Generator for Agent Workflow Context
 *
 * Transforms feature envelopes from atlas_summary_layers into chrom97 packets
 * for agent workflow context and recommendation scoring.
 *
 * Chrom97 packet format:
 * - identity: packet_key, feature_id, source_ref, feature_label
 * - context: summary, domain_class, topology_label, community_id
 * - features: keywords[], entities[], ace_tags[], kag_nodes[]
 * - topology: dag_edges[], som_cluster, pagerank
 * - evidence: provenance, confidence, identity_chain_complete
 *
 * Usage:
 *   npm run chrom97:generate [--dry-run] [--apply] [--limit=100]
 */

import { Pool } from 'pg';

const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const LIMIT = parseInt(
  process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '0'
) || 1000;

const PG_HOST = process.env.POSTGRES_HOST || 'localhost';
const PG_PORT = parseInt(process.env.POSTGRES_PORT || '5434');
const PG_DB = process.env.POSTGRES_DB || 'legal_ai_db';
const PG_USER = process.env.POSTGRES_USER || 'legal_admin';
const PG_PASSWORD = process.env.POSTGRES_PASSWORD || '123456';

interface FeatureEnvelope {
  packet_key: string;
  feature_id: string;
  feature_label: string;
  source_ref: string;
  domain_class: string;
  topology_label: string;
  community_id?: string;
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

interface Chrom97Packet {
  packet_id: string;
  packet_key: string;
  feature_id: string;
  source_ref: string;
  feature_label: string;
  packet_type: 'chrom97-feature' | 'chrom97-context' | 'chrom97-topology';
  identity: {
    packet_key: string;
    feature_id: string;
    source_ref: string;
    feature_label: string;
  };
  context: {
    summary?: string;
    domain_class: string;
    topology_label: string;
    community_id?: string;
  };
  features: {
    keywords: string[];
    entities: string[];
    ace_tags: string[];
    kag_nodes: string[];
  };
  topology: {
    dag_edges: Array<{ to: string; from: string; relation: string }>;
    som_cluster?: number;
    pagerank?: number;
  };
  evidence: {
    provenance: {
      source: string;
      worker: string;
      generated_at: string;
    };
    confidence: number;
    identity_chain_complete: boolean;
  };
  generated_at: string;
  schema_version: '1.0';
}

async function fetchFeatureEnvelopes(pool: Pool, limit: number): Promise<FeatureEnvelope[]> {
  const query = `
    SELECT
      asl.packet_key,
      asl.summary,
      asl.metadata->'feature_envelope' as envelope
    FROM atlas_summary_layers asl
    WHERE asl.metadata->>'feature_envelope' IS NOT NULL
    AND asl.metadata->'feature_envelope'->>'packet_key' IS NOT NULL
    ${limit > 0 ? `LIMIT ${limit}` : ''}
  `;

  const result = await pool.query(query);

  return result.rows.map((row: any) => {
    const envelope = row.envelope as FeatureEnvelope;
    return {
      ...envelope,
      summary: row.summary,
    };
  });
}

function generateChrom97Packet(envelope: FeatureEnvelope, summary: string): Chrom97Packet {
  const now = new Date().toISOString();

  // Generate stable packet ID from feature_id + timestamp hash
  const packetId = `chrom97:${envelope.feature_id}:${Math.random().toString(36).slice(2, 11)}`;

  return {
    packet_id: packetId,
    packet_key: envelope.packet_key,
    feature_id: envelope.feature_id,
    source_ref: envelope.source_ref,
    feature_label: envelope.feature_label,
    packet_type: 'chrom97-feature',
    identity: {
      packet_key: envelope.packet_key,
      feature_id: envelope.feature_id,
      source_ref: envelope.source_ref,
      feature_label: envelope.feature_label,
    },
    context: {
      summary: summary || undefined,
      domain_class: envelope.domain_class,
      topology_label: envelope.topology_label,
      community_id: envelope.community_id,
    },
    features: {
      keywords: envelope.keywords || [],
      entities: envelope.entities || [],
      ace_tags: envelope.ace_tags || [],
      kag_nodes: envelope.kag_nodes || [],
    },
    topology: {
      dag_edges: envelope.dag_edges || [],
      som_cluster: envelope.som_cluster,
      pagerank: envelope.pagerank,
    },
    evidence: {
      provenance: envelope.provenance,
      confidence: envelope.confidence,
      identity_chain_complete: envelope.identity_chain_complete,
    },
    generated_at: now,
    schema_version: '1.0',
  };
}

async function writeChrom97Packets(pool: Pool, packets: Chrom97Packet[], dryRun: boolean) {
  if (dryRun) {
    console.log(`\n📋 DRY_RUN: Would write ${packets.length} chrom97 packets`);
    console.log('\nSample packet (first 3):');
    packets.slice(0, 3).forEach((p, i) => {
      console.log(`  [${i + 1}] ${p.packet_key} (${p.feature_label})`);
    });
    return;
  }

  let written = 0;
  try {
    const crypto = await import('crypto');
    for (const packet of packets) {
      // Generate packet_hash from packet_key + packet_json SHA
      const hash = crypto.createHash('sha256').update(`${packet.packet_key}:${JSON.stringify(packet)}`).digest('hex');

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
          packet.feature_id,
          packet.source_ref,
          packet.feature_label,
          JSON.stringify(packet),
          hash,
          packet.topology.som_cluster || null,
          packet.context.community_id || null,
        ]
      );
      written++;
    }
    console.log(`\n💾 Wrote ${written} chrom97 packets to Postgres`);
  } catch (err) {
    console.error(`\n❌ Write failed: ${err}`);
    throw err;
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Chrom97 Packet Generator (Feature → Agent Context)            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`Limit: ${LIMIT > 0 ? LIMIT : 'all'}\n`);

  const pool = new Pool({
    host: PG_HOST,
    port: PG_PORT,
    database: PG_DB,
    user: PG_USER,
    password: PG_PASSWORD,
  });

  try {
    // Step 1: Fetch envelopes
    console.log('📦 Fetching feature envelopes from atlas_summary_layers...');
    const envelopes = await fetchFeatureEnvelopes(pool, LIMIT);
    console.log(`✅ Fetched ${envelopes.length} envelopes\n`);

    if (envelopes.length === 0) {
      console.log('⚠️  No feature envelopes found');
      return;
    }

    // Step 2: Generate chrom97 packets
    console.log('🔄 Generating chrom97 packets...');
    const packets: Chrom97Packet[] = [];
    for (const envelope of envelopes) {
      const packet = generateChrom97Packet(envelope, envelope.summary || '');
      packets.push(packet);
    }
    console.log(`✅ Generated ${packets.length} chrom97 packets\n`);

    // Step 3: Write packets
    console.log('💾 Writing chrom97 packets to Postgres...');
    await writeChrom97Packets(pool, packets, DRY_RUN);

    // Step 4: Verify
    if (!DRY_RUN) {
      console.log('\n📊 Verification:');
      const result = await pool.query(
        'SELECT COUNT(*) as total FROM chrom97_packets'
      );
      console.log(`   Total chrom97 packets in DB: ${result.rows[0].total}`);
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