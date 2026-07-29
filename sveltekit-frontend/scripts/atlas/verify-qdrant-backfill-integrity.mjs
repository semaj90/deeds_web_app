import fetch from 'node-fetch';
import { Pool } from 'pg';

const QDRANT_URL = 'http://127.0.0.1:6333';
const PG_URL = process.env.DATABASE_URL;

if (!PG_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({ connectionString: PG_URL });

async function testSemanticQuery() {
  console.log('🔍 Semantic Query Validation Test');
  console.log('');

  // Load a test embedding from Postgres
  const result = await pool.query(`
    SELECT id, relative_path, content_embedding::text AS embedding_text
    FROM codebase_chunk_index
    WHERE content_embedding IS NOT NULL
    LIMIT 1
  `);

  if (result.rows.length === 0) {
    console.error('❌ No test embedding found');
    await pool.end();
    process.exit(1);
  }

  const testRow = result.rows[0];
  const embedding = JSON.parse(testRow.embedding_text);

  console.log(`✅ Test embedding loaded: ${testRow.relative_path}`);
  console.log(`   ID: ${testRow.id}`);
  console.log(`   Embedding dims: ${embedding.length}`);
  console.log('');

  // Query Qdrant
  console.log('📍 Querying Qdrant for top-10 similar chunks...');
  const qdrantRes = await fetch(
    `${QDRANT_URL}/collections/codebase_chunks_768/points/search?limit=10`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: { name: 'content', data: embedding },
        limit: 10,
        with_payload: true
      })
    }
  );

  if (!qdrantRes.ok) {
    const err = await qdrantRes.text();
    console.error(`❌ Qdrant search failed: ${qdrantRes.status}`);
    console.error(err);
    await pool.end();
    process.exit(1);
  }

  const qdrantData = await qdrantRes.json();
  const topResults = qdrantData.result;

  console.log(`✅ Qdrant returned ${topResults.length} results`);
  console.log('');

  // Validate payload structure
  console.log('📋 Validating payload structure:');
  let validCount = 0;
  for (const hit of topResults) {
    const p = hit.payload;
    const valid =
      p.chunk_id &&
      p.source_ref &&
      p.content_hash &&
      p.qdrant_point_id &&
      p.representation_id === 'semantic_768' &&
      p.model_revision === '2026-07-29';

    if (valid) validCount++;
    const status = valid ? '✅' : '❌';
    console.log(
      `   ${status} Point ${hit.id}: ${p.source_ref || 'no source_ref'}`
    );
  }

  console.log('');
  console.log(`✅ Validation Summary:`);
  console.log(`   Total results: ${topResults.length}`);
  console.log(`   Valid payloads: ${validCount}/${topResults.length}`);
  console.log(`   Success: ${validCount === topResults.length ? 'YES' : 'NO'}`);

  await pool.end();
  process.exit(validCount === topResults.length ? 0 : 1);
}

testSemanticQuery().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
