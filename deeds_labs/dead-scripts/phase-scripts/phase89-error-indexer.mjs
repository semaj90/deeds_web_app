#!/usr/bin/env node
/**
 * Phase 89: Error Indexer
 *
 * Indexes TypeScript/Svelte errors into Postgres with embeddings
 *
 * Usage:
 *   node scripts/phase89-error-indexer.mjs
 *   node scripts/phase89-error-indexer.mjs --reindex  # Clear existing errors first
 */

import { execSync } from 'node:child_process';
import { Pool } from 'pg';
import { createClient } from 'redis';

const CONFIG = {
  postgres: {
    user: 'legal_admin',
    password: '123456',
    host: 'localhost',
    port: 5434,
    database: 'legal_ai_db'
  },
  redis: {
    url: 'redis://localhost:6379'
  },
  ollama: {
    url: 'http://127.0.0.1:11434',
    embeddingModel: 'embeddinggemma:latest'
  }
};

let db, redis;

// ============================================================
// Parse TypeScript Errors
// ============================================================
function parseTypeScriptErrors() {
  console.log('🔍 Running TypeScript compiler...\n');

  let output = '';
  try {
    // This will throw because there are errors, but we capture the output
    output = execSync('npx tsc --noEmit', { encoding: 'utf-8', stdio: 'pipe' });
  } catch (err) {
    // TypeScript errors go to stdout (not stderr!)
    output = err.stdout || err.stderr || '';
  }

  console.log(`📊 Debug: Output length: ${output.length} chars\n`);

  const errors = [];
  const lines = output.split('\n').map(l => l.trim());
  // Regex: File(Line,Col): error Code: Message
  // Matches: src/file.ts(1,1): error TS1234: Message
  const errorPattern = /^(.+?)\((\d+),(\d+)\):\s+(error\s+\w+):\s+(.+)$/;

  console.log(`📊 Debug: Found ${lines.length} lines in output`);
  console.log(`📊 Debug: First 3 lines (trimmed):`);
  for (let i = 0; i < Math.min(3, lines.length); i++) {
    console.log(`   [${i}]: ${lines[i].substring(0, 100)}`);
  }

  let matchCount = 0;
  let skipCount = 0;

  // Test first few lines explicitly
  console.log(`\n📊 Testing first 5 lines explicitly:`);
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const testMatch = lines[i].match(errorPattern);
    console.log(`   Line ${i}: ${testMatch ? 'MATCH' : 'NO MATCH'} - ${lines[i].substring(0, 80)}`);
  }
  console.log();

  for (const lineText of lines) {
    const match = lineText.match(errorPattern);
    if (match) {
      matchCount++;
      const [, file, lineNum, col, errorCode, message] = match;

      // Skip generated files
      if (file.includes('.svelte-kit/') || file.includes('node_modules/') || file.includes('build/')) {
        skipCount++;
        continue;
      }

      errors.push({
        source: file.trim(),
        line: parseInt(lineNum),
        col: parseInt(col),
        errorCode: errorCode.replace('error ', '').trim(),
        message: message.trim(),
        rawText: lineText.trim()
      });
    }
  }

  console.log(`📊 Debug: Total matches: ${matchCount}, Skipped: ${skipCount}, Indexed: ${errors.length}\n`);

  console.log(`   Found ${errors.length} TypeScript errors\n`);
  return errors;
}// ============================================================
// Generate Embedding
// ============================================================
async function generateEmbedding(text) {
  // Check Redis cache first
  const cacheKey = `embed:${text}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      // process.stdout.write(' (cache hit)');
      return JSON.parse(cached);
    }
  } catch (e) {
    // Ignore redis errors
  }

  const response = await fetch(`${CONFIG.ollama.url}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CONFIG.ollama.embeddingModel,
      prompt: text
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama embedding failed: ${response.statusText}`);
  }

  const data = await response.json();
  const embedding = data.embedding;

  // Cache result (valid for 7 days)
  try {
    await redis.setEx(cacheKey, 7 * 24 * 60 * 60, JSON.stringify(embedding));
  } catch (e) {
    // Ignore redis errors
  }

  return embedding;
}

// ============================================================
// Index Errors
// ============================================================
async function indexErrors(errors, reindex = false) {
  if (reindex) {
    console.log('🗑️  Clearing existing errors from database...\n');
    await db.query(`DELETE FROM raw_error_embeddings WHERE source LIKE 'src/%'`);
  }

  console.log('📊 Indexing errors with embeddings...\n');

  let indexed = 0;
  let skipped = 0;

  for (let i = 0; i < errors.length; i++) {
    const error = errors[i];
    const { source, line, col, errorCode, message, rawText } = error;

    process.stdout.write(`   [${i + 1}/${errors.length}] ${source}:${line}:${col} (${errorCode})...`);

    try {
      // Check if already indexed
      const existing = await db.query(`
        SELECT id FROM raw_error_embeddings
        WHERE source = $1 AND line = $2 AND col = $3 AND raw_text = $4
      `, [source, line, col, rawText]);

      if (existing.rows.length > 0) {
        console.log(' ✓ (cached)');
        skipped++;
        continue;
      }

      // Generate embedding
      const embeddingText = `${source}:${line}:${col} ${errorCode}: ${message}`;
      const embedding = await generateEmbedding(embeddingText);

      // Insert into database
      await db.query(`
        INSERT INTO raw_error_embeddings (source, line, col, error_code, raw_text, embedding, indexed_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (source, line, col, raw_text) DO UPDATE
        SET embedding = $6, indexed_at = NOW()
      `, [source, line, col, errorCode, rawText, JSON.stringify(embedding)]);

      console.log(' ✓');
      indexed++;

      // Rate limiting
      if (i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (err) {
      console.log(` ✗ (${err.message})`);
    }
  }

  console.log(`\n✅ Indexing complete!`);
  console.log(`   Indexed: ${indexed}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Total: ${indexed + skipped}\n`);
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('🤖 Phase 89: TypeScript Error Indexer\n');

  const reindex = process.argv.includes('--reindex');

  // Connect to services
  db = new Pool(CONFIG.postgres);
  redis = createClient({ url: CONFIG.redis.url });
  await redis.connect();
  console.log('✅ Connected to Postgres + Redis\n');

  // Parse errors
  const errors = parseTypeScriptErrors();

  if (errors.length === 0) {
    console.log('✅ No errors to index!');
    await cleanup();
    return;
  }

  // Index errors
  await indexErrors(errors, reindex);

  // Cleanup
  await cleanup();
}

async function cleanup() {
  if (db) await db.end();
  if (redis) await redis.quit();
  console.log('👋 Indexer shutdown complete');
}

// Run
main().catch(err => {
  console.error('❌ Error:', err);
  cleanup();
  process.exit(1);
});
