#!/usr/bin/env node
/**
 * Phase 89: Re-embed ALL 74,867 svelte-check errors from JSON
 *
 * The previous embedder only got 6,800 because it:
 * 1. Read .txt instead of .json (or vice versa)
 * 2. Deduplicated too aggressively
 *
 * This script properly parses svelte-check JSON output
 */

import { readFileSync } from 'fs';
import ollama from 'ollama';
import pg from 'pg';

const { Pool } = pg;

const CONFIG = {
  postgres: {
    host: '127.0.0.1',
    port: 5434,
    database: 'legal_ai_db',
    user: 'legal_admin',
    password: '123456'
  },
  ollama: {
    host: 'http://localhost:11434',
    embeddingModel: 'embeddinggemma'
  },
  chunking: {
    batchSize: 50
  }
};

let db;

async function main() {
  console.log('🔍 Phase 89: Re-embedding svelte-check errors from JSON\n');

  db = new Pool(CONFIG.postgres);
  console.log('✅ Connected to Postgres\n');

  // Read JSON file
  console.log('📂 Reading svelte-check-errors.json...');
  const jsonContent = readFileSync('reports/svelte-check-errors.json', 'utf-8');
  const lines = jsonContent.split(/\r?\n/).filter(l => l.trim().length > 0);

  console.log(`   Total lines: ${lines.length.toLocaleString()}`);

  // Parse errors (format: timestamp TYPE "file" line:col "message")
  const errors = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.includes('START ')) continue; // Skip START lines

    // Parse space-delimited format
    // Example: 1766950123481 ERROR "src\\lib\\server\\db\\schema-postgres.ts" 1514:2 "Identifier expected."
    const match = line.match(/^(\d+)\s+(ERROR|WARNING)\s+"([^"]+)"\s+(\d+):(\d+)\s+"([^"]+)"$/);

    if (match) {
      const [, timestamp, severity, file, lineNum, col, message] = match;
      errors.push({
        file: file.replace(/\\\\/g, '/'),
        line: parseInt(lineNum),
        column: parseInt(col),
        message: message,
        severity: severity.toLowerCase(),
        code: null,
        fullText: `${file}:${lineNum}:${col} ${severity.toLowerCase()}: ${message}`
      });
    } else {
      // Fallback: treat as plain text
      errors.push({
        file: 'unknown',
        line: 0,
        column: 0,
        message: line,
        severity: 'error',
        code: null,
        fullText: line
      });
    }
  }  console.log(`   Parsed ${errors.length.toLocaleString()} errors`);

  // Check how many already exist
  const existingCount = await db.query(`
    SELECT COUNT(*) FROM raw_error_embeddings WHERE source = 'svelte-check'
  `);
  console.log(`   Existing in DB: ${existingCount.rows[0].count}`);

  if (errors.length <= existingCount.rows[0].count) {
    console.log('\n⚠️  No new errors to embed. Existing count >= parsed count.');
    console.log('   If you want to re-embed, delete existing rows first:');
    console.log('   docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -c "DELETE FROM raw_error_embeddings WHERE source = \'svelte-check\'"');
    await db.end();
    return;
  }

  // Clear existing svelte-check errors
  console.log('\n🗑️  Deleting existing svelte-check errors...');
  await db.query(`DELETE FROM raw_error_embeddings WHERE source = 'svelte-check'`);
  console.log('   ✅ Cleared');

  // Embed in batches
  console.log(`\n🔄 Embedding ${errors.length.toLocaleString()} errors...`);
  const batches = [];
  for (let i = 0; i < errors.length; i += CONFIG.chunking.batchSize) {
    batches.push(errors.slice(i, i + CONFIG.chunking.batchSize));
  }

  let totalEmbedded = 0;
  const startTime = Date.now();

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];

    for (const error of batch) {
      try {
        // Generate embedding
        const result = await ollama.embeddings({
          model: CONFIG.ollama.embeddingModel,
          prompt: error.fullText
        });

        // Insert
        await db.query(`
          INSERT INTO raw_error_embeddings (source, line_number, raw_text, embedding)
          VALUES ($1, $2, $3, $4)
        `, ['svelte-check', error.line, error.fullText, JSON.stringify(result.embedding)]);

        totalEmbedded++;
      } catch (err) {
        console.warn(`\n⚠️  Failed to embed error: ${err.message}`);
      }
    }

    const progress = ((batchIdx + 1) / batches.length * 100).toFixed(1);
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = totalEmbedded / elapsed;
    const remaining = errors.length - totalEmbedded;
    const eta = Math.ceil(remaining / rate);

    process.stdout.write(`\r   Progress: ${progress}% | ${totalEmbedded.toLocaleString()} / ${errors.length.toLocaleString()} | Rate: ${rate.toFixed(1)}/s | ETA: ${eta}s`);
  }

  console.log('\n\n✅ Re-embedding complete!\n');

  // Print statistics
  const stats = await db.query(`
    SELECT
      source,
      COUNT(*) as total_chunks,
      COUNT(*) FILTER (WHERE embedding IS NOT NULL) as embedded_chunks
    FROM raw_error_embeddings
    GROUP BY source
    ORDER BY source
  `);

  console.log('📊 Updated Statistics:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Source         | Total   | Embedded');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  for (const row of stats.rows) {
    const src = (row.source || '').padEnd(14);
    const total = row.total_chunks.toString().padStart(7);
    const embedded = row.embedded_chunks.toString().padStart(8);
    console.log(`${src} | ${total} | ${embedded}`);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const allStats = await db.query(`
    SELECT COUNT(*) as total FROM raw_error_embeddings
  `);
  console.log(`\nTotal errors: ${allStats.rows[0].total.toLocaleString()}`);

  await db.end();

  console.log('\n⏭️  Next: Rebuild top-K index with new data');
  console.log('   1. Clear index: docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -c "TRUNCATE error_topk_index"');
  console.log('   2. Rebuild: node scripts/phase89-build-topk-index.mjs 20');
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
