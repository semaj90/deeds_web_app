#!/usr/bin/env node

/**
 * Export Summary Backlog
 *
 * Exports unsummarized packets from Postgres to NDJSON for offline Gemma4 processing.
 *
 * Usage:
 *   node scripts/atlas/export-summary-backlog.mjs --limit=500 --output=.tmp/backlog.ndjson
 */

import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import process from 'process';

const args = {
  limit: parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '1000'),
  output: process.argv.find(a => a.startsWith('--output='))?.split('=')[1] || '.tmp/summary-backlog.ndjson',
};

console.log(`\n📤 Export Summary Backlog`);
console.log(`${'='.repeat(50)}`);
console.log(`  Limit:  ${args.limit}`);
console.log(`  Output: ${args.output}\n`);

const pool = new Pool({
  user: process.env.POSTGRES_USER || 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || 'password',
  host: process.env.POSTGRES_HOST || '127.0.0.1',
  port: parseInt(process.env.POSTGRES_PORT || '5434'),
  database: process.env.POSTGRES_DB || 'legal_ai_db',
});

try {
  // Ensure output directory exists
  const outputDir = path.dirname(args.output);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Query unsummarized packets
  console.log(`🔍 Querying unsummarized packets...`);
  const result = await pool.query(
    `
    SELECT DISTINCT
      ap.packet_key,
      ap.source_ref,
      ap.feature_id,
      ap.feature_label,
      ap.domain_class,
      ap.keywords,
      COALESCE(asl.summary, NULL) as existing_summary
    FROM atlas_packets ap
    LEFT JOIN atlas_summary_layers asl ON ap.packet_key = asl.packet_key
    WHERE asl.summary IS NULL OR asl.summary = ''
    ORDER BY ap.packet_key
    LIMIT $1
    `,
    [args.limit]
  );

  console.log(`  Found: ${result.rows.length} unsummarized packets\n`);

  if (result.rows.length === 0) {
    console.log(`✅ No unsummarized packets. Nothing to do.`);
    process.exit(0);
  }

  // Write NDJSON
  console.log(`✍️  Writing NDJSON...`);
  const stream = fs.createWriteStream(args.output);
  let count = 0;

  for (const row of result.rows) {
    const packet = {
      packet_key: row.packet_key,
      source_ref: row.source_ref,
      feature_id: row.feature_id,
      feature_label: row.feature_label,
      domain_class: row.domain_class,
      keywords: row.keywords || [],
    };

    stream.write(JSON.stringify(packet) + '\n');
    count++;
  }

  stream.end();

  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  console.log(`  ✓ Wrote ${count} packets to ${args.output}\n`);
  console.log(`✅ Next: Run offline Gemma4 worker\n`);
  console.log(`  python scripts/gemma4/offline_summary_worker.py \\`);
  console.log(`    --input ${args.output} \\`);
  console.log(`    --output .tmp/gemma4-summaries.ndjson \\`);
  console.log(`    --endpoint http://127.0.0.1:8090/v1/completions \\`);
  console.log(`    --concurrency 2\n`);
} catch (err) {
  console.error('✗ Error:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}
