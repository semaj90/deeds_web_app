import pg from 'pg';
import Redis from 'ioredis';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const ENV_PATH = resolve(process.cwd(), '.env');
let DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5434/legal_ai_db';
let REDIS_URL = 'redis://127.0.0.1:6379';

if (existsSync(ENV_PATH)) {
  const envContent = readFileSync(ENV_PATH, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
      if (key === 'DATABASE_URL') DATABASE_URL = val;
      if (key === 'REDIS_URL') REDIS_URL = val;
    }
  }
}

async function runTest() {
  console.log('🧪 Seeding mock telemetry events for multi-tenant self-tuning validation...');
  
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const redis = new Redis(REDIS_URL);

  try {
    const client = await pool.connect();
    
    // Clean old mock telemetry events
    await client.query("DELETE FROM llm_synthesis_events WHERE query LIKE 'MOCK_USER_QUERY_%'");
    console.log('🧹 Cleaned old mock telemetry logs.');

    // Seed default thresholds in Redis
    await redis.set('ace:cartridge:42:threshold', '0.70');
    await redis.set('ace:cartridge:99:threshold', '0.70');
    console.log('✅ Reset baseline user thresholds in Redis.');

    // ── User 42 Telemetry ──
    // User 42 has excellent cartridge overlap (e.g. 95% average precision overlap)
    // This should trigger hermes-autotuner to LOWER the exit threshold (maximizing sub-5ms path exits)
    console.log('⚙️ Seeding telemetry events for User 42 (High overlap)...');
    for (let i = 1; i <= 3; i++) {
      await client.query(`
        INSERT INTO llm_synthesis_events 
          (run_id, user_id, query, profile, ace_packet, source_refs, cache_keys, model)
        VALUES (
          $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8
        )
      `, [
        `run_42_${i}`,
        42,
        `MOCK_USER_QUERY_HIGH_OVERLAP_${i}`,
        'developer',
        JSON.stringify({
          retrievalStats: { earlyExit: false },
          seedChunks: [
            { filePath: 'src/lib/server/ace/context-assembler.ts' },
            { filePath: 'src/lib/server/routing/query-router-4x4.ts' }
          ]
        }),
        JSON.stringify([
          'src/lib/server/ace/context-assembler.ts'
        ]), // overlap is 1/1 = 100%!
        JSON.stringify({ cartridge_hit: false }),
        'gemma2:latest'
      ]);
    }

    // ── User 99 Telemetry ──
    // User 99 has very low cartridge overlap (e.g. 20% average precision overlap)
    // This should trigger hermes-autotuner to RAISE the exit threshold (forcing deep Qdrant/Neo4j checks)
    console.log('⚙️ Seeding telemetry events for User 99 (Low overlap)...');
    for (let i = 1; i <= 3; i++) {
      await client.query(`
        INSERT INTO llm_synthesis_events 
          (run_id, user_id, query, profile, ace_packet, source_refs, cache_keys, model)
        VALUES (
          $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8
        )
      `, [
        `run_99_${i}`,
        99,
        `MOCK_USER_QUERY_LOW_OVERLAP_${i}`,
        'legal_counsel',
        JSON.stringify({
          retrievalStats: { earlyExit: false },
          seedChunks: [
            { filePath: 'documents/contracts/stale-contract.md' }
          ]
        }),
        JSON.stringify([
          'documents/contracts/active-contract.md',
          'documents/contracts/addendum-contract.md'
        ]), // overlap is 0/2 = 0%!
        JSON.stringify({ cartridge_hit: false }),
        'gemma2:latest'
      ]);
    }

    client.release();
    console.log('✔️ Database seeding completed.');

    // Run the autotuner
    console.log('\n🚀 Executing Autonomus Hermes Autotuner...');
    execSync('node scripts/atlas/hermes-autotuner.mjs', { stdio: 'inherit' });

    // Validate the results in Redis
    const threshold42 = await redis.get('ace:cartridge:42:threshold');
    const threshold99 = await redis.get('ace:cartridge:99:threshold');

    console.log('\n🎯 --- VERIFICATION RESULT ---');
    console.log(`User 42 Cartridge Threshold: ${threshold42}`);
    console.log(`User 99 Cartridge Threshold: ${threshold99}`);

    if (parseFloat(threshold42) < 0.70 && parseFloat(threshold99) > 0.70) {
      console.log('\n🎉 PASS: Multi-user cartridge threshold isolation validated!');
      console.log('   User 42 (high overlap) optimized exit threshold LOWERED successfully.');
      console.log('   User 99 (low overlap) optimized exit threshold RAISED successfully.');
    } else {
      console.log('\n❌ FAIL: Threshold adaptation is incorrect.');
    }

    // Clean mock telemetry events post-run
    const cleanPool = new pg.Pool({ connectionString: DATABASE_URL });
    const cleanClient = await cleanPool.connect();
    await cleanClient.query("DELETE FROM llm_synthesis_events WHERE query LIKE 'MOCK_USER_QUERY_%'");
    cleanClient.release();
    await cleanPool.end();
    console.log('\n🧹 Cleaned test mock logs.');

  } catch (err) {
    console.error('❌ Test failed with error:', err);
  } finally {
    await pool.end();
    await redis.quit();
  }
}

runTest();
