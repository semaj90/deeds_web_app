import { Pool } from 'pg';
import { QdrantClient } from '@qdrant/js-client-rest';

const pgPool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5434'),
  database: process.env.POSTGRES_DB || 'legal_ai_db',
  user: process.env.POSTGRES_USER || 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
});

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
});

async function backfillQdrantPayloads() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Backfill Qdrant Payloads with Postgres Identity Fields        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Fetch all packets with identity fields
    console.log('📖 Fetching Postgres identity data...');
    const packetResult = await pgPool.query(`
      SELECT 
        packet_key, 
        source_ref, 
        feature_id, 
        domain_class,
        directory_path
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
      LIMIT 60000
    `);

    const packets = packetResult.rows;
    console.log(`  Found: ${packets.length} packets\n`);

    // Batch upsert to Qdrant
    console.log('🔄 Upserting payloads to Qdrant...\n');
    const BATCH_SIZE = 500;
    let upserted = 0;
    let failed = 0;

    for (let i = 0; i < packets.length; i += BATCH_SIZE) {
      const batch = packets.slice(i, i + BATCH_SIZE);
      const points = batch.map((p, idx) => ({
        id: i + idx,
        payload: {
          packet_key: p.packet_key,
          source_ref: p.source_ref,
          feature_id: p.feature_id,
          domain_class: p.domain_class,
          directory_path: p.directory_path,
        },
      }));

      try {
        await qdrant.upsert('codebase_chunks_768', {
          points: points,
          wait: false,
        });
        upserted += batch.length;
      } catch (err) {
        console.warn(`  ⚠️  Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${err.message}`);
        failed += batch.length;
      }

      const pct = ((upserted + failed) / packets.length * 100).toFixed(1);
      console.log(`  ✓ Batch ${Math.floor(i / BATCH_SIZE) + 1} (${upserted}/${packets.length} upserted, ${pct}%)`);
    }

    console.log(`\n✅ Backfill complete:`);
    console.log(`  Payloads upserted: ${upserted}`);
    console.log(`  Failed: ${failed}`);
    console.log(`  Success rate: ${((upserted / (upserted + failed)) * 100).toFixed(1)}%`);

    await pgPool.end();
  } catch (err) {
    console.error(`✗ Error: ${err.message}`);
    await pgPool.end();
    process.exit(1);
  }
}

backfillQdrantPayloads();
