import { QdrantClient } from '@qdrant/js-client-rest';
import { Pool } from 'pg';

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
});

const pgPool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5434'),
  database: process.env.POSTGRES_DB || 'legal_ai_db',
  user: process.env.POSTGRES_USER || 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
});

async function backfillByPacketKey() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Backfill Qdrant Payloads by Packet Key Matching              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Build packet_key lookup from Postgres
    console.log('📖 Loading Postgres identity index...');
    const indexResult = await pgPool.query(`
      SELECT packet_key, source_ref, feature_id, domain_class, directory_path
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
    `);
    const packetIndex = new Map();
    indexResult.rows.forEach(row => {
      packetIndex.set(row.packet_key, {
        source_ref: row.source_ref,
        feature_id: row.feature_id,
        domain_class: row.domain_class,
        directory_path: row.directory_path,
      });
    });
    console.log(`  Indexed ${packetIndex.size} packets\n`);

    // Scroll Qdrant points and update payload if packet_key is found
    console.log('🔄 Scrolling Qdrant and upserting payloads...\n');
    let offset = null;
    let total = 0;
    let updated = 0;
    let missing = 0;
    const BATCH_SIZE = 500;
    let pointBatch = [];

    do {
      const scrollResult = await qdrant.scroll('codebase_chunks_768', {
        limit: BATCH_SIZE,
        offset: offset,
        with_payload: true,
        with_vectors: false,
      });

      for (const point of scrollResult.points) {
        total++;
        const packetKey = point.payload?.packet_key;
        
        if (packetKey && packetIndex.has(packetKey)) {
          const identity = packetIndex.get(packetKey);
          pointBatch.push({
            id: point.id,
            payload: {
              packet_key: packetKey,
              source_ref: identity.source_ref,
              feature_id: identity.feature_id,
              domain_class: identity.domain_class,
              directory_path: identity.directory_path,
            },
          });
          updated++;
        } else if (!packetKey) {
          missing++;
        }

        // Upsert batch when full
        if (pointBatch.length >= BATCH_SIZE) {
          await qdrant.upsert('codebase_chunks_768', {
            points: pointBatch,
            wait: false,
          });
          console.log(`  ✓ Upserted batch at ${total}/${updated} updated, ${missing} missing payload`);
          pointBatch = [];
        }
      }

      offset = scrollResult.next_page_offset;
    } while (offset !== null);

    // Final batch
    if (pointBatch.length > 0) {
      await qdrant.upsert('codebase_chunks_768', {
        points: pointBatch,
        wait: false,
      });
    }

    console.log(`\n✅ Backfill complete:`);
    console.log(`  Total Qdrant points: ${total}`);
    console.log(`  Points updated: ${updated}`);
    console.log(`  Points missing packet_key: ${missing}`);
    console.log(`  Success rate: ${((updated / total) * 100).toFixed(1)}%`);

    await pgPool.end();
  } catch (err) {
    console.error(`✗ Error: ${err.message}`);
    await pgPool.end();
    process.exit(1);
  }
}

backfillByPacketKey();
