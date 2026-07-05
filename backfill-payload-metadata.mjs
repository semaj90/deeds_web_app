import { Pool } from 'pg';
import crypto from 'crypto';

const pgPool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5434'),
  database: process.env.POSTGRES_DB || 'legal_ai_db',
  user: process.env.POSTGRES_USER || 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
});

async function backfillPayloadMetadata() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Backfill Payload Metadata: path + hash                        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    console.log('📖 Fetching packets...');
    const res = await pgPool.query(`
      SELECT packet_key, source_ref, metadata
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
      LIMIT 60000
    `);

    const packets = res.rows;
    console.log(`  Found: ${packets.length} packets\n`);

    // Backfill each packet
    console.log('🔄 Backfilling payload metadata...\n');
    const BATCH_SIZE = 500;
    let updated = 0;

    for (let i = 0; i < packets.length; i += BATCH_SIZE) {
      const batch = packets.slice(i, i + BATCH_SIZE);
      
      for (const p of batch) {
        const meta = p.metadata || {};
        
        // Derive path from source_ref (directory)
        const path = p.source_ref ? p.source_ref.split('/').slice(0, -1).join('/') : '';
        
        // Hash the packet_key for checksum
        const hash = crypto
          .createHash('sha256')
          .update(p.packet_key)
          .digest('hex')
          .slice(0, 16);

        const updatedMeta = {
          ...meta,
          path: path,
          hash: hash,
          backfilled_at: new Date().toISOString(),
        };

        await pgPool.query(
          `UPDATE atlas_packets SET metadata = $1::jsonb WHERE packet_key = $2`,
          [JSON.stringify(updatedMeta), p.packet_key]
        );
        updated++;
      }

      const pct = ((i + batch.length) / packets.length * 100).toFixed(1);
      console.log(`  ✓ Batch ${Math.floor(i / BATCH_SIZE) + 1} (${updated}/${packets.length}, ${pct}%)`);
    }

    console.log(`\n✅ Backfill complete:`);
    console.log(`  Payloads updated: ${updated}`);

    await pgPool.end();
  } catch (err) {
    console.error(`✗ Error: ${err.message}`);
    await pgPool.end();
    process.exit(1);
  }
}

backfillPayloadMetadata();
