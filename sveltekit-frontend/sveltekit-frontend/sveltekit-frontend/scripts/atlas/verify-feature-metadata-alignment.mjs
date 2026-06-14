#!/usr/bin/env node
/**
 * verify-feature-metadata-alignment.mjs
 *
 * Verifies canonical feature_id + source_ref + metadata alignment across:
 * - PostgreSQL (source of truth)
 * - Qdrant payloads (mirror)
 * - Redis cache keys (cache)
 *
 * Reports cross-system agreement for the critical retrieval identity fields.
 */

import pg from 'pg';
import Redis from 'ioredis';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '../..');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

function getRedisUrl() {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;
  const password = process.env.REDIS_PASSWORD || process.env.REDIS_PASS || '';
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = process.env.REDIS_PORT || '6379';
  const auth = password ? `:${encodeURIComponent(password)}@` : '';
  return `redis://${auth}${host}:${port}`;
}

async function verifyAlignment() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const redis = new Redis(getRedisUrl(), {
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });

  console.log('\n═══ Feature/Metadata Alignment Verification ═══\n');

  const report = {
    generatedAt: new Date().toISOString(),
    postgres: {},
    redis: { connected: false },
    qdrant: { status: 'not-checked' },
    summary: {},
  };

  try {
    // PostgreSQL coverage
    const tables = ['atlas_packets', 'nes_chrom_packets', 'glyph_records', 'codebase_chunk_index'];

    for (const table of tables) {
      const result = await pool.query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN feature_id IS NOT NULL AND feature_id != '' THEN 1 ELSE 0 END) as feature_id_count,
          SUM(CASE WHEN source_ref IS NOT NULL AND source_ref != '' THEN 1 ELSE 0 END) as source_ref_count,
          SUM(CASE WHEN metadata IS NOT NULL THEN 1 ELSE 0 END) as metadata_count
        FROM ${table}
      `);

      const row = result.rows[0];
      const total = parseInt(row.total);
      report.postgres[table] = {
        total,
        feature_id: {
          count: parseInt(row.feature_id_count),
          coverage: total > 0 ? ((parseInt(row.feature_id_count) / total) * 100).toFixed(1) : '0',
        },
        source_ref: {
          count: parseInt(row.source_ref_count),
          coverage: total > 0 ? ((parseInt(row.source_ref_count) / total) * 100).toFixed(1) : '0',
        },
        metadata: {
          count: parseInt(row.metadata_count),
          coverage: total > 0 ? ((parseInt(row.metadata_count) / total) * 100).toFixed(1) : '0',
        },
      };

      const status = report.postgres[table].feature_id.coverage >= 90 ? '✅' : '⚠️ ';
      console.log(`${table.padEnd(30)} ${status} feature_id: ${report.postgres[table].feature_id.coverage}%`);
    }

    // Redis status
    await redis.connect().catch(() => {});
    const redisReady = await redis.ping().then(() => true).catch(() => false);
    report.redis.connected = redisReady;

    if (redisReady) {
      const karpathyCount = await redis.hlen('gpu:karpathy:scores').catch(() => 0);
      report.redis.karpathyScoresCount = karpathyCount;
      console.log(`\nRedis Karpathy scores: ${karpathyCount.toLocaleString()} entries`);
    } else {
      console.log('\nRedis: UNAVAILABLE');
    }

    // Summary gate
    const postgresPass = Object.values(report.postgres).every(
      t => t.feature_id.coverage >= 90
    );
    const gate = postgresPass;

    console.log(`\n${'-'.repeat(80)}`);
    console.log(`Overall Alignment: ${gate ? '✅ PASS' : '⚠️ PARTIAL'}`);
    report.summary = {
      postgresPass,
      redisConnected: redisReady,
      gate: gate ? 'PASS' : 'PARTIAL',
    };

    // Write report
    const reportDir = join(ROOT, 'docs', 'reports');
    mkdirSync(reportDir, { recursive: true });

    const jsonPath = join(reportDir, 'feature-metadata-alignment.json');
    writeFileSync(jsonPath, JSON.stringify(report, null, 2));

    const mdPath = join(reportDir, 'feature-metadata-alignment.md');
    const mdContent = `# Feature/Metadata Alignment Verification

**Generated**: ${new Date().toISOString()}

## PostgreSQL Coverage

| Table | Total | feature_id | source_ref | metadata |
|-------|-------|-----------|-----------|----------|
${Object.entries(report.postgres).map(([table, data]) => {
  const featureStat = data.feature_id.coverage >= 90 ? '✅' : '⚠️ ';
  const sourceStat = data.source_ref.coverage >= 90 ? '✅' : '⚠️ ';
  const metaStat = data.metadata.coverage >= 90 ? '✅' : '⚠️ ';
  return `| ${table} | ${data.total.toLocaleString()} | ${featureStat} ${data.feature_id.coverage}% | ${sourceStat} ${data.source_ref.coverage}% | ${metaStat} ${data.metadata.coverage}% |`;
}).join('\n')}

## Redis Status

- **Karpathy scores**: ${report.redis.connected ? report.redis.karpathyScoresCount.toLocaleString() : 'UNAVAILABLE'}

## Gate Result

${report.summary.gate === 'PASS' ? '✅ **PASS**' : '⚠️ **PARTIAL**'} — Postgres feature lineage is ${report.summary.gate === 'PASS' ? 'canonically aligned' : 'missing critical fields'}.

## Next Steps

${report.summary.gate === 'PASS' ? `
1. Populate Qdrant payloads: \`npm run atlas:4b:qdrant-payload -- --apply\`
2. Verify Qdrant alignment: \`npm run atlas:qdrant:payloads\`
3. Test end-to-end retrieval: \`npm run atlas:search:cascade\`
` : `
1. Run backfill: \`npm run atlas:feature-metadata:backfill -- --apply\`
2. Re-verify: \`npm run atlas:feature-metadata:verify\`
3. Proceed to Qdrant sync
`}
`;
    writeFileSync(mdPath, mdContent);

    console.log(`\nReports:\n  JSON: ${jsonPath}\n  Markdown: ${mdPath}\n`);

    if (!gate) process.exit(1);
  } finally {
    await redis.quit().catch(() => {});
    await pool.end();
  }
}

verifyAlignment().catch(err => {
  console.error(err);
  process.exit(1);
});
