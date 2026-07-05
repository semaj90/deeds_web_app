import fetch from 'node-fetch';
import { Pool } from 'pg';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const pgPool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5434'),
  database: process.env.POSTGRES_DB || 'legal_ai_db',
  user: process.env.POSTGRES_USER || 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
});

async function backfill() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Backfill Qdrant Payloads via PATCH (by Packet Key)            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Build Postgres lookup
    console.log('📖 Loading Postgres index...');
    const res = await pgPool.query(`
      SELECT packet_key, source_ref, feature_id, domain_class, directory_path
      FROM atlas_packets WHERE packet_key IS NOT NULL
    `);
    const packetMap = new Map(res.rows.map(r => [r.packet_key, r]));
    console.log(`  Indexed ${packetMap.size} packets\n`);

    // Scroll & update Qdrant
    console.log('🔄 Backfilling Qdrant payloads...\n');
    let offset = 0;
    let total = 0;
    let updated = 0;
    let LIMIT = 100;

    while (true) {
      // Scroll points
      const scrollRes = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: LIMIT, offset, with_payload: true, with_vectors: false }),
      });
      const scrollData = await scrollRes.json();
      if (!scrollData.result || !scrollData.result.points) break;

      const points = scrollData.result.points;
      total += points.length;

      // Group by packet_key and upsert payloads
      const pointsToUpdate = points.filter(p => p.payload?.packet_key);
      if (pointsToUpdate.length > 0) {
        // Group by packet_key to batch updates
        const byPacketKey = new Map();
        pointsToUpdate.forEach(p => {
          const pk = p.payload.packet_key;
          if (!byPacketKey.has(pk)) byPacketKey.set(pk, []);
          byPacketKey.get(pk).push(p.id);
        });

        // Batch update via PATCH
        for (const [packetKey, ids] of byPacketKey) {
          if (packetMap.has(packetKey)) {
            const data = packetMap.get(packetKey);
            const patchRes = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/payload`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                payload: {
                  packet_key: data.packet_key,
                  source_ref: data.source_ref,
                  feature_id: data.feature_id,
                  domain_class: data.domain_class,
                  directory_path: data.directory_path,
                },
                points: ids,
              }),
            });
            if (patchRes.ok) {
              updated += ids.length;
            } else {
              console.warn(`  ⚠️  PATCH failed for ${packetKey}: ${await patchRes.text()}`);
            }
          }
        }
      }

      console.log(`  ✓ Scrolled batch (${total} total, ${updated} updated)`);
      offset += LIMIT;
      if (points.length < LIMIT) break;
    }

    console.log(`\n✅ Backfill complete:`);
    console.log(`  Total points: ${total}`);
    console.log(`  Updated: ${updated}`);
    console.log(`  Success rate: ${((updated / total) * 100).toFixed(1)}%`);

    await pgPool.end();
  } catch (err) {
    console.error(`✗ Error: ${err.message}`);
    await pgPool.end();
    process.exit(1);
  }
}

backfill();
