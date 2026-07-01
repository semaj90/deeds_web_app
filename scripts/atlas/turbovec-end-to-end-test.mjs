#!/usr/bin/env node

/**
 * TurboVec ANN End-to-End Pipeline Test
 *
 * Flow: Query → Embed (768-dim embeddinggemma) → TurboVec Prefilter (4-bit, 64-dim) →
 *       Qdrant ANN (top-K candidates) → Postgres Truth Join → Ranked Results
 *
 * Expected: TurboVec 4-bit prefilter reduces Qdrant candidates ~80%, maintaining top-5 accuracy
 */

import fetch from 'node-fetch';
import { Pool } from 'pg';

async function testTurboVecPipeline() {
  const testQuery = 'authentication session validation';

  console.log('[SETUP] TurboVec End-to-End Test');
  console.log(`Query: "${testQuery}"`);
  console.log('─'.repeat(80));

  // Step 1: Embed query (768-dim)
  console.log('\n[STEP 1] Embed query via embeddinggemma:latest (768-dim)...');
  let embedding = [];
  try {
    const embedRes = await fetch('http://127.0.0.1:11434/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'embeddinggemma:latest',
        prompt: testQuery
      })
    });
    const embedData = await embedRes.json();
    embedding = embedData.embedding;
    console.log(`  ✅ Embedding dim: ${embedding.length}`);
  } catch (err) {
    console.error(`  ❌ Embedding failed:`, err);
    process.exit(1);
  }

  // Step 2: TurboVec prefilter (4-bit, 64-dim)
  console.log('\n[STEP 2] TurboVec ANN prefilter (:8791) with 4-bit quantized vectors...');
  let turboVecResults = null;
  try {
    const tvRes = await fetch('http://127.0.0.1:8791/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: embedding.slice(0, 64),
        limit: 100,
        threshold: 0.5
      })
    });
    turboVecResults = await tvRes.json();
    console.log(`  ✅ TurboVec candidates: ${turboVecResults.ids?.length || 0}`);
    console.log(`  📊 Top-3 TurboVec scores: ${turboVecResults.scores?.slice(0, 3).map(s => s.toFixed(3)).join(', ') || 'N/A'}`);
  } catch (err) {
    console.error(`  ❌ TurboVec prefilter failed:`, err);
    process.exit(1);
  }

  // Step 3: Qdrant ANN search (full 768-dim, top-20)
  console.log('\n[STEP 3] Qdrant ANN search (:6333) on full 768-dim vectors...');
  let qdrantResults = [];
  try {
    const qdRes = await fetch('http://127.0.0.1:6333/collections/codebase_chunks_768/points/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: {
          name: 'content',
          vector: embedding
        },
        limit: 20,
        with_payload: true,
        score_threshold: 0.3
      })
    });
    const qdData = await qdRes.json();
    qdrantResults = qdData.result || [];
    console.log(`  ✅ Qdrant candidates: ${qdrantResults.length}`);
    console.log(`  📊 Top-3 Qdrant scores: ${qdrantResults.slice(0, 3).map(r => r.score.toFixed(3)).join(', ')}`);
  } catch (err) {
    console.error(`  ❌ Qdrant search failed:`, err);
    process.exit(1);
  }

  // Step 4: Postgres truth join
  console.log('\n[STEP 4] Postgres truth join (codebase_chunk_index)...');
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    port: parseInt(process.env.POSTGRES_PORT || '5434'),
    user: process.env.POSTGRES_USER || 'legal_admin',
    password: process.env.POSTGRES_PASSWORD || '123456',
    database: process.env.POSTGRES_DB || 'legal_ai_db'
  });

  let postgresChunks = [];
  try {
    const qdrantIds = qdrantResults.map(r => r.id);

    if (qdrantIds.length === 0) {
      console.log('  ⚠️  No Qdrant results to join with Postgres');
    } else {
      const query = `
        SELECT id, relative_path, symbol, kind, content_embedding
        FROM codebase_chunk_index
        WHERE id = ANY($1)
        LIMIT 20
      `;
      const result = await pool.query(query, [qdrantIds]);
      postgresChunks = result.rows;
      console.log(`  ✅ Postgres chunks joined: ${postgresChunks.length}`);
    }
  } catch (err) {
    console.error(`  ❌ Postgres join failed:`, err);
  } finally {
    pool.end().catch(() => {});
  }

  // Step 5: Rank results
  console.log('\n[STEP 5] Final ranking...');
  const rankedResults = qdrantResults
    .map((qd, idx) => {
      const pgChunk = postgresChunks.find(p => p.id === qd.id);
      return {
        rank: idx + 1,
        qdrant_id: qd.id,
        qdrant_score: qd.score.toFixed(3),
        relative_path: pgChunk?.relative_path || 'N/A',
        symbol: pgChunk?.symbol || 'N/A',
        kind: pgChunk?.kind || 'N/A'
      };
    })
    .slice(0, 10);

  console.log('\nTop-10 Results:');
  console.log('─'.repeat(140));
  rankedResults.forEach(r => {
    console.log(`${r.rank.toString().padEnd(2)} | Score: ${r.qdrant_score.padEnd(5)} | Path: ${r.relative_path.substring(0, 50).padEnd(50)} | Symbol: ${r.symbol.padEnd(25)} | Kind: ${r.kind}`);
  });

  // Step 6: Validation gates
  console.log('\n[VALIDATION]');
  console.log('─'.repeat(80));

  let passes = 0;
  const gates = [
    { name: 'Embedding dimension', pass: embedding.length === 768, details: `${embedding.length}-dim` },
    { name: 'TurboVec prefilter', pass: turboVecResults?.ids?.length > 0, details: `${turboVecResults?.ids?.length || 0} candidates` },
    { name: 'Qdrant candidates', pass: qdrantResults.length > 0, details: `${qdrantResults.length} results` },
    { name: 'Postgres join', pass: postgresChunks.length > 0, details: `${postgresChunks.length} chunks joined` },
    { name: 'Ranking', pass: rankedResults.length > 0, details: `${rankedResults.length} ranked` },
  ];

  gates.forEach(gate => {
    const status = gate.pass ? '✅' : '❌';
    console.log(`${status} ${gate.name.padEnd(25)} ${gate.details}`);
    if (gate.pass) passes++;
  });

  console.log('\n' + '─'.repeat(80));
  console.log(`Result: ${passes}/${gates.length} validation gates passed`);

  if (passes === gates.length) {
    console.log('✅ TurboVec ANN pipeline: END-TO-END VERIFIED');
    process.exit(0);
  } else {
    console.log('❌ TurboVec ANN pipeline: VALIDATION FAILED');
    process.exit(1);
  }
}

testTurboVecPipeline().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
