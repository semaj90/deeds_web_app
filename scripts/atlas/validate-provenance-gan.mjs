#!/usr/bin/env node
/**
 * Provenance GAN Validator (P2)
 *
 * Purpose: Validate provenance chain integrity for P2 breadth proof.
 * Ensures trace_id, story_id, task_id, worker_id, replay_id chain is unbroken.
 *
 * Usage:
 *   npm run atlas:validate:provenance-gan -- --story-id=ATLAS-P2-VERIFY --limit=1000
 */

const STORY_ID = process.argv.find(a => a.startsWith('--story-id='))?.split('=')[1];
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '1000');
const VERBOSE = process.argv.includes('--verbose');
const APPLY = process.argv.includes('--apply');

if (!STORY_ID) {
  console.error('❌ Missing --story-id');
  process.exit(1);
}

async function validateProvenance() {
  const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

  try {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({
      connectionString: DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 5000
    });

    try {
      console.log(`
╔════════════════════════════════════════════════════════════════╗
║         Provenance GAN Validator (P2)                          ║
╚════════════════════════════════════════════════════════════════╝

Story ID:  ${STORY_ID}
Limit:     ${LIMIT} packets
Mode:      ${APPLY ? 'APPLY' : 'AUDIT'}
Timestamp: ${new Date().toISOString()}

`);

      // 1. Audit atlas_story_proofs for required fields
      console.log('📋 Checking atlas_story_proofs structure...\n');

      const proofsRes = await pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN proof_data->>'story_id' IS NOT NULL THEN 1 END) as has_story_id,
          COUNT(CASE WHEN proof_data->>'task_id' IS NOT NULL THEN 1 END) as has_task_id,
          COUNT(CASE WHEN proof_data->>'worker_id' IS NOT NULL THEN 1 END) as has_worker_id,
          COUNT(CASE WHEN proof_data->>'trace_id' IS NOT NULL THEN 1 END) as has_trace_id,
          COUNT(CASE WHEN proof_data->>'replay_id' IS NOT NULL THEN 1 END) as has_replay_id
        FROM atlas_story_proofs
        WHERE story_id LIKE $1 || '%'
        LIMIT $2
      `, [STORY_ID, LIMIT]);

      const proofs = proofsRes.rows[0];
      console.log(`Total proofs:        ${proofs.total}`);
      console.log(`  ✓ With story_id:   ${proofs.has_story_id} (${(proofs.has_story_id/proofs.total*100).toFixed(1)}%)`);
      console.log(`  ✓ With task_id:    ${proofs.has_task_id} (${(proofs.has_task_id/proofs.total*100).toFixed(1)}%)`);
      console.log(`  ✓ With worker_id:  ${proofs.has_worker_id} (${(proofs.has_worker_id/proofs.total*100).toFixed(1)}%)`);
      console.log(`  ✓ With trace_id:   ${proofs.has_trace_id} (${(proofs.has_trace_id/proofs.total*100).toFixed(1)}%)`);
      console.log(`  ✓ With replay_id:  ${proofs.has_replay_id} (${(proofs.has_replay_id/proofs.total*100).toFixed(1)}%)\n`);

      // 2. Check for missing trace_id (critical)
      console.log('🔍 Critical: Checking for missing trace_id...\n');
      const missingTraceRes = await pool.query(`
        SELECT COUNT(*) as count
        FROM atlas_story_proofs
        WHERE story_id LIKE $1 || '%'
          AND (proof_data->>'trace_id' IS NULL OR proof_data->>'trace_id' = '')
        LIMIT $2
      `, [STORY_ID, LIMIT]);

      const missingTrace = missingTraceRes.rows[0].count;
      if (missingTrace > 0) {
        console.log(`⚠️  ${missingTrace} proofs missing trace_id (CRITICAL)\n`);
      } else {
        console.log(`✅ All proofs have trace_id\n`);
      }

      // 3. Check for orphaned packets (packet_key without source_ref)
      console.log('🔎 Checking for orphaned packets...\n');
      const orphanedRes = await pool.query(`
        SELECT COUNT(*) as count
        FROM atlas_packets
        WHERE packet_key IS NOT NULL
          AND (source_ref IS NULL OR source_ref = '')
        LIMIT $1
      `, [LIMIT]);

      const orphaned = orphanedRes.rows[0].count;
      if (orphaned > 0) {
        console.log(`⚠️  ${orphaned} packets have packet_key but missing source_ref\n`);
      } else {
        console.log(`✅ No orphaned packets found\n`);
      }

      // 4. Check for duplicate replay_id (should be unique per run)
      console.log('🔄 Checking for duplicate replay_id...\n');
      const duplicateReplayRes = await pool.query(`
        SELECT
          proof_data->>'replay_id' as replay_id,
          COUNT(*) as count
        FROM atlas_story_proofs
        WHERE story_id LIKE $1 || '%'
          AND proof_data->>'replay_id' IS NOT NULL
        GROUP BY proof_data->>'replay_id'
        HAVING COUNT(*) > 1
        LIMIT 20
      `, [STORY_ID]);

      const duplicateReplays = duplicateReplayRes.rows;
      if (duplicateReplays.length > 0) {
        console.log(`⚠️  Found ${duplicateReplays.length} duplicate replay_ids:\n`);
        duplicateReplays.forEach(dup => {
          console.log(`   - ${dup.replay_id}: ${dup.count} occurrences`);
        });
        console.log('');
      } else {
        console.log(`✅ No duplicate replay_ids\n`);
      }

      // 5. Check for cache contradictions
      console.log('📊 Checking for cache contradictions...\n');
      const cacheContradictRes = await pool.query(`
        SELECT
          COUNT(CASE WHEN proof_data->>'cache_hit_source' = 'redis'
                      AND proof_data->>'retrieval_strategy' NOT LIKE '%cache%'
                   THEN 1 END) as cache_hit_without_cache_strategy,
          COUNT(CASE WHEN proof_data->>'cache_namespace' IS NULL
                      AND proof_data->>'cache_hit_source' IS NOT NULL
                   THEN 1 END) as cache_hit_without_namespace
        FROM atlas_story_proofs
        WHERE story_id LIKE $1 || '%'
        LIMIT $2
      `, [STORY_ID, LIMIT]);

      const cacheContradicts = cacheContradictRes.rows[0];
      let contradictions = 0;
      if (cacheContradicts.cache_hit_without_cache_strategy > 0) {
        console.log(`⚠️  ${cacheContradicts.cache_hit_without_cache_strategy} cache hits without cache strategy`);
        contradictions += cacheContradicts.cache_hit_without_cache_strategy;
      }
      if (cacheContradicts.cache_hit_without_namespace > 0) {
        console.log(`⚠️  ${cacheContradicts.cache_hit_without_namespace} cache hits without namespace`);
        contradictions += cacheContradicts.cache_hit_without_namespace;
      }
      if (contradictions === 0) {
        console.log(`✅ No cache contradictions\n`);
      } else {
        console.log('');
      }

      // 6. Compute validation score
      const totalChecks = 5;
      let passedChecks = 0;

      if (proofs.has_trace_id === proofs.total) passedChecks++;
      if (orphaned === 0) passedChecks++;
      if (duplicateReplays.length === 0) passedChecks++;
      if (contradictions === 0) passedChecks++;
      if (proofs.has_story_id === proofs.total) passedChecks++;

      const score = (passedChecks / totalChecks * 100).toFixed(1);
      const verdict = score >= 95 ? 'PASS' : 'REVIEW';

      console.log(`═════════════════════════════════════════════════════════════════\n`);
      console.log(`Provenance Score: ${score}% (${passedChecks}/${totalChecks} checks passed)`);
      console.log(`Verdict: ${verdict}\n`);

      // 7. Record proof if APPLY
      if (APPLY) {
        console.log('📋 Recording provenance validation proof...\n');

        const proofData = JSON.stringify({
          validator: 'validate-provenance-gan',
          timestamp: new Date().toISOString(),
          checks_passed: passedChecks,
          checks_total: totalChecks,
          score: parseFloat(score),
          verdict: verdict,
          details: {
            missing_trace_id: missingTrace,
            orphaned_packets: orphaned,
            duplicate_replays: duplicateReplays.length,
            cache_contradictions: contradictions
          }
        });

        await pool.query(`
          INSERT INTO atlas_story_proofs (story_id, stage, action, proof_data)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (story_id, stage, action) DO UPDATE
            SET proof_data = $4
        `, [
          STORY_ID,
          'provenance_validation',
          'gan_check',
          proofData
        ]);

        console.log(`✅ Provenance validation proof recorded\n`);
      }

    } finally {
      await pool.end();
    }

  } catch (err) {
    console.error('❌ Provenance validation failed:', err.message);
    if (VERBOSE) console.error(err.stack);
    process.exit(1);
  }
}

validateProvenance();
