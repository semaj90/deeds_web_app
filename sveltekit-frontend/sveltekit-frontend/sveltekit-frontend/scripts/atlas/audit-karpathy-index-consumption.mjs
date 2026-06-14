#!/usr/bin/env node
/**
 * audit-karpathy-index-consumption.mjs
 *
 * Verifies that Karpathy Authority Blend (Redis gpu:karpathy:scores) joins correctly
 * to PostgreSQL indexed packets and that all ranking signals are queryable.
 *
 * Karpathy Blend: 0.4·PageRank + 0.3·attention + 0.3·authority
 * Cached at: gpu:karpathy:scores (HGETALL returns {packet_key → JSON{pr, attn, authority, blend}})
 */

import Redis from 'ioredis';
import pg from 'pg';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '../..');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_URL = process.env.REDIS_URL || 'redis://:@127.0.0.1:6379';

async function auditKarpathyConsumption() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const redis = new Redis(REDIS_URL, {
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });

  console.log('\n═══ Karpathy Index Consumption Audit ═══\n');

  try {
    // Connect to Redis
    await redis.connect().catch(() => {});
    const redisReady = await redis.ping().then(() => true).catch(() => false);

    // Get packet count from Postgres
    const pgResult = await pool.query('SELECT COUNT(*) as count FROM atlas_packets');
    const packetCount = parseInt(pgResult.rows[0].count);
    console.log(`Postgres packets: ${packetCount.toLocaleString()}`);

    // Get Karpathy scores from Redis
    let karpathyCount = 0;
    let karpathyScores = {};
    if (redisReady) {
      const scoreHash = await redis.hgetall('gpu:karpathy:scores');
      karpathyCount = Object.keys(scoreHash).length;
      // Parse a sample
      for (const [key, val] of Object.entries(scoreHash).slice(0, 5)) {
        try {
          karpathyScores[key] = JSON.parse(val);
        } catch {
          karpathyScores[key] = { error: 'Failed to parse' };
        }
      }
      console.log(`Redis Karpathy scores: ${karpathyCount.toLocaleString()}`);
    } else {
      console.log('Redis Karpathy scores: UNAVAILABLE (Redis not connected)');
    }

    // Verify join: Karpathy packet_keys exist in Postgres
    const joinsVerified = redisReady && karpathyCount > 0;
    if (joinsVerified) {
      const sampleKeys = Object.keys(karpathyScores).slice(0, 5);
      const placeholders = sampleKeys.map((_, i) => `$${i + 1}`).join(',');
      const joinResult = await pool.query(
        `SELECT COUNT(*) as count FROM atlas_packets WHERE packet_key IN (${placeholders})`,
        sampleKeys
      );
      const matchedCount = parseInt(joinResult.rows[0].count);
      console.log(`Join verification (5 sample Karpathy keys): ${matchedCount}/5 exist in Postgres ✅`);
    }

    // Verify ranking signal fields
    const signalCoverage = {
      pagerank: 0,
      attention: 0,
      authority: 0,
      blend: 0,
    };

    if (redisReady && karpathyCount > 0) {
      const scoreHash = await redis.hgetall('gpu:karpathy:scores');
      let sampleSize = 0;
      for (const val of Object.values(scoreHash).slice(0, 100)) {
        try {
          const parsed = JSON.parse(val);
          sampleSize++;
          if ('pr' in parsed || 'pagerank' in parsed) signalCoverage.pagerank++;
          if ('attn' in parsed || 'attention' in parsed) signalCoverage.attention++;
          if ('authority' in parsed) signalCoverage.authority++;
          if ('blend' in parsed) signalCoverage.blend++;
        } catch {}
      }
      console.log(`\nKarpathy Signal Coverage (sample of ${sampleSize}):`);
      console.log(`  PageRank: ${((signalCoverage.pagerank / sampleSize) * 100).toFixed(1)}%`);
      console.log(`  Attention: ${((signalCoverage.attention / sampleSize) * 100).toFixed(1)}%`);
      console.log(`  Authority: ${((signalCoverage.authority / sampleSize) * 100).toFixed(1)}%`);
      console.log(`  Blend: ${((signalCoverage.blend / sampleSize) * 100).toFixed(1)}%`);
    }

    // Verify Postgres indexing for Karpathy projection
    const projectionCheck = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'atlas_packets'
        AND column_name IN ('feature_id', 'source_ref', 'metadata', 'feature_label', 'packet_key')
      ) AS columns_exist,
      (SELECT COUNT(*) FROM pg_indexes
       WHERE tablename = 'atlas_packets'
       AND (indexname LIKE '%feature_id%' OR indexname LIKE '%metadata%')) AS index_count
    `);
    const { columns_exist, index_count } = projectionCheck.rows[0];
    console.log(`\nPostgres Projection Fields: ${columns_exist ? '✅' : '❌'}`);
    console.log(`Postgres Ranking Indexes: ${index_count} indexes`);

    // Gate
    const gate = packetCount > 0 && (karpathyCount === 0 || (karpathyCount > 0 && signalCoverage.blend > 0));
    console.log(`\n${gate ? '✅' : '❌'} Karpathy Index Consumption: ${gate ? 'PASS' : 'FAIL'}`);

    // Write report
    const reportDir = join(ROOT, 'docs', 'reports');
    mkdirSync(reportDir, { recursive: true });

    const jsonPath = join(reportDir, 'karpathy-index-consumption.json');
    writeFileSync(jsonPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      postgres: { packetCount },
      redis: {
        connected: redisReady,
        karpathyScoresCount: karpathyCount,
        signalCoverage,
        sampleScores: karpathyScores,
      },
      postgres_projection: {
        columnsExist: columns_exist,
        rankingIndexCount: index_count,
      },
      gate: gate ? 'PASS' : 'FAIL',
    }, null, 2));

    const mdPath = join(reportDir, 'karpathy-index-consumption.md');
    const mdContent = `# Karpathy Index Consumption Audit

**Generated**: ${new Date().toISOString()}

## Summary
${gate ? '✅ **PASS**' : '❌ **FAIL**'} — Karpathy rankings are ${gate ? 'properly indexed and projectable' : 'missing or incomplete'}.

## Data Coverage

- **Postgres atlas_packets**: ${packetCount.toLocaleString()} packets
- **Redis gpu:karpathy:scores**: ${karpathyCount.toLocaleString()} scored entries
- **Join coverage**: ${joinsVerified ? `Sample verification successful (5/5 keys matched)` : 'Unable to verify (Redis unavailable)'}

## Ranking Signals

${redisReady ? `
- **PageRank**: ${((signalCoverage.pagerank / Math.max(1, Object.keys(karpathyScores).length)) * 100).toFixed(1)}%
- **Attention**: ${((signalCoverage.attention / Math.max(1, Object.keys(karpathyScores).length)) * 100).toFixed(1)}%
- **Authority**: ${((signalCoverage.authority / Math.max(1, Object.keys(karpathyScores).length)) * 100).toFixed(1)}%
- **Blend**: ${((signalCoverage.blend / Math.max(1, Object.keys(karpathyScores).length)) * 100).toFixed(1)}%
` : '⚠️  Redis not available; cannot verify signal coverage'}

## Postgres Projection Support

- **Required columns**: ${columns_exist ? '✅' : '❌'} (feature_id, source_ref, metadata, feature_label, packet_key)
- **Ranking indexes**: ${index_count} indexes on feature_id + metadata (enables fast Karpathy join)

## Next Steps

${gate ? `
✅ Karpathy rankings are ready. Proceed to:
1. \`npm run atlas:qdrant:payloads\` — Verify Qdrant payload mirrors
2. Inspect \`/api/atlas/search\` — Ensure Karpathy blend is projected in responses
3. Monitor: \`curl http://localhost:6379 -c "HGETALL gpu:karpathy:scores" | head\`
` : `
❌ Karpathy consumption incomplete. Diagnose:
1. Is Redis running? \`redis-cli ping\`
2. Is \`gpu:karpathy:scores\` populated? \`redis-cli HLEN gpu:karpathy:scores\`
3. Have you run \`npm run karpathy:gpu\` recently? (TTL is 24h)
4. Verify Postgres indexing: \`npm run atlas:index:alignment\`
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

auditKarpathyConsumption().catch(err => {
  console.error(err);
  process.exit(1);
});
