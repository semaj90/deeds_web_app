#!/usr/bin/env node
/**
 * Phase 89: Similarity Ranker & Agentic Fixer
 *
 * Pipeline:
 * 1. Take error query (text or ID)
 * 2. Generate query embedding
 * 3. Find top-K similar errors (cosine similarity)
 * 4. Extract patterns from similar errors
 * 5. Use LLM to generate fix with context
 *
 * Usage:
 *   node scripts/phase89-similarity-ranker.mjs "TS1005 missing comma"
 *   node scripts/phase89-similarity-ranker.mjs --id 12345
 */

import ollama from 'ollama';
import pg from 'pg';
import { createClient } from 'redis';
import { getJson, setJson, sha256 } from './lib/phase89-cache.mjs';
import { embedCached } from './lib/phase89-embed.mjs';
import { fuseRRF } from './lib/phase89-rrf.mjs';
import { callLLM, setProvider } from './llm-router.mjs';

const { Pool } = pg;

const CONFIG = {
  postgres: {
    host: '127.0.0.1',
    port: 5434,
    database: 'legal',
    user: 'user',
    password: 'pass'
  },
  redis: {
    url: 'redis://127.0.0.1:6379'
  },
  ollama: {
    host: 'http://localhost:11434',
    embeddingModel: 'embeddinggemma:latest',
    chatModel: 'gemma3-legal:latest'
  },
  search: {
    topK: 50, // Find 50 similar errors
    minSimilarity: 0.7 // Cosine similarity threshold
  }
};

let db;
let redis;

async function main() {
  const args = process.argv.slice(2);

  // Connect
  db = new Pool(CONFIG.postgres);
  redis = createClient({ url: CONFIG.redis.url });
  await redis.connect();
  console.log('✅ Connected to DB & Redis');

  if (args.includes('--auto')) {
    await runAutoMode();
    return;
  }

  if (args.length === 0) {
    console.log('Usage:');
    console.log('  node scripts/phase89-similarity-ranker.mjs "error description"');
    console.log('  node scripts/phase89-similarity-ranker.mjs --id 12345');
    console.log('  node scripts/phase89-similarity-ranker.mjs --auto (Find top errors & web search)');
    process.exit(0);
  }

  let queryText;
  let queryEmbedding;

  // Check if querying by ID
  if (args[0] === '--id') {
    const errorId = parseInt(args[1]);
    console.log(`🔍 Finding similar errors to ID ${errorId}...\n`);

    const result = await db.query(`
      SELECT raw_text, embedding FROM raw_error_embeddings WHERE id = $1
    `, [errorId]);

    if (result.rows.length === 0) {
      console.error('❌ Error ID not found');
      process.exit(1);
    }

    queryText = result.rows[0].raw_text;
    queryEmbedding = result.rows[0].embedding;

  } else {
    // Query by text
    queryText = args.join(' ');
    console.log(`🔍 Finding similar errors to: "${queryText}"\n`);

    // Check if this looks like an error code (e.g., "TS2345")
    const errorCodeMatch = queryText.match(/TS\d+/);

    if (errorCodeMatch) {
      const errorCode = errorCodeMatch[0];

      // Try exact match first
      const exactMatch = await db.query(`
        SELECT id, raw_text, embedding
        FROM raw_error_embeddings
        WHERE raw_text LIKE $1
        LIMIT 1
      `, [`%${errorCode}%`]);

      if (exactMatch.rows.length > 0) {
        console.log(`✅ Found exact match for ${errorCode} in database`);
        queryText = exactMatch.rows[0].raw_text;
        queryEmbedding = exactMatch.rows[0].embedding;
      } else {
        // No exact match - use semantic fallback with error code template
        console.log(`⚠️  No exact match for ${errorCode} in database`);
        console.log(`💡 Falling back to semantic search with template query\n`);

        // Generate template query based on error code
        const templates = {
          'TS2345': "Type 'X' is not assignable to type 'Y'",
          'TS2322': "Type 'X' is not assignable to parameter of type 'Y'",
          'TS2339': "Property 'X' does not exist on type 'Y'",
          'TS1005': "';' expected - missing semicolon or brace",
          'TS7006': "Parameter 'X' implicitly has an 'any' type",
          'TS2304': "Cannot find name 'X'"
        };

        queryText = templates[errorCode] || queryText;
        console.log(`   Using template: "${queryText}"`);

        const embedding = await embedCached({
          rds: redis,
          text: queryText,
          model: CONFIG.ollama.embeddingModel,
          ollamaUrl: CONFIG.ollama.host
        });

        queryEmbedding = JSON.stringify(embedding);
      }
    } else {
      // Regular text query - generate embedding
      const embedding = await embedCached({
        rds: redis,
        text: queryText,
        model: CONFIG.ollama.embeddingModel,
        ollamaUrl: CONFIG.ollama.host
      });

      queryEmbedding = JSON.stringify(embedding);
    }
  }

  // ============================================================
  // Cosine Similarity Search
  // ============================================================
  console.log('📊 Running cosine similarity search...');

  // Get top-K from Redis cache
  const cacheKey = `ret:${sha256(queryText || errorId.toString())}`;
  const cached = await getJson(redis, cacheKey);

  let similarErrors;
  if (cached) {
    console.log(`💾 Retrieved ${cached.length} results from cache\n`);
    similarErrors = { rows: cached };
  } else {
    similarErrors = await db.query(`
      SELECT
        id,
        source,
        raw_text,
        1 - (embedding <=> $1::vector) AS similarity
      FROM raw_error_embeddings
      WHERE embedding IS NOT NULL
        AND 1 - (embedding <=> $1::vector) >= $2
      ORDER BY embedding <=> $1::vector
      LIMIT $3
    `, [queryEmbedding, CONFIG.search.minSimilarity, CONFIG.search.topK]);

    // Cache for 2 hours
    await setJson(redis, cacheKey, similarErrors.rows, 7200);
    console.log(`💾 Cached ${similarErrors.rows.length} results\n`);
  }

  // Fetch ripgrep results for text queries
  let ripgrepResults = [];
  if (queryText) {
    // TODO: Integrate ripgrep search here
    // ripgrepResults = await searchWithRipgrep(queryText);
  }

  // Fuse results with RRF if multiple sources
  if (ripgrepResults.length > 0) {
    similarErrors = { rows: fuseRRF(
      [similarErrors.rows, ripgrepResults],
      [0.7, 0.3] // Weight vector search more than ripgrep
    )};
  }

  console.log(`   Found ${similarErrors.rows.length} similar errors\n`);

  if (similarErrors.rows.length === 0) {
    console.log('❌ No similar errors found. Try lowering minSimilarity in config.');
    await db.end();
    process.exit(0);
  }

  // ============================================================
  // Display Top Matches
  // ============================================================
  console.log('🎯 Top 10 Most Similar Errors:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  for (let i = 0; i < Math.min(10, similarErrors.rows.length); i++) {
    const err = similarErrors.rows[i];
    const similarity = (err.similarity * 100).toFixed(1);
    const preview = err.raw_text.length > 100
      ? err.raw_text.substring(0, 100) + '...'
      : err.raw_text;

    console.log(`\n${i + 1}. Similarity: ${similarity}% | Source: ${err.source} | ID: ${err.id}`);
    console.log(`   ${preview}`);
  }

  // ============================================================
  // Pattern Extraction
  // ============================================================
  console.log('\n\n📋 Extracting Common Patterns...');

  const errorTexts = similarErrors.rows.map(r => r.raw_text).join('\n');

  // Count common error codes
  const errorCodeCounts = {};
  const tsErrorRegex = /TS\d+/g;

  for (const row of similarErrors.rows) {
    const matches = row.raw_text.match(tsErrorRegex);
    if (matches) {
      for (const code of matches) {
        errorCodeCounts[code] = (errorCodeCounts[code] || 0) + 1;
      }
    }
  }

  const topCodes = Object.entries(errorCodeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (topCodes.length > 0) {
    console.log('\n   Top Error Codes:');
    for (const [code, count] of topCodes) {
      console.log(`     ${code}: ${count} occurrences`);
    }
  }

  // Extract file patterns
  const fileMatches = errorTexts.match(/[\w\/-]+\.(ts|svelte|js|mjs)/g) || [];
  const fileCounts = {};

  for (const file of fileMatches) {
    fileCounts[file] = (fileCounts[file] || 0) + 1;
  }

  const topFiles = Object.entries(fileCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (topFiles.length > 0) {
    console.log('\n   Most Affected Files:');
    for (const [file, count] of topFiles) {
      console.log(`     ${file}: ${count} errors`);
    }
  }

  // ============================================================
  // LLM Fix Generation
  // ============================================================
  console.log('\n\n🤖 Generating Fix with LLM...\n');

  const prompt = `You are an expert TypeScript/Svelte developer analyzing error patterns.

Query Error:
${queryText}

Similar Errors Found (${similarErrors.rows.length} total):
${similarErrors.rows.slice(0, 20).map((r, i) => `${i + 1}. ${r.raw_text}`).join('\n')}

Based on these error patterns:
1. What is the root cause?
2. What is the recommended fix?
3. Are there any Svelte 5 migration patterns involved?
4. Provide a code example of the fix

Be concise and actionable.`;

  const response = await ollama.chat({
    model: CONFIG.ollama.chatModel,
    messages: [{ role: 'user', content: prompt }]
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(response.message.content);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await db.end();
  await redis.quit();
  console.log('\n✅ Analysis complete!');
}

/**
 * Auto Mode: Find top error clusters and search for solutions
 */
async function runAutoMode() {
  console.log('\n🤖 Auto Mode: Analyzing Top Error Clusters...');

  // 1. Get sample of errors to cluster
  const result = await db.query('SELECT raw_text FROM raw_error_embeddings LIMIT 10000');
  const errors = result.rows.map(r => r.raw_text);

  // 2. Simple clustering by Error Code (TSxxxx)
  const clusters = {};
  const regex = /(TS\d+|Svelte check error)/;

  for (const err of errors) {
    const match = err.match(regex);
    const key = match ? match[0] : 'Unknown';
    if (!clusters[key]) clusters[key] = { count: 0, example: err };
    clusters[key].count++;
  }

  // 3. Sort by frequency
  const sortedClusters = Object.entries(clusters)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5); // Top 5

  console.log('\n🏆 Top 5 Error Types:');
  for (const [code, data] of sortedClusters) {
    console.log(`   ${code.padEnd(10)}: ${data.count} occurrences`);
  }

  // 4. Search for solutions for top clusters
  console.log('\n🌍 Searching for solutions (Inverse Relations)...');
  setProvider('gemini'); // Use Gemini for web search

  for (const [code, data] of sortedClusters) {
    if (code === 'Unknown') continue;

    console.log(`\n🔍 Investigating: ${code}`);
    const cacheKey = `solution:${code}`;

    // Check Redis
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log('   ✅ Found cached solution');
      // console.log(chalk.gray(JSON.parse(cached).substring(0, 200) + '...'));
      continue;
    }

    // Web Search
    try {
      const prompt = `Explain TypeScript error ${code} and provide a solution. Error example: "${data.example}"`;
      console.log(`   🌐 Searching web for: ${prompt.substring(0, 50)}...`);

      const response = await callLLM(prompt);

      // Cache result
      await redis.set(cacheKey, JSON.stringify(response), { EX: 86400 * 7 }); // 7 days
      console.log('   ✅ Solution found and cached');
      // console.log(chalk.green(response.substring(0, 200) + '...'));

    } catch (err) {
      console.error(`   ❌ Search failed: ${err.message}`);
    }
  }

  await db.end();
  await redis.quit();
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
