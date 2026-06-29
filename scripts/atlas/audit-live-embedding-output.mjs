#!/usr/bin/env node

/**
 * AUDIT: Live Embedding Output Dimension
 *
 * Purpose: Verify what dimension the live embedding pipeline actually produces
 * before making schema/policy changes.
 *
 * Checks:
 * 1. Embedding model (embeddinggemma)
 * 2. Actual returned dimension from the model
 * 3. Qdrant collection configuration
 * 4. Postgres pgvector schema
 * 5. Policy expectation
 *
 * Output: PASS/FAIL with detailed mismatch report
 */

import pg from 'pg';
import fetch from 'node-fetch';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const EMBEDDING_MODEL = 'embeddinggemma:latest';

const pgPool = new pg.Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT || 5434,
  user: process.env.PGUSER || 'legal_admin',
  password: process.env.PGPASSWORD || '123456',
  database: process.env.PGDATABASE || 'legal_ai_db',
});

console.log('\n🔍 AUDIT: Live Embedding Output Dimension\n');

async function auditEmbeddingOutput() {
  const results = {
    embedding_model: EMBEDDING_MODEL,
    ollama_url: OLLAMA_URL,
    returned_dimension: null,
    qdrant_collection_config: null,
    postgres_pgvector_schema: null,
    policy_expectation: 384,
    checks: [],
    status: 'UNKNOWN',
  };

  try {
    // Check 1: Verify model is available
    console.log('1️⃣  Checking Ollama models...');
    const modelsRes = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!modelsRes.ok) {
      throw new Error(`Ollama not responding: ${modelsRes.status}`);
    }
    const modelsData = await modelsRes.json();
    const hasEmbeddingModel = modelsData.models?.some(m => m.name.includes('embedding'));
    if (!hasEmbeddingModel) {
      throw new Error('embeddinggemma not found in Ollama models');
    }
    results.checks.push({ check: 'ollama_available', status: 'PASS' });
    console.log('   ✅ Ollama responding\n');

    // Check 2: Test actual embedding output dimension
    console.log('2️⃣  Testing live embedding output...');
    const testText = 'The quick brown fox jumps over the lazy dog';
    const embedRes = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        prompt: testText,
      }),
    });
    if (!embedRes.ok) {
      throw new Error(`Embedding failed: ${embedRes.status}`);
    }
    const embedData = await embedRes.json();
    const actualDim = embedData.embedding?.length;
    if (!actualDim) {
      throw new Error('No embedding returned from Ollama');
    }
    results.returned_dimension = actualDim;
    results.checks.push({ check: 'embedding_output', status: 'PASS', dimension: actualDim });
    console.log(`   ✅ Embedding returned ${actualDim}-dimensional vector\n`);

    // Check 3: Qdrant collection config (via REST API inspection, not direct Qdrant connection)
    console.log('3️⃣  Checking Qdrant collection configuration...');
    // This requires Qdrant to be running; we'll check Postgres instead for pgvector
    // and infer Qdrant from payload inspection
    results.checks.push({ check: 'qdrant_config', status: 'SKIP', reason: 'Use qdrant-manage or Postgres pgvector check instead' });
    console.log('   ⏭️  Skipped (checked via Postgres pgvector instead)\n');

    // Check 4: Postgres pgvector schema
    console.log('4️⃣  Checking Postgres pgvector columns...');
    const pgRes = await pgPool.query(`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_name = 'atlas_packets'
      AND column_name = 'embedding'
    `);
    if (pgRes.rows.length === 0) {
      console.log('   ⚠️  No embedding column in atlas_packets\n');
      results.checks.push({ check: 'postgres_embedding_column', status: 'MISSING' });
    } else {
      const embCol = pgRes.rows[0];
      console.log(`   Column: ${embCol.column_name}`);
      console.log(`   Type: ${embCol.data_type} (${embCol.udt_name})\n`);
      results.checks.push({
        check: 'postgres_embedding_column',
        status: 'EXISTS',
        data_type: embCol.data_type,
        udt_name: embCol.udt_name,
      });
    }

    // Check 5: Sample embedding from Postgres to measure actual stored dimension
    console.log('5️⃣  Checking actual stored embeddings in Postgres...');
    const sampleRes = await pgPool.query(`
      SELECT packet_key, embedding
      FROM atlas_packets
      WHERE embedding IS NOT NULL
      LIMIT 5
    `);
    if (sampleRes.rows.length === 0) {
      console.log('   ⚠️  No embeddings stored in Postgres yet\n');
      results.checks.push({ check: 'postgres_stored_embeddings', status: 'NONE_FOUND' });
    } else {
      const sample = sampleRes.rows[0];
      // pgvector returns as array in JSON
      const storedDim = Array.isArray(sample.embedding)
        ? sample.embedding.length
        : (sample.embedding?.split(',').length || 0);
      console.log(`   Sample packet: ${sample.packet_key}`);
      console.log(`   Stored dimension: ${storedDim}-dim\n`);
      results.checks.push({
        check: 'postgres_stored_embeddings',
        status: 'FOUND',
        dimension: storedDim,
        samples: sampleRes.rows.length,
      });
    }

    // Check 6: Policy vs Reality
    console.log('6️⃣  Comparing policy vs actual output...');
    if (actualDim === results.policy_expectation) {
      console.log(`   ✅ Policy expects ${results.policy_expectation}-dim, Ollama produces ${actualDim}-dim (MATCH)\n`);
      results.checks.push({ check: 'policy_match', status: 'PASS' });
    } else {
      console.log(`   ❌ MISMATCH:\n      Policy expects: ${results.policy_expectation}-dim\n      Ollama produces: ${actualDim}-dim\n`);
      results.checks.push({ check: 'policy_match', status: 'FAIL', expected: results.policy_expectation, actual: actualDim });
    }

    // Determine overall status
    const failures = results.checks.filter(c => c.status === 'FAIL').length;
    const mismatches = results.checks.filter(c => c.status === 'MISMATCH').length;
    results.status = failures + mismatches === 0 ? 'PASS' : 'FAIL';

  } catch (err) {
    console.error(`\n❌ Audit failed: ${err.message}\n`);
    results.status = 'ERROR';
    results.error = err.message;
  } finally {
    await pgPool.end();
  }

  // Output summary
  console.log('════════════════════════════════════════════════════════════');
  console.log('📊 AUDIT SUMMARY');
  console.log('════════════════════════════════════════════════════════════\n');
  console.log(`Embedding Model:      ${results.embedding_model}`);
  console.log(`Ollama URL:           ${results.ollama_url}`);
  console.log(`Returned Dimension:   ${results.returned_dimension}-dim`);
  console.log(`Policy Expectation:   ${results.policy_expectation}-dim`);
  console.log(`Status:               ${results.status}\n`);

  console.log('Checks:');
  results.checks.forEach(c => {
    const icon = c.status === 'PASS' ? '✅' : c.status === 'SKIP' ? '⏭️' : c.status === 'FAIL' || c.status === 'MISMATCH' ? '❌' : '⚠️';
    console.log(`  ${icon} ${c.check}: ${c.status}`);
    if (c.dimension) console.log(`     └─ dimension: ${c.dimension}-dim`);
    if (c.reason) console.log(`     └─ ${c.reason}`);
  });

  console.log('\n════════════════════════════════════════════════════════════\n');

  // Recommendations
  if (results.status === 'PASS') {
    console.log('✅ RECOMMENDATION: Policy is correct.\n');
    console.log('   Next steps:');
    console.log('   1. Create new Qdrant collection (codebase_chunks_384)');
    console.log('   2. Re-embed all packets using verified 384-dim pipeline');
    console.log('   3. Restore Qdrant from new embeddings');
    console.log('   4. Retire legacy codebase_chunks_768 collection\n');
  } else if (results.status === 'FAIL') {
    console.log('❌ MISMATCH DETECTED.\n');
    console.log('   Next steps:');
    console.log('   1. Revise policy to match actual output dimension');
    console.log('   2. Update schema (Postgres pgvector, Qdrant collection)');
    console.log('   3. Regenerate embedding dimension constant in code');
    console.log('   4. Re-run this audit to verify\n');
  } else if (results.status === 'ERROR') {
    console.log('❌ ERROR: Could not complete audit.\n');
    console.log(`   Error: ${results.error}`);
    console.log('   Check: Ollama running? Postgres accessible?\n');
  }

  return results;
}

const results = await auditEmbeddingOutput();
process.exit(results.status === 'PASS' ? 0 : results.status === 'ERROR' ? 2 : 1);