#!/usr/bin/env node

import { QdrantClient } from '@qdrant/js-client-rest';
import pg from 'pg';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../..');

config({ path: resolve(ROOT, '.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://127.0.0.1:6333',
  apiKey: process.env.QDRANT_API_KEY
});

const REPORTS_DIR = resolve(ROOT, 'docs/reports');

async function debugCodebaseAlignment() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Qdrant ↔ Postgres Codebase Alignment (New Split Ledger)      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    console.log('Step 1: Fetching 100 Qdrant codebase chunks...');
    const scroll = await qdrant.scroll('codebase_chunks_768', {
      limit: 100,
      offset: 0,
      with_payload: true,
      with_vectors: false
    });

    const points = scroll.points;
    console.log(`✅ Fetched ${points.length} points\n`);

    console.log('Step 2: Fetching Postgres atlas_codebase_packets...');
    const pgRes = await pool.query('SELECT source_ref, packet_key, feature_id FROM atlas_codebase_packets');
    const pgBySourceRef = new Map();
    pgRes.rows.forEach(row => {
      pgBySourceRef.set(row.source_ref, row);
    });
    console.log(`✅ Fetched ${pgRes.rows.length} codebase packets\n`);

    console.log('Step 3: Matching Qdrant points to Postgres by source_ref...');
    let matched = 0;
    let mismatched = 0;
    const mismatches = [];

    for (const pt of points) {
      const sourceRef = pt.payload?.source_ref;
      const pgRow = sourceRef ? pgBySourceRef.get(sourceRef) : null;

      if (pgRow) {
        matched++;
      } else {
        mismatched++;
        mismatches.push({
          qdrant_id: pt.id,
          source_ref: sourceRef,
          reason: sourceRef ? 'no_postgres_match' : 'missing_source_ref'
        });
      }
    }

    const pct = ((matched / points.length) * 100).toFixed(1);
    console.log(`Matched: ${matched}/${points.length} (${pct}%)`);
    console.log(`Mismatched: ${mismatched}/${points.length} (${(100-pct)}%)\n`);

    // Write report
    mkdirSync(REPORTS_DIR, { recursive: true });

    const report = {
      timestamp: new Date().toISOString(),
      postgres_table: 'atlas_codebase_packets',
      qdrant_collection: 'codebase_chunks_768',
      postgres_total: pgRes.rows.length,
      qdrant_sampled: points.length,
      matched: matched,
      mismatched: mismatched,
      agreement_pct: parseFloat(pct),
      status: parseFloat(pct) >= 80 ? 'GOOD' : 'INVESTIGATE',
      mismatches: mismatches.slice(0, 20)
    };

    writeFileSync(
      resolve(REPORTS_DIR, 'qdrant-codebase-alignment.json'),
      JSON.stringify(report, null, 2)
    );

    console.log(`✅ Report: docs/reports/qdrant-codebase-alignment.json\n`);

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  ALIGNMENT SUMMARY                                             ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    console.log(`Postgres codebase packets: ${pgRes.rows.length}`);
    console.log(`Qdrant codebase chunks: ${points.length} sampled`);
    console.log(`Agreement: ${matched}/${points.length} (${pct}%)`);
    console.log(`Status: ${report.status}\n`);

  } catch (err) {
    console.error('❌ Alignment check failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

debugCodebaseAlignment();
