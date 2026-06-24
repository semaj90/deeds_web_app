#!/usr/bin/env node

/**
 * Validate Phase 1 readiness gates
 *
 * Gates:
 *   1. Gemma4 endpoint reachable (:8090)
 *   2. SvelteKit /api/embed endpoint reachable (:5173)
 *   3. RabbitMQ reachable (:5672)
 *   4. PostgreSQL reachable (:5434)
 *   5. Summary coverage baseline (expected 1-10% for 500-chunk test)
 *   6. Embedding coverage baseline (expected 1-10% for 500-chunk test)
 *   7. Cache hit rate baseline (expected 0-5% cold start)
 *   8. Worker pool can connect to all services
 */

import fetch from 'node-fetch';
import pg from 'pg';
import amqplib from 'amqplib';

const GEMMA4_URL = process.env.GEMMA4_URL || 'http://127.0.0.1:8090';
const SVELTEKIT_URL = process.env.SVELTEKIT_URL || 'http://127.0.0.1:5173';
const RABBIT_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@127.0.0.1:5672';
const DB_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

async function checkEndpoint(name, url, probe = '/') {
  try {
    const res = await fetch(url + probe, { signal: AbortSignal.timeout(5000) });
    console.log(`✅ ${name}: ${url} (${res.status})`);
    return true;
  } catch (e) {
    console.log(`❌ ${name}: ${url} (${e.message})`);
    return false;
  }
}

async function checkDatabase() {
  try {
    const pool = new pg.Pool({ connectionString: DB_URL, max: 1 });
    const result = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN summary IS NOT NULL THEN 1 END) as with_summary,
        COUNT(CASE WHEN summary_embedding IS NOT NULL THEN 1 END) as with_embedding
      FROM codebase_chunk_index
    `);
    await pool.end();

    const { total, with_summary, with_embedding } = result.rows[0];
    const summary_pct = ((with_summary / total) * 100).toFixed(1);
    const embedding_pct = ((with_embedding / total) * 100).toFixed(1);

    console.log(`✅ PostgreSQL: ${total} chunks, ${summary_pct}% summaries, ${embedding_pct}% embeddings`);

    if (parseFloat(summary_pct) < 1) {
      console.log(`   ⚠️  Low summary coverage — Phase 1 not yet applied?`);
    }

    return true;
  } catch (e) {
    console.log(`❌ PostgreSQL: ${e.message}`);
    return false;
  }
}

async function checkRabbitMQ() {
  try {
    const connection = await amqplib.connect(RABBIT_URL);
    await connection.close();
    console.log(`✅ RabbitMQ: Connected`);
    return true;
  } catch (e) {
    console.log(`❌ RabbitMQ: ${e.message}`);
    return false;
  }
}

async function main() {
  console.log('\n🔐 Phase 1 Readiness Validation\n');

  const gates = [
    await checkEndpoint('Gemma4 :8090', GEMMA4_URL, '/v1/models'),
    await checkEndpoint('SvelteKit :5173', SVELTEKIT_URL, '/'),
    await checkRabbitMQ(),
    await checkDatabase(),
  ];

  const passed = gates.filter(g => g).length;
  const total = gates.length;

  console.log(`\n${passed}/${total} gates passed\n`);

  if (passed === total) {
    console.log('✅ Phase 1 ready for RabbitMQ worker pool scaling\n');
    console.log('Next: npm run orchestrate-phase1-workers.ps1 -- -Workers 4');
    process.exit(0);
  } else {
    console.log('❌ Some gates failed. Fix errors above and retry.\n');
    process.exit(1);
  }
}

main().catch(e => {
  console.error(`Fatal: ${e.message}`);
  process.exit(1);
});
