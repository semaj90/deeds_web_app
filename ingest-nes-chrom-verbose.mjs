#!/usr/bin/env node
import fs from 'node:fs';
import readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' });

(async () => {
  console.log('📥 Reading NDJSON...');
  const packets = [];
  const rl = readline.createInterface({ input: fs.createReadStream('.tmp/addressable-packets.ndjson'), crlfDelay: Infinity });
  
  for await (const line of rl) {
    if (line.trim()) packets.push(JSON.parse(line));
  }

  console.log(`Loaded ${packets.length}\n`);
  
  const client = await pool.connect();
  let inserted = 0, failed = 0, errors = {};

  for (const p of packets) {
    try {
      const res = await client.query(`
        INSERT INTO nes_chrom_packets (
          id, packet_key, query_hash, chunk_id, source_ref, source_refs, feature_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        randomUUID(),
        p.packet_key || p.packetKey || 'unknown',
        p.query_hash || p.queryHash || 'unknown',
        p.chunk_id || p.chunkId || 'unknown',
        p.source_ref || p.sourceRef || 'unknown',
        JSON.stringify([]),
        p.feature_id || p.featureId || 'unknown'
      ]);
      if (res.rowCount > 0) inserted++;
    } catch (e) {
      failed++;
      const key = e.code || e.message.split('\n')[0];
      errors[key] = (errors[key] || 0) + 1;
    }
  }

  client.release();
  console.log(`✅ Inserted: ${inserted}`);
  console.log(`❌ Failed: ${failed}`);
  console.log('Errors:', errors);

  const result = await pool.query('SELECT COUNT(*) FROM nes_chrom_packets');
  console.log(`\nFinal: ${result.rows[0].count} rows`);
  
  await pool.end();
})();
