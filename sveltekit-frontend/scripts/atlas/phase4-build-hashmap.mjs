#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, '../../docs/reports');
await fs.mkdir(REPORTS_DIR, { recursive: true }).catch(() => {});

async function buildPacketHashmap() {
  const startTime = Date.now();
  console.log('📦 Building packet HashMap from Postgres...\n');

  const client = new pg.Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5434'),
    user: process.env.DB_USER || 'legal_admin',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'legal_ai_db'
  });

  try {
    await client.connect();
    console.log('✅ Connected to Postgres');

    console.log('📥 Loading packets...');
    const packetsResult = await client.query(`
      SELECT
        packet_key,
        packet_id,
        source_ref,
        function_symbol,
        feature_id,
        feature_label,
        pagerank,
        community_id,
        som_cluster,
        metadata
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
      LIMIT 60000
    `);
    const packets = packetsResult.rows;
    console.log(`  Loaded ${packets.length} packets with integrated statistics`);

    console.log('\n⚙️  Building HashMap...');
    const packetMap = new Map();
    const sourceRefIndex = new Map();

    for (const packet of packets) {
      const metadata = {
        packet_id: packet.packet_id || packet.packet_key,
        packet_key: packet.packet_key,
        source_ref: packet.source_ref || 'unknown',
        symbol: packet.function_symbol || packet.metadata?.symbol || 'unknown',
        kind: packet.feature_id || packet.feature_label || 'unknown',
        pagerank: packet.pagerank ?? 0.0,
        community_id: packet.community_id ?? 0,
        som_cluster: packet.som_cluster ?? 0
      };

      packetMap.set(packet.packet_key, metadata);

      if (!sourceRefIndex.has(packet.source_ref)) {
        sourceRefIndex.set(packet.source_ref, []);
      }
      sourceRefIndex.get(packet.source_ref).push(packet.packet_key);
    }

    console.log(`✅ HashMap built: ${packetMap.size} packets, ${sourceRefIndex.size} source refs`);

    const payload = {
      packet_count: packetMap.size,
      source_ref_count: sourceRefIndex.size,
      packets: Array.from(packetMap.entries()),
      sourceRefs: Array.from(sourceRefIndex.entries()),
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - startTime
    };

    const outputPath = path.join(REPORTS_DIR, 'packet-hashmap.json');
    await fs.writeFile(outputPath, JSON.stringify(payload, null, 2));
    console.log(`✅ Saved to ${outputPath}`);

    const topByPageRank = Array.from(packetMap.values()).sort((a, b) => b.pagerank - a.pagerank).slice(0, 5);
    console.log('\n🏆 Top-5 by PageRank:');
    topByPageRank.forEach((p, idx) => {
      console.log(`   ${idx + 1}. ${p.symbol} (${p.source_ref})`);
    });

    console.log(`\n✅ COMPLETE in ${Date.now() - startTime}ms\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

await buildPacketHashmap();
