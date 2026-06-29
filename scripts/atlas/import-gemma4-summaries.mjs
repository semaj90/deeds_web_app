#!/usr/bin/env node

/**
 * Import Gemma4 Summaries
 *
 * Imports generated summaries from Python offline worker into atlas_summary_layers.
 *
 * Usage:
 *   node scripts/atlas/import-gemma4-summaries.mjs --input=.tmp/gemma4-summaries.ndjson --dry-run
 *   node scripts/atlas/import-gemma4-summaries.mjs --input=.tmp/gemma4-summaries.ndjson --apply
 */

import { Pool } from 'pg';
import fs from 'fs';
import readline from 'readline';
import process from 'process';

const args = {
  input: process.argv.find(a => a.startsWith('--input='))?.split('=')[1] || '.tmp/gemma4-summaries.ndjson',
  dryRun: process.argv.includes('--dry-run'),
  apply: process.argv.includes('--apply'),
};

if (!args.dryRun && !args.apply) {
  console.log(`\n⚠️  Mode not specified. Use --dry-run or --apply\n`);
  process.exit(1);
}

console.log(`\n📥 Import Gemma4 Summaries`);
console.log(`${'='.repeat(50)}`);
console.log(`  Input:   ${args.input}`);
console.log(`  Mode:    ${args.dryRun ? 'DRY-RUN' : 'APPLY'}\n`);

if (!fs.existsSync(args.input)) {
  console.error(`✗ Input file not found: ${args.input}`);
  process.exit(1);
}

const pool = new Pool({
  user: process.env.POSTGRES_USER || 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || 'password',
  host: process.env.POSTGRES_HOST || '127.0.0.1',
  port: parseInt(process.env.POSTGRES_PORT || '5434'),
  database: process.env.POSTGRES_DB || 'legal_ai_db',
});

async function processFile() {
  const fileStream = fs.createReadStream(args.input);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let lineNum = 0;
  let successCount = 0;
  let errorCount = 0;
  const summariesToInsert = [];

  console.log(`🔍 Reading NDJSON...\n`);

  for await (const line of rl) {
    lineNum++;

    if (!line.trim()) continue;

    try {
      const obj = JSON.parse(line);
      const { packet_key, source_ref, summary, status } = obj;

      if (status !== 'success') {
        if (args.dryRun) {
          console.log(`  ⚠️  Line ${lineNum}: ${packet_key} (status=${status})`);
        }
        errorCount++;
        continue;
      }

      summariesToInsert.push({
        packet_key,
        source_ref,
        feature_id: obj.feature_id || null,
        summary,
        layer_type: 'gemma4_offline',
        model_name: 'gemma4-legal-iq4xs-direct.gguf',
        summary_level: 'packet',
      });

      if (args.dryRun && successCount < 5) {
        console.log(`  ✓ Line ${lineNum}: ${packet_key}`);
        console.log(`    Summary: ${summary.substring(0, 60)}...`);
      }

      successCount++;
    } catch (err) {
      console.error(`  ✗ Parse error on line ${lineNum}: ${err.message}`);
      errorCount++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`  Processed: ${lineNum} lines`);
  console.log(`  Success:   ${successCount}`);
  console.log(`  Errors:    ${errorCount}`);

  if (args.dryRun) {
    console.log(`\n✅ Dry-run complete. Ready to apply with: --apply`);
    process.exit(0);
  }

  // Apply mode: insert into Postgres
  console.log(`\n💾 Inserting into atlas_summary_layers...\n`);

  let insertCount = 0;
  const batchSize = 100;

  for (let i = 0; i < summariesToInsert.length; i += batchSize) {
    const batch = summariesToInsert.slice(i, i + batchSize);

    // Insert: new summaries with full context (packet_key, source_ref, feature_id, summary, etc.)
    const query = `
      INSERT INTO atlas_summary_layers (
        packet_key, source_ref, feature_id, summary, layer_type, model_name, summary_level, generated_at
      )
      VALUES
        ${batch.map((_, idx) => `($${idx * 7 + 1}, $${idx * 7 + 2}, $${idx * 7 + 3}, $${idx * 7 + 4}, $${idx * 7 + 5}, $${idx * 7 + 6}, $${idx * 7 + 7}, NOW())`).join(',\n        ')}
    `;

    const params = batch.flatMap(b => [
      b.packet_key,
      b.source_ref,
      b.feature_id,
      b.summary,
      b.layer_type,
      b.model_name,
      b.summary_level,
    ]);

    try {
      await pool.query(query, params);
      insertCount += batch.length;
      console.log(`  ✓ Inserted batch ${Math.floor(i / batchSize) + 1} (${insertCount}/${summariesToInsert.length})`);
    } catch (err) {
      console.error(`  ✗ Batch insert failed: ${err.message}`);
      throw err;
    }
  }

  console.log(`\n✅ Import complete:`);
  console.log(`  Inserted: ${insertCount} summaries`);
  console.log(`  Errors:   ${errorCount}`);
}

try {
  await processFile();
  process.exit(0);
} catch (err) {
  console.error(`✗ Error: ${err.message}`);
  process.exit(1);
} finally {
  await pool.end();
}
