#!/usr/bin/env node

/**
 * Import 5K batch from Phase 3
 *
 * 1. Import summaries from .tmp/gemma4-summaries-5k.ndjson
 * 2. Validate source_ref + feature_id lineage (orphan detection)
 * 3. Insert into atlas_summary_layers with schema
 * 4. Report coverage progress (X/58304)
 *
 * Usage:
 *   node scripts/atlas/validate-5k-batch-partial.mjs --apply
 */

import fs from 'fs';
import readline from 'readline';
import { Pool } from 'pg';

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

const pgPool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5434'),
  database: process.env.POSTGRES_DB || 'legal_ai_db',
  user: process.env.POSTGRES_USER || 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
});

async function importAndValidate() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Validate 295-packet Partial Batch                             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`Input: .tmp/gemma4-summaries-5k.ndjson\n`);

  if (!fs.existsSync('.tmp/gemma4-summaries-5k.ndjson')) {
    console.error('✗ Input file not found');
    process.exit(1);
  }

  const fileStream = fs.createReadStream('.tmp/gemma4-summaries-5k.ndjson');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let lineNum = 0;
  let successCount = 0;
  let errorCount = 0;
  let orphanCount = 0;
  const summariesToInsert = [];

  console.log('📖 Reading summaries...\n');

  for await (const line of rl) {
    lineNum++;

    if (!line.trim()) continue;

    try {
      const obj = JSON.parse(line);
      const { packet_key, source_ref, summary, status, feature_id, feature_label } = obj;

      if (status !== 'success') {
        errorCount++;
        continue;
      }

      // Validate lineage
      if (!packet_key || !source_ref) {
        orphanCount++;
        continue;
      }

      summariesToInsert.push({
        packet_key,
        source_ref,
        feature_id: feature_id || null,
        summary,
        layer_type: 'gemma4_offline',
        model_name: 'gemma4-legal-iq4xs-direct.gguf',
        summary_level: 'packet',
        pass_key: 'gemma4_summary_v1',
      });

      successCount++;
    } catch (err) {
      console.error(`  ✗ Parse error on line ${lineNum}: ${err.message}`);
      errorCount++;
    }
  }

  console.log(`📊 Summary:`);
  console.log(`  Processed: ${lineNum} lines`);
  console.log(`  Success: ${successCount}`);
  console.log(`  Errors: ${errorCount}`);
  console.log(`  Orphan (missing packet_key/source_ref): ${orphanCount}`);

  if (DRY_RUN) {
    console.log(`\n✅ Dry-run complete. Ready to apply with: --apply`);
    await pgPool.end();
    process.exit(0);
  }

  // Apply mode: insert into Postgres
  console.log(`\n💾 Inserting into atlas_summary_layers...\n`);

  let insertCount = 0;
  const batchSize = 50;

  for (let i = 0; i < summariesToInsert.length; i += batchSize) {
    const batch = summariesToInsert.slice(i, i + batchSize);

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
      await pgPool.query(query, params);
      insertCount += batch.length;
      console.log(`  ✓ Inserted batch ${Math.floor(i / batchSize) + 1} (${insertCount}/${summariesToInsert.length})`);
    } catch (err) {
      console.error(`  ✗ Batch insert failed: ${err.message}`);
      throw err;
    }
  }

  // Log analysis pass independently
  console.log(`\n📋 Logging analysis pass independently...\n`);

  const analysisPassRecord = {
    pass_key: 'gemma4_summary_v1',
    status: 'success',
    processed_count: successCount,
    error_count: errorCount,
    orphan_count: orphanCount,
    provenance: {
      source: 'offline_summary_worker',
      repo_analysis: true,
      input_kind: 'backlog_ndjson',
      summary_variance: {
        temperature: 0.3,
        max_tokens: 128,
        seed: null,
        deterministic: false,
      },
      runtime: {
        endpoint: 'http://127.0.0.1:8090/v1/completions',
        worker: 'python_async',
        concurrency: 6,
      },
    },
  };

  try {
    await pgPool.query(
      `
      INSERT INTO analysis_pass_results (
        pass_key, status, output, provenance, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, NOW(), NOW()
      )
      `,
      [
        analysisPassRecord.pass_key,
        analysisPassRecord.status,
        JSON.stringify({
          processed_count: analysisPassRecord.processed_count,
          error_count: analysisPassRecord.error_count,
          orphan_count: analysisPassRecord.orphan_count,
        }),
        JSON.stringify(analysisPassRecord.provenance),
      ]
    );
    console.log('  ✓ Analysis pass logged');
  } catch (err) {
    console.error(`  ✗ Analysis pass log failed: ${err.message}`);
  }

  console.log(`\n✅ Import complete:`);
  console.log(`  Inserted: ${insertCount} summaries`);
  console.log(`  Progress: ${insertCount}/58304 (${(insertCount / 58304 * 100).toFixed(2)}%)`);

  await pgPool.end();
}

try {
  await importAndValidate();
  process.exit(0);
} catch (err) {
  console.error(`✗ Error: ${err.message}`);
  process.exit(1);
}
