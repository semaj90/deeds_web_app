import fetch from 'node-fetch';
import { Pool } from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';

await loadAtlasEnv();

const QDRANT_URL = 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = 'codebase_chunks_768_v2';
const PG_URL = process.env.DATABASE_URL;

if (!PG_URL) {
  console.error('[FAIL] DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({ connectionString: PG_URL });

// Fetch a random Postgres vector for self-query test
async function fetchTestVector() {
  console.log('📍 Fetching test vector from Postgres...');
  
  const res = await pool.query(`
    SELECT id, relative_path, content_embedding::text AS embedding_text
    FROM codebase_chunk_index
    WHERE content_embedding IS NOT NULL
    ORDER BY RANDOM()
    LIMIT 1
  `);

  if (res.rows.length === 0) throw new Error('No vectors found in Postgres');
  
  const row = res.rows[0];
  const embedding = JSON.parse(row.embedding_text);
  
  console.log(`   ✅ Test vector: ${row.relative_path} (ID: ${row.id})`);
  console.log(`      Dimension: ${embedding.length}`);
  
  return { id: row.id, path: row.relative_path, embedding };
}

// Query Qdrant with the test vector using named vector
async function queryQdrant(embedding) {
  console.log('\n📍 Querying Qdrant with test vector...');
  
  const payload = {
    query: embedding,
    using: 'content',
    limit: 10,
    with_payload: true,
    score_threshold: 0.35
  };
  
  const res = await fetch(
    `${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/query`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Qdrant search failed: HTTP ${res.status}: ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  const results = data.result?.points ?? [];
  
  console.log(`   ✅ Retrieved ${results.length} results (score_threshold 0.35)`);
  return results;
}

// Main test
async function main() {
  try {
    const testVector = await fetchTestVector();
    const results = await queryQdrant(testVector.embedding);

    console.log('\n🔍 Self-Query Results:');
    console.log(`   Top result ID: ${results[0]?.id ?? 'N/A'}`);
    console.log(`   Top result score: ${results[0]?.score?.toFixed(6) ?? 'N/A'}`);
    console.log(`   Test vector ID: ${testVector.id}`);
    
    // Check if test vector appears near top
    const testVectorRank = results.findIndex(r => String(r.id) === String(testVector.id)) + 1;
    
    if (testVectorRank === 0) {
      console.log(`   ⚠️  Test vector not in top 10 results`);
    } else if (testVectorRank === 1) {
      console.log(`   ✅ Test vector ranked #1 (perfect self-match)`);
    } else {
      console.log(`   ⚠️  Test vector ranked #${testVectorRank}`);
    }

    // Print all results
    console.log('\n📋 Full ranking:');
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const marker = String(r.id) === String(testVector.id) ? ' ← TEST VECTOR' : '';
      console.log(`   ${i + 1}. Score: ${r.score.toFixed(6)}, ID: ${r.id}${marker}`);
    }

    // Validation gate
    const passed = testVectorRank === 1 && results[0].score > 0.99;
    
    if (passed) {
      console.log('\n✅ SEMANTIC SEARCH PROOF PASSED');
      console.log('   Test vector ranks #1 with similarity > 0.99');
    } else {
      console.log('\n❌ SEMANTIC SEARCH PROOF FAILED');
      console.log(`   Expected: rank #1, similarity > 0.99`);
      console.log(`   Actual: rank #${testVectorRank}, similarity ${results[0]?.score?.toFixed(6) ?? 'N/A'}`);
    }

    await pool.end();
    process.exit(passed ? 0 : 1);
  } catch (err) {
    console.error('❌ Test failed:', err.message);
    await pool.end();
    process.exit(1);
  }
}

main();
