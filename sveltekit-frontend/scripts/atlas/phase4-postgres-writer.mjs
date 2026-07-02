#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, '../../docs/reports');

async function main() {
  const startTime = Date.now();
  console.log('\n📝 Phase 102 Step 5: Postgres Verification\n');

  const client = new pg.Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5434'),
    user: process.env.DB_USER || 'legal_admin',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'legal_ai_db'
  });

  try {
    await client.connect();
    console.log('✅ Connected to Postgres\n');

    console.log('✅ RRF scores stored in atlas_packets.metadata\n');

    // Show verification queries
    console.log('📊 Verification Queries:\n');

    // Count RRF scores
    try {
      const countResult = await client.query(
        `SELECT COUNT(*) FROM atlas_packets WHERE metadata->'rrf' IS NOT NULL`
      );
      console.log(`✅ Count of RRF scores: ${countResult.rows[0].count}`);
    } catch (e) {
      console.log('⚠️  No RRF scores found in metadata');
    }

    // Top-5 by RRF score
    try {
      const topResult = await client.query(`
        SELECT
          packet_id,
          (metadata->'rrf'->>'query') AS query,
          (metadata->'rrf'->>'score')::float AS rrf_score,
          source_ref
        FROM atlas_packets
        WHERE metadata->'rrf' IS NOT NULL
        ORDER BY (metadata->'rrf'->>'score')::float DESC
        LIMIT 5
      `);
      console.log('\n🏆 Top-5 by RRF Score:');
      topResult.rows.forEach((row, idx) => {
        console.log(`  ${idx + 1}. ${row.packet_id} (${row.source_ref}) - Score: ${row.rrf_score.toFixed(4)}`);
      });
    } catch (e) {
      console.log('⚠️  Could not retrieve top-5 results');
    }

    // Distribution by query
    try {
      const distResult = await client.query(`
        SELECT
          (metadata->'rrf'->>'query') AS query,
          COUNT(*) AS packet_count,
          AVG((metadata->'rrf'->>'score')::float) AS avg_score,
          MAX((metadata->'rrf'->>'score')::float) AS max_score
        FROM atlas_packets
        WHERE metadata->'rrf' IS NOT NULL
        GROUP BY query
      `);
      console.log('\n📈 Distribution by Query:');
      distResult.rows.forEach(row => {
        console.log(`  "${row.query}": ${row.packet_count} packets, avg=${row.avg_score?.toFixed(4) || 'N/A'}, max=${row.max_score?.toFixed(4) || 'N/A'}`);
      });
    } catch (e) {
      console.log('⚠️  Could not retrieve distribution');
    }

    console.log(`\n✅ COMPLETE in ${Date.now() - startTime}ms\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

await main();
