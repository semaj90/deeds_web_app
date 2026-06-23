#!/usr/bin/env node
import fs from 'node:fs';
import readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const pool = new pg.Pool({ 
  connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
  max: 20,
});

(async () => {
  try {
    console.log('📥 Reading NDJSON packets...');
    const packets = [];
    const rl = readline.createInterface({ 
      input: fs.createReadStream('.tmp/addressable-packets.ndjson'),
      crlfDelay: Infinity 
    });

    for await (const line of rl) {
      if (line.trim()) packets.push(JSON.parse(line));
    }

    console.log(`✓ Loaded ${packets.length} packets\n`);

    const client = await pool.connect();
    let inserted = 0;

    for (let i = 0; i < packets.length; i++) {
      const p = packets[i];
      
      try {
        await client.query(`
          INSERT INTO nes_chrom_packets (
            id, packet_key, query_hash, chunk_id, source_ref, source_refs,
            feature_id, packet_type, lane, model, summary, payload,
            embedding, qdrant_point_id, som_cluster, confidence_score,
            feature_ids, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
          ON CONFLICT (id) DO NOTHING
        `, [
          p.id || randomUUID(),
          p.packet_key || p.packetKey,
          p.query_hash || p.queryHash || '',
          p.chunk_id || p.chunkId || '',
          p.source_ref || p.sourceRef,
          JSON.stringify(p.source_refs || p.sourceRefs || []),
          p.feature_id || p.featureId,
          'nes_chrom',
          'semantic_packet',
          'gemma4-rotorquant:latest',
          p.summary || null,
          JSON.stringify(p.payload || p),
          p.embedding || null,
          p.qdrant_point_id || p.qdrantPointId || null,
          p.som_cluster || null,
          null,
          p.feature_ids || [],
          new Date(),
          new Date()
        ]);
        inserted++;
        if (inserted % 100 === 0) process.stdout.write(`\r✓ ${inserted}/${packets.length}`);
      } catch (e) {
        // Silent fail - likely duplicate or constraint violation
      }
    }

    client.release();
    console.log(`\n✅ Inserted ${inserted} packets\n`);

    const result = await pool.query('SELECT COUNT(*) FROM nes_chrom_packets');
    console.log(`Final count: ${result.rows[0].count} rows in nes_chrom_packets`);

    await pool.end();
  } catch (e) {
    console.error('Fatal:', e.message);
    process.exit(1);
  }
})();
