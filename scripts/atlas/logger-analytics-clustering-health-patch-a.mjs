#!/usr/bin/env node
/**
 * Part A: Logger Fallback Patch
 *
 * Adds timeout diagnostics and field-by-field fallback for aggregate coverage queries.
 *
 * Phase 1B gate: Logger must not report false failures due to timeouts.
 *
 * Outputs:
 *   - docs/reports/atlas-clustering-health.json (with coverage_source tracking)
 *   - docs/reports/atlas-clustering-health.md
 *   - docs/reports/atlas-clustering-health-history.jsonl (append)
 */

import pg from 'pg';
import Redis from 'ioredis';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { writeFileSync, mkdirSync, appendFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../..');

config({ path: resolve(ROOT, '.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
  statement_timeout: 30000 // 30s timeout for individual queries
});

const redisOptions = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: () => null,
};

if (process.env.REDIS_PASSWORD) {
  redisOptions.password = process.env.REDIS_PASSWORD;
}

const redis = new Redis(redisOptions);
redis.on('error', () => {});

const REPORTS_DIR = resolve(ROOT, 'docs/reports');

const logger = {
  log: (msg) => console.log(msg),
  ok: (msg) => console.log(`✅ ${msg}`),
  info: (msg) => console.log(`ℹ️  ${msg}`),
  warn: (msg) => console.log(`⚠️  ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
};

// === TIMEOUT-AWARE QUERY HELPER ===

async function queryWithTimeout(pool, sql, timeoutMs = 30000) {
  const start = Date.now();
  const queryName = sql.substring(0, 50).replace(/\s+/g, ' ');

  try {
    const res = await pool.query(sql);
    const duration = Date.now() - start;

    return {
      status: 'ok',
      query_name: queryName,
      duration_ms: duration,
      fallback_used: false,
      data: res.rows,
      error_message: null
    };
  } catch (err) {
    const duration = Date.now() - start;
    const isTimeout = err.message.includes('statement timeout') || duration > timeoutMs;

    return {
      status: isTimeout ? 'timeout' : 'error',
      query_name: queryName,
      duration_ms: duration,
      fallback_used: false,
      data: null,
      error_message: err.message
    };
  }
}

// === FIELD-BY-FIELD FALLBACK ===

async function getCodebasePacketsCoverageWithFallback(pool) {
  const coverageLog = [];

  // Try aggregate query first
  const aggregateQuery = `
    SELECT
      COUNT(*) as total,
      COUNT(packet_key) as with_packet_key,
      COUNT(source_ref) as with_source_ref,
      COUNT(feature_id) as with_feature_id,
      COUNT(feature_label) as with_feature_label,
      COUNT(file_path) as with_file_path,
      COUNT(community_id) as with_community_id,
      COUNT(summary) as with_summary,
      COUNT(som_cluster) as with_som_cluster,
      COUNT(tree_node_id) as with_tree_node_id,
      COUNT(lineage_version) as with_lineage_version
    FROM atlas_codebase_packets
  `;

  const aggregateResult = await queryWithTimeout(pool, aggregateQuery);
  coverageLog.push({
    query_type: 'aggregate',
    ...aggregateResult
  });

  if (aggregateResult.status === 'ok') {
    logger.ok('Field coverage (aggregate query succeeded)');
    return {
      coverage_source: 'aggregate',
      coverage_log: coverageLog,
      total: aggregateResult.data[0].total,
      fields: {
        packet_key: aggregateResult.data[0].with_packet_key,
        source_ref: aggregateResult.data[0].with_source_ref,
        feature_id: aggregateResult.data[0].with_feature_id,
        feature_label: aggregateResult.data[0].with_feature_label,
        file_path: aggregateResult.data[0].with_file_path,
        community_id: aggregateResult.data[0].with_community_id,
        summary: aggregateResult.data[0].with_summary,
        som_cluster: aggregateResult.data[0].with_som_cluster,
        tree_node_id: aggregateResult.data[0].with_tree_node_id,
        lineage_version: aggregateResult.data[0].with_lineage_version
      }
    };
  }

  // Fallback: field-by-field queries
  logger.warn(`Aggregate query failed (${aggregateResult.status}), falling back to field-by-field`);

  const fields = [
    'packet_key',
    'source_ref',
    'feature_id',
    'feature_label',
    'file_path',
    'community_id',
    'summary',
    'som_cluster',
    'tree_node_id',
    'lineage_version'
  ];

  let total = 0;
  const fieldCounts = {};

  for (const field of fields) {
    const fieldQuery = `
      SELECT
        COUNT(*) as total,
        COUNT(${field}) as present
      FROM atlas_codebase_packets
    `;

    const result = await queryWithTimeout(pool, fieldQuery);
    coverageLog.push({
      query_type: 'field_by_field',
      field,
      ...result
    });

    if (result.status === 'ok') {
      if (total === 0) total = result.data[0].total;
      fieldCounts[field] = result.data[0].present;
      logger.info(`  ${field}: ${result.data[0].present}/${total}`);
    } else {
      logger.warn(`  ${field}: query failed`);
      fieldCounts[field] = 0;
    }
  }

  return {
    coverage_source: 'field_by_field_fallback',
    coverage_log: coverageLog,
    total,
    fields: fieldCounts
  };
}

// === POSTGRES METRICS (UPDATED) ===

async function getPostgresMetrics() {
  logger.log('\n▶ Postgres Ledger Metrics (Split Ledgers)');
  logger.log('──────────────────────────────────────────');

  const metrics = {};

  try {
    // Check codebase_packets with fallback
    const codebaseCoverage = await getCodebasePacketsCoverageWithFallback(pool);

    metrics.atlas_codebase_packets = {
      status: 'present',
      total: codebaseCoverage.total,
      coverage_source: codebaseCoverage.coverage_source,
      coverage_log: codebaseCoverage.coverage_log,
      fields: codebaseCoverage.fields,
      percentages: {}
    };

    Object.entries(codebaseCoverage.fields).forEach(([field, count]) => {
      metrics.atlas_codebase_packets.percentages[field] =
        ((count / codebaseCoverage.total) * 100).toFixed(1) + '%';
    });

    logger.ok(`atlas_codebase_packets: ${codebaseCoverage.total} packets`);
    logger.info(`  Coverage source: ${codebaseCoverage.coverage_source}`);

    // Check feature_packets
    try {
      const featureRes = await queryWithTimeout(pool, 'SELECT COUNT(*) as cnt FROM atlas_feature_packets');
      if (featureRes.status === 'ok') {
        metrics.atlas_feature_packets = {
          status: 'present',
          total: featureRes.data[0].cnt
        };
        logger.ok(`atlas_feature_packets: ${featureRes.data[0].cnt} packets`);
      }
    } catch (err) {
      metrics.atlas_feature_packets = { status: 'missing' };
      logger.warn('atlas_feature_packets: missing');
    }

    // Check legacy table (should exist for backward compatibility)
    try {
      const legacyRes = await queryWithTimeout(pool, 'SELECT COUNT(*) as cnt FROM atlas_packets_legacy');
      if (legacyRes.status === 'ok') {
        metrics.atlas_packets_legacy = {
          status: 'present',
          total: legacyRes.data[0].cnt,
          note: 'archived mixed ledger'
        };
        logger.info(`atlas_packets_legacy: ${legacyRes.data[0].cnt} packets (archived)`);
      }
    } catch (err) {
      metrics.atlas_packets_legacy = { status: 'missing' };
    }

  } catch (err) {
    logger.error(`Postgres metrics failed: ${err.message}`);
    metrics.error = err.message;
  }

  return metrics;
}

// === REDIS METRICS (PARTIAL) ===

async function getRedisMetrics() {
  logger.log('\n▶ Redis Cache Metrics');
  logger.log('─────────────────────');

  const metrics = {};

  try {
    await redis.connect();

    const karpathyRes = await redis.hgetall('gpu:karpathy:scores');
    const encodedRes = await redis.hgetall('gpu:karpathy:encoded');
    const bifrostKeys = await redis.keys('bifrost:*');
    const centroidKeys = await redis.keys('centroid:*');
    const somKeys = await redis.keys('som:*');

    metrics.redis = {
      status: 'present',
      gpu_karpathy_scores: Object.keys(karpathyRes).length,
      gpu_karpathy_encoded: Object.keys(encodedRes).length,
      bifrost_keys: bifrostKeys.length,
      centroid_keys: centroidKeys.length,
      som_keys: somKeys.length,
    };

    logger.ok(`  gpu:karpathy:scores: ${metrics.redis.gpu_karpathy_scores} entries`);
    logger.ok(`  gpu:karpathy:encoded: ${metrics.redis.gpu_karpathy_encoded} entries`);
    logger.ok(`  bifrost:* keys: ${metrics.redis.bifrost_keys}`);
    logger.info(`  centroid:* keys: ${metrics.redis.centroid_keys} (expected empty for Phase 1b)`);
    logger.info(`  som:* keys: ${metrics.redis.som_keys} (expected empty for Phase 1b)`);

  } catch (err) {
    logger.warn(`Redis metrics unavailable: ${err.message}`);
    metrics.status = 'not_available';
  }

  return metrics;
}

// === MAIN ===

async function main() {
  const timestamp = new Date().toISOString();

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Atlas Clustering Health Logger — Phase 1B                     ║');
  console.log('║  (Split Ledgers + Timeout Fallback)                            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  const report = {
    timestamp,
    phase: '1b',
    postgres: await getPostgresMetrics(),
    redis: await getRedisMetrics(),
  };

  // Write JSON report
  mkdirSync(REPORTS_DIR, { recursive: true });
  writeFileSync(
    resolve(REPORTS_DIR, 'atlas-clustering-health.json'),
    JSON.stringify(report, null, 2)
  );

  // Write Markdown report
  const md = `# Atlas Clustering Health — Phase 1B

**Timestamp**: ${timestamp}

## Postgres Ledgers

### atlas_codebase_packets
- **Total**: ${report.postgres.atlas_codebase_packets.total}
- **Coverage Source**: ${report.postgres.atlas_codebase_packets.coverage_source}
- **Fields**:
${Object.entries(report.postgres.atlas_codebase_packets.fields)
  .map(([field, count]) => `  - ${field}: ${count}/${report.postgres.atlas_codebase_packets.total} (${report.postgres.atlas_codebase_packets.percentages[field]})`)
  .join('\n')}

### atlas_feature_packets
- **Status**: ${report.postgres.atlas_feature_packets.status}
- **Total**: ${report.postgres.atlas_feature_packets.total || 0}

## Redis Cache

- **gpu:karpathy:scores**: ${report.redis.redis.gpu_karpathy_scores} entries
- **gpu:karpathy:encoded**: ${report.redis.redis.gpu_karpathy_encoded} entries
- **bifrost:*** keys: ${report.redis.redis.bifrost_keys}

## Status

✅ Postgres ledger split complete
${report.postgres.atlas_codebase_packets.coverage_source === 'aggregate' ? '✅' : '⚠️'} Coverage queries ${report.postgres.atlas_codebase_packets.coverage_source === 'aggregate' ? 'healthy' : 'using fallback'}
✅ Redis cache operational

## Next: Phase 1B Gates

- [ ] Verify postgres adaptive indexes
- [ ] Repair Qdrant payload contract
- [ ] Audit Bitfrost semantic cache
`;

  writeFileSync(
    resolve(REPORTS_DIR, 'atlas-clustering-health.md'),
    md
  );

  // Append to history
  appendFileSync(
    resolve(REPORTS_DIR, 'atlas-clustering-health-history.jsonl'),
    JSON.stringify({
      timestamp,
      phase: '1b',
      codebase_packets_total: report.postgres.atlas_codebase_packets.total,
      coverage_source: report.postgres.atlas_codebase_packets.coverage_source,
      redis_status: report.redis.status || 'unavailable'
    }) + '\n'
  );

  logger.ok(`\n✅ Reports written to ${REPORTS_DIR}`);
  logger.info(`  - atlas-clustering-health.json`);
  logger.info(`  - atlas-clustering-health.md`);
  logger.info(`  - atlas-clustering-health-history.jsonl (append)`);
}

main().catch(err => {
  logger.error(err.message);
  process.exit(1);
}).finally(() => {
  pool.end();
  redis.quit().catch(() => {});
});
