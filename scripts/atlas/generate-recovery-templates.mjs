#!/usr/bin/env node
/**
 * BitFrost Self-Healing Template Generator
 *
 * For every error cluster that has a verified recovery_packet_key, builds a
 * structured diagnostic context payload and warms the BitFrost repair cache.
 *
 * Inputs:  error_cluster_groups (Postgres) — recovery_packet_key resolved by HMM
 *          atlas_packets (Postgres) — community_id, routing_hints, page_rank_score
 *          codebase_chunk_index (Postgres) — relative_path (for file targets)
 * Outputs: bifrost:repair:{error_class}:{model_name} keys (Valkey, 300s TTL)
 *
 * Usage:
 *   node scripts/atlas/generate-recovery-templates.mjs [--dry-run] [--verbose]
 */
import pg from 'pg';
import Redis from 'ioredis';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const CACHE_TTL = 300; // seconds

const env = loadRepoEnv();
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 3 });

const redis = new Redis({
  host: env.REDIS_HOST || '127.0.0.1',
  port: parseInt(env.REDIS_PORT || '6379'),
  password: env.REDIS_PASSWORD || 'redis',
  lazyConnect: true,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});
redis.on('error', () => {});

async function run() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  BitFrost Self-Healing Template Generator                      ║');
  console.log(`║  Mode: ${DRY_RUN ? 'DRY-RUN (no writes)' : 'APPLY'}${' '.repeat(DRY_RUN ? 38 : 43)}║`);
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  if (!DRY_RUN) await redis.connect();

  const client = await pool.connect();
  let warmed = 0;
  let skipped = 0;

  try {
    // Fetch one row per (error_class, model_name) — highest failure_count wins
    const { rows: clusters } = await client.query(`
      SELECT DISTINCT ON (ecg.error_class, ecg.model_name)
        ecg.error_class,
        ecg.model_name,
        ecg.task_id,
        ecg.failure_count,
        ecg.last_seen,
        ecg.recovery_packet_key,
        ecg.recovery_confidence,
        p.community_id,
        p.routing_hints,
        p.page_rank_score,
        p.source_ref,
        cci.relative_path
      FROM error_cluster_groups ecg
      JOIN atlas_packets p ON p.packet_key = ecg.recovery_packet_key
      LEFT JOIN codebase_chunk_index cci
        ON (cci.relative_path = p.source_ref
            OR cci.relative_path = 'sveltekit-frontend/' || p.source_ref
            OR p.source_ref = 'sveltekit-frontend/' || cci.relative_path)
      WHERE ecg.recovery_packet_key IS NOT NULL
      ORDER BY ecg.error_class, ecg.model_name, ecg.failure_count DESC
    `);

    if (clusters.length === 0) {
      console.log('⚠  No error clusters with resolved recovery targets found.');
      console.log('   Run: npm run atlas:mapreduce:apply  to populate error_cluster_groups.');
      return;
    }

    console.log(`🎯 ${clusters.length} verified recovery target(s) found.\n`);

    for (const row of clusters) {
      const keywords = Array.isArray(row.routing_hints)
        ? row.routing_hints.slice(0, 5)
        : [];
      const fileTarget = row.relative_path ?? row.source_ref ?? 'unknown';

      const payload = {
        error_class:          row.error_class,
        model_name:           row.model_name,
        task_id:              row.task_id,
        failure_count:        row.failure_count,
        last_seen:            row.last_seen,
        target_packet:        row.recovery_packet_key,
        recovery_confidence:  row.recovery_confidence,
        file_target:          fileTarget,
        community_id:         row.community_id,
        page_rank_score:      row.page_rank_score,
        strategy:             'TOPOLOGY_AWARE_INJECTION',
        context_hints:        keywords,
        generated_at:         new Date().toISOString(),
        todo_payload: [
          `FIX(bifrost): Resolve ${row.error_class} instability in ${fileTarget}`,
          keywords.length
            ? `VERIFY: Inject topology signatures matching: [${keywords.join(', ')}]`
            : `VERIFY: Inspect packet ${row.recovery_packet_key} for recovery path`,
          `MONITOR: Assert PageRank impact (score: ${row.page_rank_score ?? 'n/a'}, community: ${row.community_id ?? 'global'})`,
        ],
      };

      const cacheKey = `bifrost:repair:${row.error_class}:${row.model_name}`;

      if (VERBOSE) {
        console.log(`📦 ${row.error_class}/${row.model_name}`);
        console.log(`   recovery_packet: ${row.recovery_packet_key} (conf=${row.recovery_confidence})`);
        console.log(`   file_target:     ${fileTarget}`);
        console.log(`   community_id:    ${row.community_id ?? 'none'}`);
        console.log(`   context_hints:   ${keywords.join(', ') || 'none'}`);
        payload.todo_payload.forEach((t) => console.log(`   - ${t}`));
      } else {
        console.log(`  ✓ ${cacheKey} → ${fileTarget} (${keywords.length} hints)`);
      }

      if (!DRY_RUN) {
        await redis.set(cacheKey, JSON.stringify(payload), 'EX', CACHE_TTL);
        warmed++;
      } else {
        skipped++;
      }
    }

    console.log(`\n${DRY_RUN ? '🔎 DRY-RUN' : '🏁 DONE'}: ${DRY_RUN ? skipped : warmed} cache key(s) ${DRY_RUN ? 'would be' : 'warmed'} (TTL=${CACHE_TTL}s).`);
  } finally {
    client.release();
    await pool.end();
    if (!DRY_RUN && redis.status === 'ready') await redis.quit();
  }
}

run().catch((err) => {
  console.error('❌ Template generation failed:', err.message);
  process.exit(1);
});
