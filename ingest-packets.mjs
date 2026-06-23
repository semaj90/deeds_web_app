#!/usr/bin/env node
import fs from 'node:fs';
import readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const pool = new pg.Pool({ 
  connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
  max: 10,
});

(async () => {
  try {
    console.log('📥 Reading NDJSON...');
    const packets = [];
    const rl = readline.createInterface({ 
      input: fs.createReadStream('.tmp/addressable-packets.ndjson'),
      crlfDelay: Infinity 
    });

    for await (const line of rl) {
      if (line.trim()) {
        packets.push(JSON.parse(line));
      }
    }

    console.log(`✓ Loaded ${packets.length} packets`);

    const client = await pool.connect();
    const BATCH_SIZE = 50;
    let inserted = 0;
    let failed = 0;

    for (let i = 0; i < packets.length; i += BATCH_SIZE) {
      const batch = packets.slice(i, i + BATCH_SIZE);
      
      for (const p of batch) {
        try {
          await client.query(`
            INSERT INTO task_semantic_packets (
              id, source_ref, feature_id, packet_key, 
              qdrant_point_id, som_cluster, som_row, som_col,
              community_id, status, metadata, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (id) DO UPDATE SET updated_at = now()
          `, [
            p.id || randomUUID(),
            p.source_ref || p.sourceRef || null,
            p.feature_id || p.featureId || null,
            p.packet_key || p.packetKey || null,
            p.qdrant_point_id || p.qdrantPointId || null,
            p.som_cluster || null,
            p.som_row || null,
            p.som_col || null,
            p.community_id || p.communityId || null,
            'processed',
            JSON.stringify(p),
            new Date(),
            new Date()
          ]);
          inserted++;
        } catch (e) {
          failed++;
        }
      }
      process.stdout.write(`\r✓ ${inserted + failed}/${packets.length}`);
    }

    client.release();

    console.log(`\n✅ Inserted ${inserted}, Failed ${failed}`);

    const result = await pool.query('SELECT COUNT(*) FROM task_semantic_packets');
    console.log(`Final count: ${result.rows[0].count} rows\n`);

    await pool.end();
  } catch (e) {
    console.error('Fatal:', e.message);
    process.exit(1);
  }
})();
