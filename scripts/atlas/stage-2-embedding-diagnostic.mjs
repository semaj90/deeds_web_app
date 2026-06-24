#!/usr/bin/env node
/**
 * stage-2-embedding-diagnostic.mjs
 *
 * Diagnostic tool to catch halfvec("{}")  write errors before they hit Postgres.
 *
 * Gate 4: Fix halfvec write failures
 *
 * Issue: Stage 2 is failing with:
 *   invalid input syntax for type halfvec: "{}"
 *
 * This diagnostic captures the embedding object state immediately before DB write.
 */

import pg from 'pg';
import fetch from 'node-fetch';

const PG_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const GEMMA4_URL =
  process.env.GEMMA4_URL ??
  process.env.LLAMA_SERVER_URL ??
  'http://127.0.0.1:8090';

const EMBED_URL =
  process.env.EMBED_URL ??
  'http://127.0.0.1:5173/api/embed';

async function main() {
  console.log('\n🔍 Stage 2 Embedding Diagnostic\n');
  console.log(`GEMMA4_URL: ${GEMMA4_URL}`);
  console.log(`EMBED_URL: ${EMBED_URL}\n`);

  const pool = new pg.Pool({ connectionString: PG_URL, max: 1 });

  try {
    // Get one sample chunk with summary
    const result = await pool.query(`
      SELECT id, relative_path, summary
      FROM codebase_chunk_index
      WHERE summary IS NOT NULL
      AND summary_embedding IS NULL
      LIMIT 1
    `);

    if (!result.rows?.length) {
      console.log('  No chunks without embeddings. Coverage is complete.\n');
      return;
    }

    const chunk = result.rows[0];
    console.log(`Sample chunk: ${chunk.id}`);
    console.log(`  Path: ${chunk.relative_path}`);
    console.log(`  Summary length: ${chunk.summary?.length || 'null'}\n`);

    // Step 1: Call embedding endpoint
    console.log('Step 1: Calling embeddings endpoint...\n');

    const embedRes = await fetch(EMBED_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer mock-token'
      },
      body: JSON.stringify({
        text: chunk.summary,
        model: 'embeddinggemma',
      }),
    });

    console.log(`  Response status: ${embedRes.status}`);
    console.log(`  Response headers: ${JSON.stringify(Object.fromEntries(embedRes.headers))}\n`);

    const embedData = await embedRes.json();
    console.log(`  Response body (first 500 chars):\n  ${JSON.stringify(embedData).slice(0, 500)}\n`);

    // Step 2: Validate the embedding object
    console.log('Step 2: Validating embedding object...\n');

    const embedding = embedData.embedding || embedData.embeddings?.[0];

    console.log(`  embedding type: ${typeof embedding}`);
    console.log(`  Array.isArray(embedding): ${Array.isArray(embedding)}`);
    console.log(`  embedding?.length: ${embedding?.length}`);
    console.log(`  typeof embedding?.length: ${typeof embedding?.length}`);

    if (embedding) {
      console.log(`  First 5 values: ${JSON.stringify(embedding.slice ? embedding.slice(0, 5) : 'not an array')}`);
    } else {
      console.log(`  ⚠️  embedding is null/undefined`);
    }

    console.log();

    // Step 3: Build vector literal and validate
    console.log('Step 3: Building vector literal...\n');

    if (!Array.isArray(embedding) || embedding.length !== 768) {
      console.log(`  ❌ VALIDATION FAILED: embedding is not valid 768-dim array`);
      console.log(`     Actual: ${JSON.stringify(embedding).slice(0, 100)}`);
      console.log();
      return;
    }

    const vectorLiteral = `[${embedding.join(',')}]`;
    console.log(`  Vector literal length: ${vectorLiteral.length}`);
    console.log(`  First 80 chars: ${vectorLiteral.slice(0, 80)}`);
    console.log(`  Last 50 chars: ${vectorLiteral.slice(-50)}`);
    console.log();

    // Step 4: Simulate DB write
    console.log('Step 4: Validating DB write (dry-run)...\n');

    try {
      // Validate the query would work
      const testRes = await pool.query(
        'SELECT $1::halfvec as test',
        [vectorLiteral]
      );
      console.log(`  ✅ halfvec cast successful`);
      console.log(`  Stored value (first 50 chars): ${JSON.stringify(testRes.rows[0].test).slice(0, 50)}`);
    } catch (e) {
      console.log(`  ❌ halfvec cast FAILED: ${e.message}`);
      console.log(`     Attempted to cast: ${vectorLiteral.slice(0, 100)}`);
    }

    console.log();

  } finally {
    await pool.end();
  }
}

main().catch(e => {
  console.error(`\n❌ Fatal: ${e.message}`);
  process.exit(1);
});
